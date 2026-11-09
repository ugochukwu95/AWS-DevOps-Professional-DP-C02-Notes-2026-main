# 17 Disruption budgets, upgrades and node replacement (Weeks 11-13)

**Goal**: replace every node, upgrade the cluster and recover from a failed deployment **without failed requests or lost data**, and prove it with numbers.

## Voluntary vs involuntary disruptions

| Voluntary (you or automation chose it) | Involuntary (it just happened) |
| --- | --- |
| `kubectl drain`, node group AMI or version updates, Cluster Autoscaler or Karpenter scale-down, deleting pods | Hardware failure, kernel panic, EC2 instance retirement, AZ outage, OOM, node-pressure eviction |
| **PodDisruptionBudgets apply** | PDBs **don't** protect you. Only replicas, spreading and fast recovery do |

## PodDisruptionBudgets
A PDB limits how many pods of a set can be **voluntarily evicted** at once. The **Eviction API**, used by `drain` and node group updates, refuses an eviction that would violate it, and the caller retries.

taskq's [70-pdb.yaml](taskq/k8s/70-pdb.yaml):

| PDB | Setting | Meaning with 2 replicas |
| --- | --- | --- |
| `api` | `minAvailable: 1` | At most 1 api pod evicted at a time |
| `worker` | `maxUnavailable: 1` | At most 1 worker evicted at a time |

PDB pitfalls:
- **`minAvailable` equal to `replicas`** (for example `minAvailable: 2` with 2 replicas) means nothing can ever be evicted. `drain` hangs forever, and managed node group updates force-evict after 15 minutes. That defeats the point.
- **A single-replica Deployment with `maxUnavailable: 0`** has the same problem. Postgres with 1 replica deliberately has **no PDB**: a drain takes it down briefly, and that's a known, accepted risk in this design.
- PDBs count **ready** pods. If pods are already unready, evictions are blocked. That's correct behaviour, but surprising during incidents.

```bash
kubectl -n taskq get pdb      # ALLOWED DISRUPTIONS is the number to watch
```

## Draining a node
`kubectl drain` = **cordon** (mark unschedulable) + **evict** every pod (respecting PDBs), skipping DaemonSet pods.

### Lab 17.1: Drain under load, locally
```bash
# terminal 1: continuous traffic, recording status codes
rm -f /tmp/codes.txt
while true; do curl -s -o /dev/null -m 2 -w '%{http_code}\n' -XPOST localhost:8080/jobs -d '{"payload":{}}' >> /tmp/codes.txt; sleep 0.1; done

# terminal 2
kubectl -n taskq get pods -o wide
kubectl drain taskq-worker --ignore-daemonsets --delete-emptydir-data
kubectl -n taskq get pods -o wide            # everything now on taskq-worker2
kubectl uncordon taskq-worker
# stop terminal 1, then:
sort /tmp/codes.txt | uniq -c
```

Expect some 503s if Postgres was on the drained node, because the api's DB connection was down while Postgres restarted. Record how long that lasted. Getting rid of it requires a replicated database, which is a design decision, not a Kubernetes setting.

Also notice: `local-path` volumes are tied to their node (note 08). If Postgres's PV is on `taskq-worker`, the drained Postgres pod stays **Pending** until you uncordon. On EKS it would move to another node in the same AZ, if one exists.

### Lab 17.2: The PDB that blocks everything
```bash
kubectl -n taskq patch pdb api --type=merge -p '{"spec":{"minAvailable":2}}'
kubectl drain taskq-worker2 --ignore-daemonsets --timeout=60s
# "Cannot evict pod as it would violate the pod's disruption budget", repeated
kubectl -n taskq patch pdb api --type=merge -p '{"spec":{"minAvailable":1}}'
kubectl uncordon taskq-worker2
```

## Replacing nodes on EKS
A managed node group update (new AMI release or Kubernetes version) does surge, drain and terminate for you (note 12). To practise without waiting for a new AMI:

### Lab 17.3: Replace every node with zero downtime
```bash
kubectl get nodes
for n in $(kubectl get nodes -o name); do
  kubectl drain ${n#node/} --ignore-daemonsets --delete-emptydir-data --timeout=5m
  INSTANCE=$(kubectl get ${n} -o jsonpath='{.spec.providerID}' | cut -d/ -f5)
  aws ec2 terminate-instances --instance-ids $INSTANCE >/dev/null
  echo "waiting for a replacement node..."; sleep 240
  kubectl get nodes
done
```

The Auto Scaling group replaces each terminated instance. Run the traffic loop against the ALB while you do this, and record: total requests, failures, and how long Postgres was unavailable. Write a short report. That report is the "evidence" for this stage.

Simpler alternative: bump the node group's AMI release version (or set `force_update_version`) and let EKS do the rolling replacement. Watch `kubectl get nodes -w` and the node group's update status with `aws eks describe-update`.

## Cluster upgrades
Kubernetes minor versions are released about every 4 months. EKS standard support lasts about 14 months per version, and extended support costs more. Upgrading is routine work, not a project.

### Rules
- The control plane goes **one minor version at a time** (1.35 → 1.36, never 1.34 → 1.36).
- **Version skew**: kubelets may be up to 3 minors older than the API server, but never newer. So the order is **control plane first, then add-ons, then nodes**.
- **Removed APIs** are the main risk. Check before upgrading: EKS **upgrade insights** (`aws eks list-insights --cluster-name taskq`), and the release notes' "Deprecations and removals".
- `kubectl` should be within one minor version of the server.

### Upgrade runbook for taskq

| Step | Command or check |
| --- | --- |
| 1. Read the release notes and EKS insights | `aws eks list-insights --cluster-name taskq`. Every insight should be `PASSING` |
| 2. Back up Postgres | Lab 17.5 |
| 3. Pin the node group to the current version | `kubernetes_version = "1.35"` in the `default` node group block |
| 4. Upgrade the control plane and add-ons | `kubernetes_version = "1.36"` at cluster level, then `terraform apply` (about 10 minutes). The module resolves the newest add-on versions for 1.36 (`most_recent = true`) |
| 5. Verify | `kubectl version`, `kubectl get pods -A`, a taskq smoke test |
| 6. Upgrade nodes | Remove the node group pin, `terraform apply`. The managed node group rolls nodes one at a time (`max_unavailable = 1`), respecting PDBs |
| 7. Upgrade cluster tools | AWS Load Balancer Controller and metrics-server Helm charts, Argo CD: check their compatibility matrices |
| 8. Verify again | Run the drain-under-load traffic loop during step 6 and record the failures |

Doing it in two `apply`s (steps 4 and 6) means a problem in the control-plane upgrade is caught before any node is touched.

You can practise this on kind too: create a cluster on an older node image (`kind create cluster --image kindest/node:v1.35.x`). But kind clusters can't be upgraded in place, so the realistic version of this exercise is EKS.

## Recovering from a failed deployment
You've already done the mechanics. Here they are in one place:

| How you deploy | Detect | Recover |
| --- | --- | --- |
| `kubectl apply` | `kubectl rollout status --timeout`, then `Progressing=False` | `kubectl rollout undo deploy/api` |
| Helm | `helm upgrade --wait` fails, `helm history` | `helm rollback taskq <rev>` |
| Argo CD | App `Degraded`, sync failed | `git revert <commit>` and push. Avoid manual changes that drift from Git |

What protects users in all three cases is the same: **readiness probes** plus **`maxUnavailable: 0`**, so a broken version never receives traffic and the old pods aren't removed.

What doesn't protect you: a version that passes readiness but is broken (wrong results, slow queries, a bad migration). Defences: meaningful readiness checks, watching error-rate metrics during the rollout, progressive delivery (Argo Rollouts canaries), and **backward-compatible database migrations** (add the column first, deploy the code, remove the old column later). A migration can't be undone with `rollout undo`.

## Backup and recovery for Postgres

### Lab 17.4: A scheduled logical backup
A CronJob that writes `pg_dump` output to a PVC. On EKS, add an S3 upload step with a Pod Identity role, which is good extra practice.

```yaml
apiVersion: v1
kind: PersistentVolumeClaim
metadata: { name: backups, namespace: taskq }
spec:
  accessModes: ["ReadWriteOnce"]
  resources: { requests: { storage: 1Gi } }
---
apiVersion: batch/v1
kind: CronJob
metadata: { name: postgres-backup, namespace: taskq }
spec:
  schedule: "0 * * * *"
  concurrencyPolicy: Forbid
  successfulJobsHistoryLimit: 3
  failedJobsHistoryLimit: 3
  jobTemplate:
    spec:
      backoffLimit: 2
      template:
        spec:
          restartPolicy: OnFailure
          securityContext: { runAsUser: 999, runAsGroup: 999, fsGroup: 999 }
          containers:
            - name: dump
              image: postgres:17
              command: ["sh", "-c", "pg_dump -h postgres -U taskq -Fc taskq > /backups/taskq-$(date +%Y%m%d%H%M).dump && ls -l /backups"]
              env:
                - name: PGPASSWORD
                  valueFrom: { secretKeyRef: { name: postgres-credentials, key: POSTGRES_PASSWORD } }
              volumeMounts: [{ name: backups, mountPath: /backups }]
          volumes:
            - name: backups
              persistentVolumeClaim: { claimName: backups }
```

```bash
kubectl -n taskq create job --from=cronjob/postgres-backup backup-now
kubectl -n taskq logs job/backup-now
```

### Lab 17.5: Restore drill (the part that matters)
```bash
kubectl -n taskq exec postgres-0 -- psql -U taskq -c 'select count(*) from jobs'   # note the number
kubectl -n taskq exec postgres-0 -- psql -U taskq -c 'drop table jobs'            # disaster
curl -s localhost:8080/jobs/1                                                     # 503: database error

# Restore from the latest dump through a temporary pod that mounts the backups PVC
kubectl -n taskq run restore --rm -it --restart=Never --image=postgres:17 \
  --overrides='{"spec":{"securityContext":{"runAsUser":999},"volumes":[{"name":"b","persistentVolumeClaim":{"claimName":"backups"}}],"containers":[{"name":"restore","image":"postgres:17","stdin":true,"tty":true,"command":["sh"],"env":[{"name":"PGPASSWORD","value":"taskq"}],"volumeMounts":[{"name":"b","mountPath":"/backups"}]}]}}'
# inside:
ls -t /backups | head -1
pg_restore -h postgres -U taskq -d taskq --clean --if-exists /backups/<latest>.dump
exit

kubectl -n taskq exec postgres-0 -- psql -U taskq -c 'select count(*) from jobs'
```

Record the **RPO** (how much data was lost: jobs created after the last backup) and the **RTO** (time from "drop table" to service restored). Those two numbers, not "we have backups", answer "can we recover?".

Note that the api kept passing `/readyz` while the table was missing, because readiness checks the connection, not the schema. Is that what you want? Write down the trade-off.

## Readiness check for Weeks 11-13
- [ ] Deploy a change through Git and Argo CD, then roll back a bad one with `git revert`
- [ ] Replace every EKS node with a traffic loop running, and report the failure count
- [ ] Upgrade the EKS cluster by one minor version using the runbook
- [ ] Restore Postgres from backup and state the RPO and RTO you achieved

**Check yourself**
1. Why doesn't a PDB protect you from an EC2 instance failure?
2. A drain hangs with "would violate the pod's disruption budget". List three possible causes.
3. Why must the control plane be upgraded before the nodes?
4. Which kinds of bad release does `maxUnavailable: 0` plus readiness *not* protect against?
