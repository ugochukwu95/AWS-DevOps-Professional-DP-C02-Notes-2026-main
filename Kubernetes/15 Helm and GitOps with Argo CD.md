# 15 Helm and GitOps with Argo CD (Weeks 11-13)

**Goal**: replace "apply the files, then patch them with `kubectl set`" with one versioned package (Helm) and one source of truth (Git, through Argo CD). Then roll out, fail and roll back through that pipeline.

## Why: the problem you created in weeks 7-10
On EKS you ran `kubectl apply -f k8s/`, then `kubectl set image` and `kubectl set env`. Now:
- The files in Git don't describe what's running.
- kind and EKS need different values (image, Service type, Ingress, StorageClass, bucket).
- There's no history of what was deployed when, and no single "undo".

**Helm** fixes the packaging: one chart, different values per environment, with release history. **Argo CD** fixes the drift: the cluster continuously converges to what's in Git.

## Part 1: Helm

### Concepts

| Term | Meaning |
| --- | --- |
| **Chart** | A directory of templates + `values.yaml` + `Chart.yaml`. taskq's is [helm/taskq](taskq/helm/taskq) |
| **Values** | Inputs. Layered: chart `values.yaml` < `-f values-kind.yaml` < `--set` |
| **Release** | One installed instance of a chart in a namespace, with numbered **revisions** |
| **Revision history** | Stored as Secrets (`sh.helm.release.v1.taskq.v3`) in the release namespace. `helm rollback` re-applies an old revision |
| `helm template` | Render locally, no cluster. **Always read the output** |

### How the taskq chart is organised

| Template | Contents | Toggle |
| --- | --- | --- |
| [config.yaml](taskq/helm/taskq/templates/config.yaml) | ConfigMap from `worker.config`, the `taskq-db` Secret | `database.existingSecret` skips the Secret |
| [serviceaccounts.yaml](taskq/helm/taskq/templates/serviceaccounts.yaml) | `api`, `worker` | |
| [api.yaml](taskq/helm/taskq/templates/api.yaml) | Deployment, Service, Ingress, HPA | `api.ingress.enabled`, `api.hpa.enabled` |
| [worker.yaml](taskq/helm/taskq/templates/worker.yaml) | Deployment | |
| [policy.yaml](taskq/helm/taskq/templates/policy.yaml) | PDBs, the viewer Role and RoleBinding | `pdb.enabled` |
| [postgres.yaml](taskq/helm/taskq/templates/postgres.yaml) | Secret, headless Service, StatefulSet | `postgres.enabled` (turn off for RDS) |

Three details worth understanding:
1. **`checksum/config` annotation**: a hash of the rendered ConfigMap and Secret in the pod template. Change a config value, the hash changes, the pod template changes, and the Deployment rolls. This solves the `envFrom` problem from note 06.
2. **No `replicas` when HPA is enabled**: otherwise every `helm upgrade` resets the replica count and fights the autoscaler.
3. **Fixed resource names** (`api`, `worker`): simpler to follow in the notes, and the Pod Identity association expects ServiceAccount `worker`. The cost is one release per namespace.

### Lab 15.1: Render, then install on kind
```bash
brew install helm     # if you haven't since note 14
cd Kubernetes/taskq
helm lint helm/taskq -f helm/taskq/values-kind.yaml
helm template taskq helm/taskq -f helm/taskq/values-kind.yaml -n taskq | less
diff <(helm template taskq helm/taskq -f helm/taskq/values-kind.yaml -n taskq) <(cat k8s/*.yaml) | head -50

kubectl delete ns taskq --wait                             # remove the plain-manifest version (this deletes the in-cluster Postgres data too)
kubectl apply -f k8s/00-namespace.yaml                     # namespace with Pod Security labels
helm install taskq helm/taskq -n taskq -f helm/taskq/values-kind.yaml
helm list -n taskq
kubectl -n taskq get all
curl -s -XPOST localhost:8080/jobs -d '{"payload":{"via":"helm"}}'
```

### Lab 15.2: Upgrade, fail, roll back
```bash
helm upgrade taskq helm/taskq -n taskq -f helm/taskq/values-kind.yaml --set worker.config.WORK_DURATION=2s
helm history taskq -n taskq
kubectl -n taskq get pods                     # workers rolled because of the checksum annotation

# A bad release: --wait makes Helm wait for readiness and mark the revision failed if it times out
helm upgrade taskq helm/taskq -n taskq -f helm/taskq/values-kind.yaml --set image.tag=broken --wait --timeout 90s
helm history taskq -n taskq                   # revision 3: failed
kubectl -n taskq get pods                     # the old pods still serve (maxUnavailable: 0)
helm rollback taskq 2 -n taskq --wait
helm history taskq -n taskq                   # revision 4: "Rollback to 2"
```

`helm rollback` creates a **new** revision. History only moves forward, which keeps it auditable.

To roll back automatically on failure, add `--rollback-on-failure` (Helm 4) or `--atomic` (Helm 3). Check your version with `helm version`.

### Lab 15.3: The same chart on EKS
```bash
cp helm/taskq/values-eks.yaml /tmp/values-eks.yaml    # fill in ECR repository, bucket, region
helm upgrade --install taskq helm/taskq -n taskq --create-namespace \
  -f helm/taskq/values-eks.yaml -f /tmp/values-eks.yaml --wait
```

Before running that against the EKS cluster from note 14, remove the resources you created by hand, or adopt them. Helm refuses to take over objects it doesn't own ("invalid ownership metadata"). That's a good error to see once.

## Part 2: GitOps with Argo CD

### Concepts
**GitOps** means the desired state lives in Git, and an in-cluster agent **pulls** it and continuously reconciles. Compare with CI running `kubectl apply` (push):

| | Push (CI runs `helm upgrade`) | Pull (Argo CD) |
| --- | --- | --- |
| Cluster credentials | Held by CI | Stay inside the cluster |
| Drift (someone runs `kubectl edit`) | Undetected until the next deploy | Detected and shown, and reverted with `selfHeal` |
| Rollback | Re-run an old pipeline | `git revert` |
| Audit trail | Pipeline logs | Git history |

| Argo CD term | Meaning |
| --- | --- |
| **Application** | "Render *this path at this revision* of *this repo* into *this cluster and namespace*". taskq's is [argocd/application-kind.yaml](taskq/argocd/application-kind.yaml) |
| **Sync status** | `Synced` / `OutOfSync`: does the live state match Git? |
| **Health status** | `Healthy` / `Progressing` / `Degraded`: are the resources working (Deployment available, PVC bound)? |
| **Auto-sync, `prune`, `selfHeal`** | Apply Git changes automatically, delete what was removed from Git, revert manual changes |
| **Sync waves and hooks** | Ordering (for example a database before the app) |

Argo CD renders Helm charts with `helm template` and applies the result itself. **`helm list` shows nothing**: Argo CD, not Helm, owns the release.

### Lab 15.4: Install Argo CD on kind
```bash
helm uninstall taskq -n taskq                 # Argo CD will own taskq from now on
kubectl create namespace argocd
kubectl apply -n argocd --server-side --force-conflicts \
  -f https://raw.githubusercontent.com/argoproj/argo-cd/stable/manifests/install.yaml
kubectl -n argocd rollout status deploy/argocd-server
kubectl -n argocd get secret argocd-initial-admin-secret -o jsonpath='{.data.password}' | base64 -d; echo
kubectl -n argocd port-forward svc/argocd-server 8443:443 &
# open https://localhost:8443  (user: admin)
```

### Lab 15.5: Let Git drive the cluster
The Application points at this repository's `main` branch, so **commit and push** the chart first.

```bash
kubectl apply -f taskq/argocd/application-kind.yaml
kubectl -n argocd get applications -w         # OutOfSync, then Synced/Healthy
kubectl -n taskq get pods
```

Then try each of these and watch the UI:
1. **Change through Git**: edit `worker.replicas: 3` in [values-kind.yaml](taskq/helm/taskq/values-kind.yaml), commit and push. Within about 3 minutes (the default polling interval), the worker scales.
2. **Drift**: `kubectl -n taskq scale deploy/worker --replicas=1`. `selfHeal` puts it back. Turn `selfHeal` off and the app shows `OutOfSync` instead.
3. **Bad change**: commit `image.tag: broken`. The app shows `Degraded`, but the old pods keep serving. Recover with `git revert` and push. **The fix is a commit**, not a `kubectl` command.
4. **Prune**: set `pdb.enabled: false`, push, and the PDBs are deleted.

### What goes in which repo
Real setups separate the **app repo** (source code, CI builds images) from the **config repo** (charts and values per environment). CI's last step is a commit that bumps `image.tag` in the config repo. Argo CD Image Updater can do that commit for you. One repo is fine for this learning path.

**Check yourself**
1. Why doesn't `helm list` show taskq when Argo CD deploys it?
2. A colleague hot-fixes production with `kubectl edit`. What happens with and without `selfHeal`, and which do you want during an incident?
3. Why does the chart omit `replicas` when HPA is enabled?
4. What does `helm rollback` do to the revision history?
