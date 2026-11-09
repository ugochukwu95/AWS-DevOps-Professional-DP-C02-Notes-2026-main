# 18 Failure drills (Weeks 14-16)

**Goal**: find the cause from symptoms, restore service, and document prevention, for the failures that actually happen in production Kubernetes and EKS.

## How to run a drill
1. **Don't read the "Break it" step yourself** if you can avoid it. Ask a friend, or use the random picker at the end, which applies a break without telling you which one.
2. Start a timer and a traffic loop, so you have a user's view:
   ```bash
   rm -f /tmp/codes.txt
   while true; do echo "$(date +%T) $(curl -s -o /dev/null -m 2 -w '%{http_code}' -XPOST localhost:8080/jobs -d '{"payload":{}}')" >> /tmp/codes.txt; sleep 0.5; done
   ```
3. Investigate using only the order in [10 Kubernetes troubleshooting playbook](10%20Kubernetes%20troubleshooting%20playbook.md). Write each command and finding in your journal **as you go**.
4. Restore service first, find the root cause second, and write prevention third.
5. Write the incident report (template at the end). The drill isn't done until the report is.

Each drill has the same sections: **Break it**, **Symptoms**, **Diagnose**, **Fix**, **Prevent**. Drills marked **(EKS)** need the AWS environment. The others run on kind.

---

## Drill 1: Broken DNS

### 1a. CoreDNS is gone
**Break it**
```bash
kubectl -n kube-system scale deploy coredns --replicas=0
kubectl -n taskq rollout restart deploy/api     # new pods must resolve postgres from scratch
```

**Symptoms**: new api pods never become Ready. `/readyz` says `database unreachable: ... lookup postgres.taskq.svc.cluster.local ... i/o timeout` (or `server misbehaving`). The old pods may keep working on existing connections, which makes this one confusing.

**Diagnose**
```bash
kubectl -n taskq describe pod -l app.kubernetes.io/name=api | grep -A3 Readiness
kubectl -n taskq run dns --rm -it --image=nicolaka/netshoot --restart=Never -- dig postgres.taskq.svc.cluster.local
#   ;; connection timed out; no servers could be reached
kubectl -n kube-system get svc kube-dns
kubectl -n kube-system get endpointslices -l kubernetes.io/service-name=kube-dns   # no endpoints
kubectl -n kube-system get deploy coredns                                          # 0/0
```

**Fix**: `kubectl -n kube-system scale deploy coredns --replicas=2`

**Prevent**: CoreDNS with at least 2 replicas spread across nodes and AZs, plus a PDB (EKS's CoreDNS add-on sets these up; don't override them carelessly). Alert on CoreDNS availability and on DNS error rates. Consider NodeLocal DNSCache. RBAC so that only platform admins can change `kube-system`.

### 1b. Cluster names work, external names don't
**Break it**: edit the Corefile so upstream forwarding goes nowhere.
```bash
kubectl -n kube-system get cm coredns -o yaml > /tmp/coredns-backup.yaml
kubectl -n kube-system edit cm coredns       # change "forward . /etc/resolv.conf" to "forward . 10.255.255.1"
kubectl -n kube-system rollout restart deploy coredns
```

**Symptoms**: taskq looks healthy (`postgres` resolves), but anything external fails. On EKS, worker jobs fail with S3 upload errors such as `dial tcp: lookup taskq-results-....s3.eu-west-1.amazonaws.com: i/o timeout`. Locally: `kubectl run ... -- curl https://example.com` hangs.

**Diagnose**
```bash
kubectl -n taskq run dns --rm -it --image=nicolaka/netshoot --restart=Never -- sh -c 'dig +short api.taskq.svc.cluster.local; dig example.com'
kubectl -n kube-system logs deploy/coredns | tail     # errors forwarding to 10.255.255.1
kubectl -n kube-system get cm coredns -o jsonpath='{.data.Corefile}'
```

**Fix**: `kubectl apply -f /tmp/coredns-backup.yaml && kubectl -n kube-system rollout restart deploy coredns`

**Prevent**: manage CoreDNS configuration through the EKS add-on configuration or GitOps, not `kubectl edit`. Use a synthetic check that resolves an external name from inside the cluster. **Lesson**: "DNS works" must always be qualified: *which* names, from *where*?

---

## Drill 2: Unavailable node

**Break it (kind)**: find the node running Postgres and kill it.
```bash
kubectl -n taskq get pods -o wide
docker stop taskq-worker2        # pick the node hosting postgres-0
```

**Break it (EKS)**: terminate the instance hosting `postgres-0`, or stop its kubelet through SSM (`sudo systemctl stop kubelet`) for a "node is up but unhealthy" variant.

**Symptoms** (watch them unfold over time; that's the lesson):

| Time | What you see |
| --- | --- |
| 0-40s | Nothing in the API. Traffic to pods on that node fails. Postgres is unreachable, so api `/readyz` is 503 everywhere |
| ~40s | Node `NotReady`. The node controller adds the `node.kubernetes.io/unreachable` taint. kube-proxy and EndpointSlices drop the node's pods |
| ~5 min | Pods are evicted (default toleration of 300s for unreachable). Deployment pods are recreated on healthy nodes |
| After 5 min | **`postgres-0` stays `Terminating` forever**, and no replacement is created |

**Diagnose**
```bash
kubectl get nodes
kubectl describe node taskq-worker2 | grep -A8 -E 'Conditions|Taints'
kubectl -n taskq get pods -o wide
kubectl -n taskq describe pod postgres-0 | tail
```

Why `postgres-0` is stuck: a StatefulSet guarantees **at most one** pod per identity. The control plane can't confirm that the old `postgres-0` has stopped (the node might just be partitioned and still writing to the disk), so it won't create another one. This is a safety feature.

**Fix**
- Best: bring the node back (`docker start taskq-worker2`). Everything reconciles.
- If the node is truly gone: confirm it's dead (EC2 instance terminated), then either `kubectl delete node <node>`, or add the out-of-service taint so its pods and volume attachments are released:
  ```bash
  kubectl taint node <node> node.kubernetes.io/out-of-service=nodeshutdown:NoExecute
  ```
- Last resort: `kubectl -n taskq delete pod postgres-0 --force --grace-period=0`. Only do this when you're **sure** the old process is dead, otherwise two Postgres processes may write to one volume.
- On kind with local-path, the data lives on the dead node. Without that node there's no data. On EKS, the EBS volume detaches and reattaches in the same AZ (after a delay of up to about 6 minutes for an unclean shutdown).

**Prevent**: at least 2 replicas of stateless workloads spread across nodes and AZs (taskq does this). For the database: replication, or RDS Multi-AZ. Node auto-repair (EKS node monitoring agent / node auto repair). Alerts on `NotReady` nodes. Shorter `tolerationSeconds` for stateless pods if 5 minutes is too slow for you.

---

## Drill 3: Exhausted IPs (EKS)

**Break it**: rebuild the environment with tiny private subnets, then scale up.
```bash
cd Kubernetes/taskq/terraform/eks
terraform apply -var private_subnet_newbits=11     # /27 private subnets: 27 usable IPs each (recreates subnets and cluster)
# redeploy taskq (Helm or Argo CD), then:
kubectl -n taskq scale deploy/worker --replicas=40
```

**Symptoms**: some pods stuck in `ContainerCreating`. Events say `failed to setup network for sandbox ... failed to assign an IP address to container`. Nodes have plenty of CPU and memory. New nodes may fail to launch at all.

**Diagnose**
```bash
kubectl -n taskq describe pod <stuck-pod> | grep -A5 Events
kubectl -n kube-system logs ds/aws-node -c aws-node --tail=50 | grep -iE 'insufficient|failed|no available'
aws ec2 describe-subnets --subnet-ids $(terraform output -json private_subnets | jq -r 'join(" ")') \
  --query 'Subnets[].{az:AvailabilityZone,cidr:CidrBlock,free:AvailableIpAddressCount}' --output table
kubectl get pods -A -o wide | wc -l          # who is using all the IPs? (pods plus each node's warm pool)
```

Tell it apart from `Too many pods` (max-pods per node, scheduler event, pod stays `Pending`), which is a different limit (note 12).

**Fix (immediate)**: scale down non-critical workloads. Shrink the warm pool:
```bash
kubectl -n kube-system set env ds/aws-node WARM_IP_TARGET=2 MINIMUM_IP_TARGET=4
```
(On a managed add-on, put these in the add-on's `configuration_values` instead, or the next add-on update reverts them.)

**Fix (real)**: bigger subnets, a secondary VPC CIDR with custom networking for pods, or prefix delegation if the subnets have free contiguous /28 blocks.

**Prevent**: size pod subnets for peak pods plus warm pools plus node surge during upgrades. Alert on `AvailableIpAddressCount`. Include IP math in capacity planning. Finally, rebuild with the default `/20` subnets.

**Local analog (kind)**: cap pods per node with a kubelet setting, and see the scheduler side of "no room":
```yaml
# add to kind-config.yaml under the cluster (not a node), then recreate the cluster
kubeadmConfigPatches:
  - |
    kind: KubeletConfiguration
    maxPods: 12
```

---

## Drill 4: Bad permissions

### 4a. Kubernetes RBAC (kind)
**Break it**: remove `pods/log` from the viewer Role (`kubectl -n taskq edit role taskq-viewer`).

**Symptoms**: a teammate (`--as=jane --as-group=taskq-viewers`) can list pods but `kubectl logs` returns `Forbidden: ... cannot get resource "pods/log"`.

**Diagnose and fix**: read the Forbidden message (user, verb, resource, subresource), then `kubectl auth can-i get pods --subresource=log -n taskq --as=jane --as-group=taskq-viewers`. Restore the rule from Git.

**Prevent**: RBAC in Git (Argo CD's `selfHeal` would have reverted this edit), plus tests that run `kubectl auth can-i` for each persona.

### 4b. Workload IAM (EKS)
**Break it** (pick one): change the worker policy resource to `.../out/*` and `terraform apply`. Or delete the Pod Identity association and restart the worker. Or set `serviceAccountName: api` on the worker.

**Symptoms**: the api accepts jobs, but `GET /jobs/<id>` shows `status: failed` with `AccessDenied` or `failed to retrieve credentials`. `taskq_jobs_failed_total` rises.

**Diagnose**: work through the 6-step checklist in [note 13](13%20Cluster%20access%20and%20workload%20IAM.md#debugging-accessdenied-from-a-pod-the-checklist). The error message distinguishes the two families: **AccessDenied** means credentials worked but the policy said no. **No credentials** means the association, injection or ServiceAccount is wrong.

**Fix**: restore the policy or association, then **restart the pods** if the association changed.

**Prevent**: Terraform for associations and policies, IAM Access Analyzer, and an end-to-end smoke test that creates a job and checks S3.

### 4c. Cluster access (EKS)
**Break it**: remove the viewer access entry (`aws eks delete-access-entry ...`).

**Symptoms**: `error: You must be logged in to the server (Unauthorized)`.

**Diagnose**: `aws sts get-caller-identity` (which identity am I?), then `aws eks list-access-entries --cluster-name taskq`. Unauthorized is authentication; Forbidden would be RBAC.

**Fix and prevent**: access entries only through Terraform. Keep at least two admin principals (break-glass), so one deleted entry never locks everyone out.

---

## Drill 5: Memory failures

### 5a. A leaking worker
**Break it**: `kubectl -n taskq set env deploy/worker LEAK_MB_PER_JOB=10 WORK_DURATION=100ms`, then submit 50 jobs.

**Symptoms**: worker `RESTARTS` climbing. Some jobs stuck in `running` for 5 minutes, then retried, with `attempts` above 1.

**Diagnose**
```bash
kubectl -n taskq get pods -l app.kubernetes.io/name=worker
kubectl -n taskq describe pod -l app.kubernetes.io/name=worker | grep -A4 'Last State'   # OOMKilled, 137
kubectl -n taskq logs deploy/worker --previous | grep leaked | tail -3
kubectl -n taskq top pods --containers                                                     # climbing toward 128Mi
kubectl -n taskq exec postgres-0 -- psql -U taskq -c "select id, status, attempts, updated_at from jobs where status='running' or attempts > 1"
```

**Fix**: restore `LEAK_MB_PER_JOB=0` (that's "the deploy that introduced the leak", so roll it back). Jobs are reclaimed automatically after 5 minutes.

**Prevent**: memory limits on every container (so one leak can't take down a node), `GOMEMLIMIT`, alerts on OOMKilled and restart counts, idempotent jobs that are safe to retry.

### 5b. Limit too low for normal operation
**Break it**: set the api memory limit to `16Mi`.

**Symptoms**: `CrashLoopBackOff` immediately, `OOMKilled` on start, or sometimes not even listening yet. The rollout stalls but the old pods still serve (`maxUnavailable: 0`).

**Diagnose and fix**: `describe pod` (Last State OOMKilled), then `kubectl rollout undo`. **Lesson**: rollout safety turned a crash into a stalled rollout instead of an outage.

---

## Drill 6: CPU starvation and a liveness probe that kills busy pods

**Break it**: `kubectl -n taskq set env deploy/worker BURN_CPU=45s`, then submit a few jobs.

**Symptoms**: workers restart. No OOMKilled. Jobs stay `running`, are retried after 5 minutes, and fail again in the same way.

**Diagnose**
```bash
kubectl -n taskq describe pod -l app.kubernetes.io/name=worker | grep -E 'Liveness|Unhealthy|Killing|Last State|Reason|Exit'
# Liveness probe failed: HTTP probe failed with statuscode: 503
# "poll loop stalled for 31s"
kubectl -n taskq logs deploy/worker --previous | tail
```

The worker updates its heartbeat **between** jobs. A job longer than 30s makes the liveness probe fail even though the worker is healthy and busy. The kubelet restarts it, the job is lost, it's retried, and the cycle repeats. The CPU limit makes it worse: throttled to 500m, the work takes longer in wall-clock time.

**Fix**: immediately, revert `BURN_CPU`. Properly (a code change): update the heartbeat from inside long jobs, or make liveness depend only on "the process can respond", and use a job timeout to bound work.

**Prevent**: liveness should detect deadlock, not slowness. Load-test with realistic job durations. Alert on restarts that have no OOM reason.

---

## Drill 7: Storage problems

### 7a. A StorageClass that doesn't exist
**Break it**: delete the Postgres StatefulSet and its PVC, set `storageClassName: fast-ssd` in the volume claim template (or `postgres.storageClass: fast-ssd` in Helm), and redeploy.

**Symptoms**: `postgres-0` `Pending`. The PVC is `Pending`. api `/readyz` is 503.

**Diagnose**
```bash
kubectl -n taskq get pvc
kubectl -n taskq describe pvc data-postgres-0      # storageclass.storage.k8s.io "fast-ssd" not found
kubectl get sc
```

**Fix**: correct the class. `volumeClaimTemplates` are immutable, so delete the StatefulSet (`--cascade=orphan` if pods exist) and the Pending PVC, then reapply.

**Prevent**: chart validation (`helm lint`, schema), a known default StorageClass, and policy that rejects unknown classes.

### 7b. The volume is pinned somewhere the pod can't go
**Break it (kind)**: cordon the node holding the Postgres PV, then delete `postgres-0` (note 08, lab 8.3).
**Break it (EKS)**: find the AZ of the Postgres EBS volume, then scale the node group so that no node is in that AZ (or cordon every node in that AZ), and delete `postgres-0`.

**Symptoms**: `postgres-0` `Pending` with `volume node affinity conflict`. The PVC is `Bound`, so it looks fine at first glance.

**Diagnose**
```bash
kubectl -n taskq describe pod postgres-0 | grep -A5 Events
PV=$(kubectl -n taskq get pvc data-postgres-0 -o jsonpath='{.spec.volumeName}')
kubectl get pv $PV -o jsonpath='{.spec.nodeAffinity}'; echo
kubectl get nodes -L topology.kubernetes.io/zone
```

**Fix**: uncordon, or add capacity in the right node or AZ.

**Prevent**: node groups with capacity in every AZ used by stateful pods, Cluster Autoscaler or Karpenter that understand zonal volumes, or a managed database.

### 7c. The disk is full (EKS)
local-path on kind doesn't enforce PVC size, so do this one on EBS.

**Break it**: fill the database with random (barely compressible) payloads of about 110 KB each. Repeat the command until writes fail:
```bash
kubectl -n taskq exec postgres-0 -- psql -U taskq -c "
  insert into jobs (payload, status)
  select jsonb_build_object('pad', (select string_agg(gen_random_uuid()::text || s, '') from generate_series(1, 3000))), 'done'
  from generate_series(1, 5000) s"
```

(`repeat('x', ...)` wouldn't work: Postgres compresses it to almost nothing. The `|| s` makes the subquery run once per row, so every payload is different.)

**Symptoms**: `POST /jobs` returns 503. Postgres logs show `could not extend file ... No space left on device`. Postgres may go into recovery or refuse writes.

**Diagnose**: `kubectl -n taskq exec postgres-0 -- df -h /var/lib/postgresql/data`, Postgres logs, and CloudWatch `VolumeIdleTime` / Container Insights filesystem metrics.

**Fix**: expand the PVC (note 14, lab 14.4) and wait for the filesystem resize. Then delete the padding rows and `VACUUM`.

**Prevent**: alerts on PVC usage (kubelet `kubelet_volume_stats_used_bytes`), `allowVolumeExpansion: true`, and data retention for completed jobs.

---

## Random drill picker (kind)
Save as `drill.sh` in [taskq](taskq), run it, and investigate without looking at what it did. The answer is written to a file you shouldn't open until you're done.

```bash
#!/usr/bin/env bash
set -euo pipefail
ns=taskq
breaks=(
  "kubectl -n kube-system scale deploy coredns --replicas=0; kubectl -n $ns rollout restart deploy/api"
  "kubectl -n $ns patch svc api -p '{\"spec\":{\"selector\":{\"app.kubernetes.io/name\":\"apl\"}}}'"
  "kubectl -n $ns set env deploy/worker LEAK_MB_PER_JOB=10 WORK_DURATION=100ms"
  "kubectl -n $ns set env deploy/worker BURN_CPU=45s"
  "kubectl -n $ns set resources deploy/api --limits=memory=16Mi"
  "kubectl -n $ns patch deploy worker --type=json -p='[{\"op\":\"replace\",\"path\":\"/spec/template/spec/containers/0/command\",\"value\":[\"/workr\"]}]'"
  "kubectl -n $ns set resources deploy/worker --requests=cpu=8"
  "docker stop \$(kubectl -n $ns get pod postgres-0 -o jsonpath='{.spec.nodeName}')"
  "kubectl -n $ns patch pdb api --type=merge -p '{\"spec\":{\"minAvailable\":2}}'; echo 'now drain a node'"
)
i=$(( RANDOM % ${#breaks[@]} ))
echo "${breaks[$i]}" > /tmp/drill-answer.txt
eval "${breaks[$i]}" >/dev/null 2>&1
echo "Something is broken. Submit some jobs and start investigating."
```

---

## Incident write-up template
Copy this into your journal for every drill:

```markdown
# Incident: <short title>
Date: <date>   Duration: <detected → restored>   Environment: kind | EKS

## Impact
What users saw (from the traffic loop): error rate, failed jobs, how long.

## Timeline
| Time | Event |
| --- | --- |
| hh:mm | Break applied / first symptom |
| hh:mm | Detected (how?) |
| hh:mm | Hypothesis 1: ... ruled out because ... |
| hh:mm | Root cause identified |
| hh:mm | Service restored (how?) |

## Root cause
One paragraph. Why did it happen, and why did nothing stop it?

## Diagnosis path
The commands that actually found it, and the ones that were dead ends.

## Fix
Immediate mitigation, and the permanent fix.

## Prevention
| Action | Type (alert / guardrail / design / runbook) | Done? |
| --- | --- | --- |

## What I'd check first next time
One line.
```

## Readiness check for Weeks 14-16
- [ ] Every drill completed at least once, with a write-up
- [ ] Five random picks in a row diagnosed in under 10 minutes each
- [ ] For each drill, you can name the **first command** you'd run and why
- [ ] You can explain to someone else, without notes, why `postgres-0` gets stuck `Terminating` when its node dies, and why that's a feature
