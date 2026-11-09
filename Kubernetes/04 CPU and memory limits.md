# 04 CPU and memory limits (Weeks 1-2)

**Goal**: predict what happens when a container hits its CPU or memory limit, produce both failures on purpose, and prove which one happened from evidence rather than guesses.

The one-line version: **CPU is compressible, memory isn't**. Hitting a CPU limit makes you *slow* (throttled). Hitting a memory limit makes you *dead* (OOM killed).

## Concepts

### cgroups v2
Limits are enforced by the kernel through cgroup files. Docker and Kubernetes only write numbers into them.

| File | Meaning | Set by |
| --- | --- | --- |
| `cpu.max` | `quota period`, for example `50000 100000` = 0.5 CPU | `--cpus`, K8s `limits.cpu` |
| `cpu.weight` | Relative share when CPU is contended | K8s `requests.cpu` |
| `cpu.stat` | `nr_periods`, `nr_throttled`, `throttled_usec` | (read it) |
| `memory.max` | Hard limit in bytes. Above it, reclaim, then the OOM kill | `--memory`, K8s `limits.memory` |
| `memory.current` | Current usage, *including page cache* | (read it) |
| `memory.events` | `oom`, `oom_kill` counters | (read it) |

### CPU: the CFS quota and throttling
With `cpu.max = 50000 100000`, the container may use 50ms of CPU time in every 100ms period, **across all its threads**. A Go program with 4 busy goroutines on 4 cores burns that 50ms in 12.5ms and is then **frozen for 87.5ms**. Average CPU usage looks low (50%), but latency spikes by up to 87ms. This is why "CPU usage is fine but p99 latency is terrible" is often throttling.

**Requests vs limits for CPU (preview of note 07)**:
- `requests.cpu` is used for scheduling and sets the share under contention. It never slows you down when the node is idle.
- `limits.cpu` is a hard ceiling that throttles even when the node is idle.
- Many teams set CPU requests but **no CPU limit** for latency-sensitive services. taskq sets a limit so you can see throttling; you'll judge the trade-off yourself in note 07.

### Memory: the OOM killer
When `memory.current` reaches `memory.max`, the kernel reclaims page cache first, and if that isn't enough it **kills a process in the cgroup** with SIGKILL. There's no warning or graceful shutdown. You see:
- Docker: `State.OOMKilled: true`, exit code `137`
- Kubernetes: `Last State: Terminated, Reason: OOMKilled, Exit Code: 137`

Not every 137 is OOM: a SIGKILL after a stop timeout is also 137. Check the `OOMKilled` flag or `memory.events`.

### The Go runtime inside limits

| Setting | What it does | taskq |
| --- | --- | --- |
| `GOMAXPROCS` | Number of OS threads running Go code at once. Since **Go 1.25** the runtime reads the cgroup CPU limit and sets this automatically (for example, 0.5 CPU becomes 1). Older versions used the node's core count, which caused heavy throttling | Automatic (Go 1.27) |
| `GOMEMLIMIT` | A soft memory target: the GC works harder as the heap approaches it, so you don't OOM on garbage that could have been collected | Set from `limits.memory` through the downward API in [40-api.yaml](taskq/k8s/40-api.yaml) |

`GOMEMLIMIT` helps with *garbage*. It can't save you from a real leak (memory that is still referenced), which is exactly what `LEAK_MB_PER_JOB` simulates.

## Lab 4.1: Read the cgroup files
```bash
docker run --rm -it --memory 64m --cpus 0.5 alpine sh
# inside:
cat /sys/fs/cgroup/cpu.max          # 50000 100000
cat /sys/fs/cgroup/memory.max       # 67108864
cat /sys/fs/cgroup/memory.current
cat /sys/fs/cgroup/cpu.stat
```

With cgroup v2 and a private cgroup namespace, the container sees its own cgroup at `/sys/fs/cgroup`.

## Lab 4.2: CPU throttling, on purpose
Run the worker with a tight CPU limit and make every job burn 2s of CPU:

```bash
docker run -d --name w-cpu --network kind --cpus 0.2 \
  -e DATABASE_URL='postgres://taskq:taskq@taskq-pg:5432/taskq?sslmode=disable' \
  -e BURN_CPU=2s -e WORK_DURATION=0s \
  --entrypoint /worker taskq:dev

for i in $(seq 1 10); do curl -s -XPOST localhost:8080/jobs -d "{\"payload\":{\"i\":$i}}"; done
docker stats w-cpu --no-stream          # CPU % pinned near 20%
docker logs w-cpu | tail -5             # each job takes ~10s wall time for 2s of CPU
```

(The api must be running for the `curl`: `make run-api`, or the container from note 02.)

Prove it's throttling and not a slow database. In the VM shell (note 02):

```bash
CG=$(docker inspect -f '{{.Id}}' w-cpu)
cat /sys/fs/cgroup/docker/$CG/cpu.stat 2>/dev/null || find /sys/fs/cgroup -name "*$CG*" -maxdepth 4
# nr_throttled and throttled_usec keep increasing
```

Then rerun with `--cpus 2` and compare job duration. Clean up with `docker rm -f w-cpu`.

## Lab 4.3: OOM kill, on purpose
```bash
docker run -d --name w-oom --network kind --memory 64m \
  -e DATABASE_URL='postgres://taskq:taskq@taskq-pg:5432/taskq?sslmode=disable' \
  -e LEAK_MB_PER_JOB=8 -e WORK_DURATION=100ms \
  --entrypoint /worker taskq:dev

for i in $(seq 1 20); do curl -s -XPOST localhost:8080/jobs -d "{\"payload\":{\"i\":$i}}"; done
docker logs w-oom | grep leaked | tail -3     # total_mb climbing toward 64
docker inspect w-oom --format 'oom={{.State.OOMKilled}} exit={{.State.ExitCode}}'
# oom=true exit=137
```

Now look at the database. A job was claimed but never finished:

```bash
make psql
select id, status, attempts, updated_at from jobs where status = 'running';
```

That row is reclaimed after 5 minutes by the next worker (see the `ClaimJob` query in [internal/db/db.go](taskq/internal/db/db.go)). This is the real-world reason background jobs need **idempotency and timeouts**: a worker can die at any instruction.

Repeat with `-e GOMEMLIMIT=48MiB`. The container still dies, because the memory is a leak, not garbage. Explain why in your journal.

Clean up with `docker rm -f w-oom`.

## Lab 4.4: Process limits
```bash
docker run --rm --pids-limit 20 alpine sh -c 'for i in $(seq 1 50); do sleep 100 & done; wait'
# "can't fork: Resource temporarily unavailable"
```

The kubelet sets a similar per-pod PID limit (`podPidsLimit`). A fork bomb in one pod shouldn't take down a node.

## Summary table

| Limit hit | What happens | Evidence |
| --- | --- | --- |
| CPU limit | Throttled: slow, latency spikes, probe timeouts | `cpu.stat nr_throttled`, `docker stats` pinned at the limit |
| Memory limit | SIGKILL, exit 137 | `OOMKilled: true`, `memory.events oom_kill` |
| Node memory pressure (Kubernetes) | **Eviction**, highest-QoS-violators first | Pod `Status: Failed, Reason: Evicted` (note 07) |
| PID limit | `fork` fails, `EAGAIN` | App errors, `pids.events` |

**Check yourself**
1. Average CPU is 30% of the limit but p99 latency is 100ms worse than without a limit. What's happening and how do you prove it?
2. A pod restarts with exit code 137. List two causes and the field that tells them apart.
3. Why does setting `GOMEMLIMIT` close to (but below) the memory limit reduce OOM kills for a healthy Go service?
4. Why do throttled containers sometimes fail their liveness probes, and what does that turn a slowdown into?
