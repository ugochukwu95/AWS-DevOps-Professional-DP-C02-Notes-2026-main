# 07 Scheduling, requests and limits (Weeks 3-6)

**Goal**: predict where a pod will be scheduled (or why it won't be), size requests and limits from evidence, and know which pod the kubelet will evict first under pressure.

## How the scheduler decides
For each `Pending` pod with no `nodeName`:
1. **Filter**: remove nodes that can't run it. Reasons include not enough *unrequested* CPU or memory, taints it doesn't tolerate, a node selector or affinity mismatch, a volume in another zone, or a port conflict.
2. **Score**: rank the remaining nodes (spread, balanced resource use, image already present...).
3. **Bind**: write `spec.nodeName`. The kubelet on that node takes over.

If no node passes the filter, the pod stays `Pending` and the event tells you exactly why:

```
0/3 nodes are available: 1 node(s) had untolerated taint {node-role.kubernetes.io/control-plane: },
2 Insufficient memory. preemption: 0/3 nodes are available...
```

**Important**: the scheduler uses **requests**, not actual usage. A node at 5% real CPU can be "full" if requests add up to its allocatable capacity.

## Requests and limits

| | Requests | Limits |
| --- | --- | --- |
| Used by | Scheduler (placement), kubelet (eviction order), CPU share under contention | Kernel cgroups (enforcement) |
| CPU | Guaranteed share when contended | Hard ceiling: **throttling** (note 04) |
| Memory | Placement and eviction ranking | Hard ceiling: **OOM kill** |

```bash
kubectl describe node taskq-worker | sed -n '/Allocated resources/,/Events/p'
```

### QoS classes
Kubernetes derives a QoS class from requests and limits. It decides eviction order when a **node** runs low on memory (this is different from a container hitting its own limit):

| QoS | Rule | Evicted |
| --- | --- | --- |
| **Guaranteed** | Every container has requests = limits for CPU and memory | Last |
| **Burstable** | At least one request or limit set, but not Guaranteed | Middle, ranked by usage above requests |
| **BestEffort** | No requests or limits at all | First |

taskq pods are **Burstable** (requests < limits). Postgres in week 6 is also Burstable, but you could make it Guaranteed to protect it.

```bash
kubectl -n taskq get pods -o custom-columns=NAME:.metadata.name,QOS:.status.qosClass
```

### How to choose numbers
1. Start with a guess (taskq: 50m CPU / 64Mi memory requests, 128Mi memory limit).
2. Run realistic load and measure with `kubectl top pods` (metrics-server, note 16) or Prometheus.
3. **Memory request** ≈ steady-state usage. **Memory limit** ≈ peak plus headroom. Never set the limit below observed peak.
4. **CPU request** ≈ typical usage. **CPU limit**: either none (allow bursting into idle capacity, common for latency-sensitive services) or ≥ 2-4× the request. Watch `nr_throttled`.
5. Revisit after every significant code change.

**The CPU limit debate**, summarised: with no CPU limit, a pod can use idle CPU and won't throttle, but a runaway pod can starve neighbours *above their requests* (requests are still protected via `cpu.weight`). With a CPU limit you get predictable behaviour but wasted capacity and latency spikes. Memory limits should always be set.

### Lab 7.1: Unschedulable because of requests
```bash
kubectl -n taskq patch deploy worker --type=json \
  -p='[{"op":"replace","path":"/spec/template/spec/containers/0/resources/requests/memory","value":"64Gi"}]'
kubectl -n taskq get pods                                   # new pod Pending
kubectl -n taskq describe pod -l app.kubernetes.io/name=worker | grep -A3 Events
kubectl -n taskq rollout undo deploy/worker
```

### Lab 7.2: OOMKilled in Kubernetes
```bash
kubectl -n taskq set env deploy/worker LEAK_MB_PER_JOB=10 WORK_DURATION=100ms
for i in $(seq 1 40); do curl -s -XPOST localhost:8080/jobs -d "{\"payload\":{\"i\":$i}}" >/dev/null; done
kubectl -n taskq get pods -w                                 # RESTARTS increments
kubectl -n taskq describe pod -l app.kubernetes.io/name=worker | grep -A5 'Last State'
#   Last State: Terminated  Reason: OOMKilled  Exit Code: 137
kubectl -n taskq logs deploy/worker --previous | tail -3     # logs of the killed container
kubectl -n taskq set env deploy/worker LEAK_MB_PER_JOB=0 WORK_DURATION=500ms
```

(`set env` overrides the ConfigMap value for that variable, because `env` takes precedence over `envFrom`.)

## Placement controls

| Mechanism | Who it constrains | Example |
| --- | --- | --- |
| `nodeSelector` | Pod wants nodes with label X (hard) | `disktype: ssd` |
| **Node affinity** | Same, but with `required...` (hard) and `preferred...` (soft) and operators | Only `topology.kubernetes.io/zone in [a, b]` |
| **Pod anti-affinity** | Keep away from pods with label X | Don't put two Postgres replicas on one node |
| **Topology spread constraints** | Even spread over a topology key | taskq: `maxSkew: 1` over `kubernetes.io/hostname` |
| **Taints** (on nodes) and **tolerations** (on pods) | Node repels pods unless they tolerate it | The control-plane taint. Dedicated GPU nodes |
| `priorityClassName` | Higher priority can preempt lower | Protect Postgres over batch workers |

Taints repel; affinity attracts. To *dedicate* nodes to a workload you need both: a taint so others stay off, and affinity so the workload goes there.

### Lab 7.3: Spread, taint and drain basics
```bash
kubectl -n taskq scale deploy/api --replicas=4
kubectl -n taskq get pods -l app.kubernetes.io/name=api -o wide   # 2 + 2 across the workers

# Why nothing runs on the control plane:
kubectl describe node taskq-control-plane | grep Taints

# Taint one worker: NoSchedule affects only new pods, NoExecute also evicts running ones
kubectl taint node taskq-worker2 lab=only:NoSchedule
kubectl -n taskq rollout restart deploy/api
kubectl -n taskq get pods -l app.kubernetes.io/name=api -o wide   # all on taskq-worker
kubectl taint node taskq-worker2 lab=only:NoSchedule-
kubectl -n taskq scale deploy/api --replicas=2
```

### Lab 7.4: Label a node and require it
```bash
kubectl label node taskq-worker tier=batch
kubectl -n taskq patch deploy worker -p '{"spec":{"template":{"spec":{"nodeSelector":{"tier":"batch"}}}}}'
kubectl -n taskq get pods -l app.kubernetes.io/name=worker -o wide
kubectl -n taskq patch deploy worker --type=json -p='[{"op":"remove","path":"/spec/template/spec/nodeSelector"}]'
kubectl label node taskq-worker tier-
```

## Namespace guardrails
- **ResourceQuota**: caps the total requests and limits (and object counts) in a namespace.
- **LimitRange**: default requests and limits for containers that don't set them, plus min and max.

```yaml
apiVersion: v1
kind: LimitRange
metadata:
  name: defaults
  namespace: taskq
spec:
  limits:
    - type: Container
      defaultRequest: { cpu: 50m, memory: 64Mi }
      default: { memory: 256Mi }
```

Try it: apply the LimitRange, run `kubectl run x --image=nginx` without resources, and inspect the pod's resources.

## Node-pressure eviction
When a **node** runs low on memory, disk or PIDs, the kubelet evicts pods (BestEffort first, then Burstable pods using the most above their requests). The pod shows `Status: Failed`, `Reason: Evicted`, and a message saying which resource. Evicted pods aren't restarted in place. Their controller creates replacements elsewhere.

```bash
kubectl get pods -A --field-selector=status.phase=Failed
kubectl describe node taskq-worker | grep -A6 Conditions   # MemoryPressure, DiskPressure, PIDPressure
```

**Check yourself**
1. A node shows 10% CPU usage but new pods are `Pending` with `Insufficient cpu`. Explain.
2. What's the difference between a container being OOMKilled and a pod being Evicted?
3. Make Postgres Guaranteed QoS. What exactly do you change?
4. Why is `whenUnsatisfiable: ScheduleAnyway` safer than `DoNotSchedule` on a 2-worker cluster?
