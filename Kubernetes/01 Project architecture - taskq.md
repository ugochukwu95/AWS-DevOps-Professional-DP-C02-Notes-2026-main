# 01 Project architecture - taskq

## What it is
`taskq` is a tiny job-processing system: clients submit jobs over HTTP, a worker processes them in the background, and PostgreSQL is the queue and the source of truth.

It is small enough to hold in your head and realistic enough to show every Kubernetes concept that matters: a stateless HTTP service, a background process with no inbound traffic, a stateful database, configuration, secrets, probes, scaling, storage and cloud IAM.

```mermaid
flowchart LR
  client[curl] -->|"HTTP :8080"| svcApi[Service api]
  svcApi --> apiPods[api pods]
  apiPods -->|"INSERT / SELECT"| pg[(PostgreSQL)]
  workerPods[worker pods] -->|"claim with SKIP LOCKED"| pg
  workerPods -.->|"EKS stage only"| s3[S3 results bucket]
```

## Components

| Component | Code | Kubernetes kind | Traffic |
| --- | --- | --- | --- |
| **api** | [taskq/cmd/api](taskq/cmd/api/main.go) | Deployment + Service | Inbound HTTP on 8080 |
| **worker** | [taskq/cmd/worker](taskq/cmd/worker/main.go) | Deployment (no Service) | Outbound only, plus a health port on 8081 |
| **PostgreSQL** | `postgres:17` image | Docker container, then StatefulSet | TCP 5432 |
| **db package** | [taskq/internal/db](taskq/internal/db/db.go) | (library) | Shared queries and migrations |

Both binaries are built into **one image** (`/api` and `/worker`). The Deployment's `command` picks which one runs. One image means one build, one scan and one tag to track.

## Data model
One table, created by [internal/db/migrations/001_jobs.sql](taskq/internal/db/migrations/001_jobs.sql):

| Column | Type | Meaning |
| --- | --- | --- |
| `id` | `bigserial` | Job ID |
| `payload` | `jsonb` | Whatever the client sent |
| `status` | `text` | `pending`, `running`, `done`, `failed` |
| `result` | `text` | SHA-256 of the payload (the "work") |
| `attempts` | `int` | How many times a worker claimed it |
| `created_at`, `updated_at` | `timestamptz` | Timestamps |

## Request and job flow
1. `POST /jobs` with `{"payload": {...}}`. The api inserts a row with `status='pending'` and returns `{"id": 42}` (HTTP 201).
2. The worker loops every `POLL_INTERVAL`. It claims one job atomically:

   ```sql
   UPDATE jobs SET status = 'running', attempts = attempts + 1, updated_at = now()
   WHERE id = (
     SELECT id FROM jobs
     WHERE status = 'pending'
        OR (status = 'running' AND updated_at < now() - interval '5 minutes')
     ORDER BY id
     FOR UPDATE SKIP LOCKED
     LIMIT 1
   )
   RETURNING id, payload;
   ```

   - `FOR UPDATE SKIP LOCKED` means two workers never claim the same row, so you can run as many worker replicas as you like.
   - The `running ... 5 minutes` clause reclaims jobs from a worker that was killed mid-job (OOMKilled, node lost). Without it, those jobs would stay stuck forever. You'll see this happen in the drills.
3. The worker "processes" the job: it sleeps `WORK_DURATION`, optionally burns CPU or leaks memory (fault injection), and hashes the payload.
4. In the EKS stage, if `RESULTS_BUCKET` is set, it uploads `results/<id>.txt` to S3.
5. It sets `status='done'` and stores the result. `GET /jobs/42` shows it.

## Endpoints

| Binary | Endpoint | Purpose | Used by |
| --- | --- | --- | --- |
| api | `POST /jobs` | Create a job | Clients |
| api | `GET /jobs/{id}` | Job status and result | Clients |
| api | `GET /healthz` | Process is alive. Always 200 unless the process is wedged | **liveness** probe |
| api | `GET /readyz` | Migrations applied **and** a DB ping within 1s | **readiness** probe |
| api | `GET /metrics` | Prometheus text format: request counts, jobs by status | Prometheus / you |
| worker | `GET /healthz` (port 8081) | 200 if the poll loop ran in the last 30s | **liveness** probe |
| worker | `GET /metrics` (port 8081) | Jobs processed and failed | Prometheus / you |

Why liveness and readiness differ: if Postgres is down, the api should become **not ready** (removed from the Service, so no traffic) but **not** be restarted, because restarting it won't fix Postgres. Getting this wrong causes restart storms during a database outage. Note 06 covers this in depth.

## Configuration contract
Everything is configured with environment variables, so the same image runs on your Mac, in kind and on EKS.

| Variable | Binary | Default | Notes |
| --- | --- | --- | --- |
| `DATABASE_URL` | both | (required) | `postgres://taskq:taskq@postgres.taskq.svc.cluster.local:5432/taskq?sslmode=disable`. Comes from a **Secret** |
| `PORT` | api | `8080` | Listen port |
| `HEALTH_PORT` | worker | `8081` | Health and metrics port |
| `POLL_INTERVAL` | worker | `1s` | How often to look for jobs when idle |
| `WORK_DURATION` | worker | `500ms` | Simulated work per job |
| `BURN_CPU` | worker | `0s` | Busy-loop this long per job (CPU throttling drills) |
| `LEAK_MB_PER_JOB` | worker | `0` | Allocate and **keep** this many MB per job (OOMKilled drills) |
| `RESULTS_BUCKET` | worker | (empty) | S3 bucket. Empty means "don't upload" |
| `AWS_REGION` | worker | (empty) | Needed when `RESULTS_BUCKET` is set |

## Shutdown behaviour
Both binaries handle `SIGTERM`, which is what the kubelet sends when it deletes a pod:
- **api**: stops accepting new connections and finishes in-flight requests (`http.Server.Shutdown`, 10s timeout).
- **worker**: finishes the current job, then exits. If the job takes longer than `terminationGracePeriodSeconds`, the kubelet sends `SIGKILL`, and the 5-minute reclaim rule picks the job up later.

## Migrations
The api applies migrations on startup, in the background, holding a Postgres **advisory lock**, so three api replicas starting at once don't race each other. Until migrations succeed, `/readyz` returns 503. This means:
- Pods start even if Postgres is down. They just aren't ready.
- There's no separate migration Job to order before the Deployment. That keeps Helm and Argo CD simple in weeks 11-13.

## How the project evolves

| Stage | Change | Files |
| --- | --- | --- |
| Week 1 | Run binaries on your Mac against Docker Postgres | `make run-api`, `make run-worker` |
| Week 2 | Run as containers, apply limits | `Dockerfile`, `docker run --memory/--cpus` |
| Weeks 3-4 | Deployments, Services, ConfigMap, Secret, probes | [taskq/k8s](taskq/k8s) |
| Week 5 | Requests and limits, spreading across nodes, PDB | `40-api.yaml`, `50-worker.yaml`, `70-pdb.yaml` |
| Week 6 | Postgres moves into a StatefulSet with a PVC; RBAC | [taskq/k8s/postgres-statefulset](taskq/k8s/postgres-statefulset), `60-rbac.yaml` |
| Weeks 7-10 | EKS, ALB, EBS, S3 with Pod Identity | [taskq/terraform/eks](taskq/terraform/eks) |
| Weeks 11-13 | Helm chart, Argo CD, HPA, upgrades | [taskq/helm/taskq](taskq/helm/taskq) |
| Weeks 14-16 | Fault injection via env vars and broken manifests | [18 Failure drills](18%20Failure%20drills.md) |

## Why it stays this small
What's deliberately **not** here: a service mesh, a message broker, Redis, an ingress controller locally, a secrets operator, or a custom operator. Each of those is worth learning later, but each adds failure modes you can't yet diagnose. The rule for adding anything: you must be able to explain what it does, how it fails, and how you'd notice it failing.

**Check yourself**:
1. What happens to in-flight jobs if you `kubectl delete pod` a worker? What if you `docker stop` the node it runs on?
2. Why is it safe to run 5 worker replicas but would be unsafe without `SKIP LOCKED`?
3. Which endpoint should a load balancer health check use, and why?
