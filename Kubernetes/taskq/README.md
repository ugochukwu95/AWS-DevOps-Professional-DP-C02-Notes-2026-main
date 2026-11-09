# taskq

The project for the [Kubernetes learning path](../README.md): a Go API, a Go worker and PostgreSQL. The design is explained in [01 Project architecture - taskq](../01%20Project%20architecture%20-%20taskq.md).

## Layout

| Path | What | Used from |
| --- | --- | --- |
| `cmd/api`, `cmd/worker` | The two binaries | Week 1 |
| `internal/db` | Queries and embedded SQL migrations | Week 1 |
| `Dockerfile` | One distroless image containing `/api` and `/worker` | Week 2 |
| `kind-config.yaml`, `Makefile` | Local cluster and shortcuts (`make help`) | Week 1 |
| `k8s/` | Plain manifests, applied in filename order | Weeks 3-6 |
| `k8s/postgres-statefulset/` | Postgres inside the cluster | Week 6 |
| `terraform/eks/` | VPC, EKS, IAM, S3 | Weeks 7-10 |
| `helm/taskq/` | The chart that replaces `k8s/` | Weeks 11-13 |
| `argocd/` | Argo CD Application for kind | Weeks 11-13 |
| `k8s/networkpolicy/` | Least-privilege NetworkPolicies (opt-in) | Week 18 (CKA) |
| `cka/node-setup.sh` | Prepares an Ubuntu VM for kubeadm | Week 17 (CKA) |

## Quick start (local)
```bash
make cluster-up      # kind cluster "taskq" with 3 nodes
make pg-up           # Postgres container on the kind Docker network
make build load      # build taskq:dev and copy it into the nodes
make deploy          # apply k8s/
curl -s -XPOST localhost:8080/jobs -d '{"payload":{"hello":"world"}}'
curl -s localhost:8080/jobs/1
```

Without Kubernetes (week 1):
```bash
make pg-up
make run-api         # terminal 1
make run-worker      # terminal 2
```
