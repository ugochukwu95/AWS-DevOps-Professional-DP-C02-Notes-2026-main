# 06 Configuration, Secrets and probes (Weeks 3-6)

**Goal**: inject configuration without rebuilding images, understand what a Secret does and doesn't protect, and design probes that heal real failures without causing outages.

## ConfigMaps
Non-secret key/value configuration. taskq's is in [10-config.yaml](taskq/k8s/10-config.yaml).

| Consumption | Example | Updates when the ConfigMap changes? |
| --- | --- | --- |
| `envFrom.configMapRef` (all keys as env vars) | worker reads `POLL_INTERVAL` | **No**. Env vars are fixed at container start |
| `env.valueFrom.configMapKeyRef` (one key) | | **No** |
| Volume mount (keys become files) | `/etc/taskq/config.yaml` | **Yes**, eventually (about a minute, kubelet sync). Not with `subPath` |

So for taskq, a config change needs a restart:

```bash
kubectl -n taskq edit cm taskq-config            # WORK_DURATION: "2s"
kubectl -n taskq rollout restart deploy/worker
kubectl -n taskq logs deploy/worker | head -2    # "work":"2s"
```

## Secrets
A Secret is a ConfigMap-like object whose values are **base64-encoded, not encrypted**. What it gives you:
- RBAC can treat it separately ("devs can read ConfigMaps, not Secrets").
- It isn't printed by `kubectl describe`.
- On nodes it's mounted on tmpfs, not written to disk.
- With **encryption at rest** configured (EKS: KMS envelope encryption, on by default for new clusters), it's encrypted in etcd.

What it doesn't give you: protection in Git. `stringData` in [10-config.yaml](taskq/k8s/10-config.yaml) is fine for a local lab only.

```bash
kubectl -n taskq get secret taskq-db -o jsonpath='{.data.DATABASE_URL}' | base64 -d; echo
```

Anyone with `get secret` in the namespace, or anyone who can **create a pod** that mounts it, can read it. Treat "create pods" as "read every Secret in this namespace".

Production options, in order of complexity:
1. Create Secrets out of band (`kubectl create secret generic ... --from-literal`) or from a CI pipeline.
2. **External Secrets Operator** syncs from AWS Secrets Manager or SSM.
3. **Sealed Secrets** or SOPS lets you commit encrypted values to Git.
4. The Secrets Store CSI driver mounts values directly from Secrets Manager.

## The downward API
Pods can read facts about themselves. taskq uses it to set `GOMEMLIMIT` from its own memory limit:

```yaml
- name: GOMEMLIMIT
  valueFrom:
    resourceFieldRef:
      resource: limits.memory
```

Other useful fields: `metadata.name`, `metadata.namespace`, `spec.nodeName`, `status.podIP` (through `fieldRef`).

## Probes
The kubelet runs the probes. Each probe answers a different question and triggers a different action:

| Probe | Question | On failure | taskq |
| --- | --- | --- | --- |
| **startup** | Has it finished starting? | Keep waiting. Liveness and readiness are paused until it passes. After `failureThreshold × periodSeconds`, restart | api: `/healthz`, up to 30s |
| **readiness** | Should it get traffic **right now**? | Removed from Service endpoints. **Not restarted** | api: `/readyz` (migrations done and DB ping) |
| **liveness** | Is it broken in a way only a restart fixes? | **Container restarted** | api: `/healthz`. worker: poll loop heartbeat |

### Probe design rules
1. **Liveness must not depend on anything external.** If `/healthz` checked Postgres, a database blip would restart every api pod at once. That turns a dependency outage into a restart storm, plus cold caches and a thundering herd when the database returns.
2. **Readiness may check critical dependencies**, but understand the consequence: if Postgres is down, *all* api pods go unready, so the Service has no endpoints and clients get connection errors instead of a fast 503. For taskq that's acceptable, because without the DB it can't do anything. For a service with partial functionality, readiness should only check what it can't work without.
3. **Liveness should detect a wedged process**, not a slow one. Generous thresholds (taskq allows 30s) avoid killing a pod that's just CPU-throttled.
4. **Use a startup probe for slow starts** instead of a large `initialDelaySeconds` on liveness.
5. **No readiness probe for pods without Services**. The worker has none.

The worker's liveness is a good example of a meaningful check: it fails if the poll loop hasn't run for 30s (deadlocked or stuck), which is exactly the case where a restart helps.

### Lab 6.1: Readiness vs liveness during a database outage
```bash
kubectl -n taskq get pods -w &            # watch in the background
docker stop taskq-pg
kubectl -n taskq get endpointslices -l kubernetes.io/service-name=api   # endpoints disappear
kubectl -n taskq describe pod -l app.kubernetes.io/name=api | grep -A2 Readiness
curl -s -m3 localhost:8080/healthz; echo " exit $?"
docker start taskq-pg
# api pods become Ready again with RESTARTS still 0
kill %1
```

Write down what the clients saw, and why `RESTARTS` stayed at 0.

### Lab 6.2: A bad liveness probe causes an outage
Point liveness at `/readyz` (a database-dependent check), then stop Postgres:

```bash
kubectl -n taskq patch deploy api --type=json \
  -p='[{"op":"replace","path":"/spec/template/spec/containers/0/livenessProbe/httpGet/path","value":"/readyz"}]'
kubectl -n taskq rollout status deploy/api
docker stop taskq-pg
kubectl -n taskq get pods -w           # RESTARTS climbs, then CrashLoopBackOff
docker start taskq-pg
kubectl -n taskq rollout undo deploy/api
```

The restarts didn't fix anything, and with back-off the pods are now slower to recover than if they had been left alone.

### Lab 6.3: A probe on the wrong port
```bash
kubectl -n taskq patch deploy worker --type=json \
  -p='[{"op":"replace","path":"/spec/template/spec/containers/0/livenessProbe/httpGet/port","value":9999}]'
kubectl -n taskq describe pod -l app.kubernetes.io/name=worker | grep -E 'Liveness|Unhealthy|Killing'
kubectl -n taskq rollout undo deploy/worker
```

## Graceful shutdown and rollouts
When a pod is deleted, two things happen **in parallel**:
1. It's removed from EndpointSlices, so kube-proxy and load balancers stop sending new traffic. This takes a moment to propagate.
2. The kubelet runs `preStop`, then sends SIGTERM.

If the app exits on SIGTERM before step 1 has propagated, in-flight and new connections get errors. That's why the api has:

```yaml
lifecycle:
  preStop:
    sleep:
      seconds: 5
```

The pod keeps serving for 5s after it's marked for deletion, then shuts down gracefully. `terminationGracePeriodSeconds: 30` must cover preStop plus shutdown time.

### Lab 6.4: Zero-error rollout
```bash
# terminal 1: constant traffic
rm -f /tmp/codes.txt
while true; do curl -s -o /dev/null -m 2 -w '%{http_code}\n' localhost:8080/readyz >> /tmp/codes.txt; sleep 0.1; done
# terminal 2
kubectl -n taskq rollout restart deploy/api && kubectl -n taskq rollout status deploy/api
# stop terminal 1 (Ctrl-C), then count the status codes: all 200
sort /tmp/codes.txt | uniq -c
```

Then remove the `preStop` hook and repeat. You may see a few failures. That's the race above.

**Check yourself**
1. Why must liveness never check the database? Describe the outage it causes.
2. A pod is `Running` but `0/1 READY`. Which probe is failing, and where do you see why?
3. Why does a ConfigMap change not affect running pods that use `envFrom`?
4. Who can effectively read a Secret, besides people with `get secrets`?
