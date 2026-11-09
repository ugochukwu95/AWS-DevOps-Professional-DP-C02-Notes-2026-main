# 20 CKA - networking, extensibility and exam technique (Weeks 17-18)

**Goal**: cover the remaining CKA curriculum topics that the main path doesn't (NetworkPolicy, Gateway API, Kustomize, CRDs and operators, and a handful of smaller objects), then practise doing everything at exam speed.

## The exam in brief
Check the [CNCF curriculum](https://github.com/cncf/curriculum) and the candidate handbook before booking: domains, weights, the Kubernetes version and allowed resources all change. At the time of writing:

| Fact | Detail |
| --- | --- |
| Format | Performance-based: about 15-20 tasks in a remote Linux desktop, solved with `kubectl` and SSH to nodes |
| Time | 2 hours |
| Pass mark | 66% |
| Allowed resources | Kubernetes docs (`kubernetes.io/docs`, `/blog`) and a few project docs listed in the handbook, in the exam browser |
| Included | One free retake, and two killer.sh simulator sessions |

| Domain | Weight | Where to study it |
| --- | --- | --- |
| Troubleshooting | 30% | Notes 10, 18, and note 19 part 5 |
| Cluster architecture, installation and configuration | 25% | Notes 09, 15, 19, and Kustomize and CRDs below |
| Services and networking | 20% | Notes 03, 05, and NetworkPolicy and Gateway API below |
| Workloads and scheduling | 15% | Notes 05-07, 16, and the "smaller objects" section below |
| Storage | 10% | Note 08, and static PVs below |

## Part 1: NetworkPolicy
By default every pod can reach every other pod. A NetworkPolicy **selects pods** and, for those pods, allows only what its rules list. The rules for selected pods:
- Once *any* policy with `Ingress` in `policyTypes` selects a pod, all inbound traffic not allowed by some policy is dropped. The same applies to `Egress`.
- Policies are **additive**. There's no deny rule: you deny by selecting a pod and not allowing the traffic.
- Rules match `podSelector`, `namespaceSelector`, `ipBlock`, and ports.
- The CNI enforces policies. A CNI that doesn't support them (Flannel, for example) **silently ignores** them.
- Traffic from the pod's own node (kubelet probes) is always allowed.

### The AND vs OR trap
```yaml
ingress:
  - from:
      - namespaceSelector: { matchLabels: { team: a } }
        podSelector: { matchLabels: { app: client } }     # ONE element: namespace team=a AND pod app=client
---
ingress:
  - from:
      - namespaceSelector: { matchLabels: { team: a } }
      - podSelector: { matchLabels: { app: client } }     # TWO elements: any pod in team=a, OR app=client in this namespace
```

One dash difference, completely different meaning. This is one of the most common exam mistakes.

### Lab 20.1: Lock down taskq
Requires Postgres inside the cluster (`PG_MODE=cluster`, note 08) and an enforcing CNI: Calico on the kubeadm cluster from note 19, or kind (recent kind versions ship kindnetd with NetworkPolicy support, which step 1 below proves either way).

The policies are in [k8s/networkpolicy/networkpolicies.yaml](taskq/k8s/networkpolicy/networkpolicies.yaml): default deny, allow DNS, api (in: 8080, out: Postgres), worker (in: 8081, out: Postgres and 443), Postgres (in: api and worker only).

```bash
# 1. Prove enforcement exists: default deny alone should break the app
kubectl apply -f - <<EOF
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata: { name: default-deny, namespace: taskq }
spec: { podSelector: {}, policyTypes: ["Ingress", "Egress"] }
EOF
kubectl -n taskq rollout restart deploy/api
kubectl -n taskq get pods                 # new api pods never become Ready (no DNS, no Postgres)

# 2. Apply the full set
kubectl apply -f k8s/networkpolicy/networkpolicies.yaml
kubectl -n taskq get netpol
kubectl -n taskq rollout status deploy/api
curl -s -XPOST localhost:8080/jobs -d '{"payload":{"netpol":true}}'    # works again

# 3. Prove the restrictions
kubectl -n taskq run probe --rm -it --image=nicolaka/netshoot --restart=Never -- \
  sh -c 'nc -vz -w3 postgres 5432; nc -vz -w3 api 80'
# postgres: times out (probe isn't api or worker). api: also times out, because default-deny blocks the probe's egress

kubectl -n taskq run probe --rm -it --image=nicolaka/netshoot --restart=Never \
  --labels=app.kubernetes.io/name=api -- nc -vz -w3 postgres 5432
# succeeds: the probe now looks like an api pod. Labels are identity for NetworkPolicy, so guard who can set them
```

Things to notice:
- The Postgres backup CronJob from note 17 is now blocked. Add a policy for it, which is good practice.
- Without the `allow-dns` policy, *everything* breaks with DNS timeouts, which looks like drill 1 in note 18. "Default deny without DNS" is a classic exam and real-world bug.
- `kubectl describe netpol <name>` prints the rules in plain English. Use it to check your YAML.

Exam-style tasks to practise: allow only namespace X to reach a pod on one port; deny all egress except DNS and one CIDR (`ipBlock` with `except`); fix a policy whose selector labels don't match any pod.

## Part 2: Ingress, Gateway API and controllers
- **Ingress** (`networking.k8s.io/v1`) is the older L7 API: host and path rules to Services, with TLS from a Secret. It needs a controller. You used the AWS Load Balancer Controller in note 14. The community `ingress-nginx` controller was retired in 2026, but the Ingress *API* is still part of Kubernetes and still on the exam.
- **Gateway API** (`gateway.networking.k8s.io`) is its successor. It splits responsibilities across separate resources:

| Resource | Owned by | Purpose |
| --- | --- | --- |
| `GatewayClass` | Infrastructure provider | Which controller implements gateways (like `IngressClass`) |
| `Gateway` | Cluster operator | A listener: port, protocol, hostname, TLS certificate, and which namespaces may attach routes |
| `HTTPRoute` (also `GRPCRoute`, `TLSRoute`, ...) | App team | Match on host, path or headers, then send to `backendRefs` with weights (canaries) |

### Lab 20.2: Gateway API for taskq on kind
Use one implementation (Envoy Gateway here). Check its docs for the current install command and version.

```bash
helm install eg oci://docker.io/envoyproxy/gateway-helm --version <latest> -n envoy-gateway-system --create-namespace
kubectl -n envoy-gateway-system rollout status deploy/envoy-gateway
kubectl get crd | grep gateway.networking.k8s.io
```

```yaml
apiVersion: gateway.networking.k8s.io/v1
kind: GatewayClass
metadata: { name: eg }
spec:
  controllerName: gateway.envoyproxy.io/gatewayclass-controller
---
apiVersion: gateway.networking.k8s.io/v1
kind: Gateway
metadata: { name: web, namespace: taskq }
spec:
  gatewayClassName: eg
  listeners:
    - name: http
      protocol: HTTP
      port: 80
---
apiVersion: gateway.networking.k8s.io/v1
kind: HTTPRoute
metadata: { name: api, namespace: taskq }
spec:
  parentRefs: [{ name: web }]
  hostnames: ["api.taskq.local"]
  rules:
    - matches: [{ path: { type: PathPrefix, value: /jobs } }]
      backendRefs: [{ name: api, port: 80 }]
```

```bash
kubectl -n taskq get gateway web                 # PROGRAMMED=True
kubectl -n taskq describe httproute api          # Accepted, ResolvedRefs conditions
kubectl -n envoy-gateway-system get svc          # the generated proxy Service
kubectl -n envoy-gateway-system port-forward svc/<envoy-taskq-web-...> 8888:80 &
curl -s -H 'Host: api.taskq.local' -XPOST localhost:8888/jobs -d '{"payload":{"via":"gateway"}}'
```

If you applied the NetworkPolicies from Part 1, the api policy still allows 8080 from anywhere, so the gateway works. Tighten it to allow only the gateway's namespace as an exercise.

Practise translating an Ingress into a Gateway and HTTPRoute (the exam has asked for migrations like this), and splitting traffic between two backends with `weight`.

## Part 3: Kustomize
Built into kubectl (`kubectl apply -k`, `kubectl kustomize`). It patches plain YAML without templates: a **base** plus **overlays**.

### Lab 20.3: A taskq overlay
Kustomize only reads files inside its own directory tree, so work on a copy:

```bash
mkdir -p /tmp/kz/base /tmp/kz/overlays/staging
cp Kubernetes/taskq/k8s/[0-9]*.yaml /tmp/kz/base/
cat > /tmp/kz/base/kustomization.yaml <<EOF
resources:
  - 00-namespace.yaml
  - 10-config.yaml
  - 15-serviceaccounts.yaml
  - 40-api.yaml
  - 50-worker.yaml
  - 60-rbac.yaml
  - 70-pdb.yaml
EOF
cat > /tmp/kz/overlays/staging/kustomization.yaml <<EOF
resources: ["../../base"]
namespace: taskq-staging
images:
  - name: taskq
    newTag: v2
labels:
  - pairs: { env: staging }
    includeSelectors: false
replicas:
  - name: api
    count: 3
patches:
  - target: { kind: Deployment, name: worker }
    patch: |-
      - op: replace
        path: /spec/template/spec/containers/0/resources/limits/memory
        value: 256Mi
configMapGenerator:
  - name: taskq-config
    behavior: merge
    literals: ["WORK_DURATION=1s"]
EOF
kubectl kustomize /tmp/kz/overlays/staging | less       # read it: namespace, image, replicas, patch
```

Find each change in the output: every object's `metadata.namespace`, the image tag, the api replica count, the worker memory limit, and the merged ConfigMap (which also gets a hash suffix, with references updated to match). Also check what happened to the `Namespace` object itself. Then `kubectl apply -k /tmp/kz/overlays/staging` and confirm with `kubectl -n taskq-staging get all`. Know the main fields: `resources`, `namespace`, `namePrefix`, `images`, `replicas`, `patches` (strategic merge or JSON 6902), `configMapGenerator` and `secretGenerator`.

**Helm vs Kustomize**: Helm templates and packages, with release history. Kustomize patches plain YAML and has no state. Argo CD supports both. The exam may ask you to install a chart with Helm (`helm install`, `--set`, `-n`, `helm upgrade`, `helm list -A`) or to apply a Kustomize directory.

## Part 4: CRDs and operators
A **CustomResourceDefinition** adds a new API type. An **operator** is a controller that watches those custom resources and does the work, using the same reconcile pattern as built-in controllers (note 05). You've already used several:

```bash
kubectl get crd                                     # Argo CD's applications.argoproj.io, Gateway API types...
kubectl explain application.spec --api-version=argoproj.io/v1alpha1
kubectl api-resources --api-group=argoproj.io
```

### Lab 20.4: Define your own type
```yaml
apiVersion: apiextensions.k8s.io/v1
kind: CustomResourceDefinition
metadata:
  name: backups.taskq.example.com        # must be <plural>.<group>
spec:
  group: taskq.example.com
  scope: Namespaced
  names: { plural: backups, singular: backup, kind: Backup, shortNames: [bk] }
  versions:
    - name: v1
      served: true
      storage: true
      schema:
        openAPIV3Schema:
          type: object
          properties:
            spec:
              type: object
              required: [schedule]
              properties:
                schedule: { type: string }
                retain: { type: integer, minimum: 1, default: 7 }
      additionalPrinterColumns:
        - { name: Schedule, type: string, jsonPath: .spec.schedule }
        - { name: Retain, type: integer, jsonPath: .spec.retain }
```

```bash
kubectl apply -f backup-crd.yaml
kubectl -n taskq apply -f - <<EOF
apiVersion: taskq.example.com/v1
kind: Backup
metadata: { name: hourly }
spec: { schedule: "0 * * * *" }
EOF
kubectl -n taskq get bk                 # Retain shows 7 (the schema default)
kubectl -n taskq apply -f - <<EOF
apiVersion: taskq.example.com/v1
kind: Backup
metadata: { name: bad }
spec: { retain: 0 }
EOF
# rejected: spec.schedule is required, and spec.retain must be >= 1
```

Nothing *happens* when you create a Backup, because there's no controller. Writing one (in Go with controller-runtime or kubebuilder, turning `Backup` objects into the CronJob from note 17) is an excellent follow-up project, but it isn't needed for the exam. For the exam: install an operator from a manifest or Helm chart, list its CRDs, create or inspect its custom resources, and read their `status`.

## Part 5: Smaller objects the exam expects
Each of these is a 5-minute exercise against your kind or kubeadm cluster. Do every one at least twice.

| Topic | Exercise |
| --- | --- |
| **Jobs and CronJobs** | `kubectl create job pi --image=perl -- perl -Mbignum=bpi -wle 'print bpi(200)'`. Know `completions`, `parallelism`, `backoffLimit`, `activeDeadlineSeconds`, `ttlSecondsAfterFinished`. `kubectl create cronjob ... --schedule="*/5 * * * *"` |
| **DaemonSets** | Run netshoot on every node, including the control plane (add a toleration for `node-role.kubernetes.io/control-plane:NoSchedule`) |
| **Init containers** | Make the api wait for Postgres: `initContainers` running `until pg_isready -h postgres; do sleep 2; done` |
| **Native sidecars** | An init container with `restartPolicy: Always` that tails a shared `emptyDir` log file. It starts before and stops after the main container |
| **Multi-container pods** | Two containers sharing `emptyDir`; `kubectl logs <pod> -c <container>`; `kubectl exec -c` |
| **ConfigMap and Secret volumes** | Mount a ConfigMap as files, use `items` to choose keys, watch a volume update (unlike env vars, note 06) |
| **Static PV and PVC** | Create a `hostPath` PV with `storageClassName: ""`, and a PVC that binds to it. Understand `Retain` and `Released`, and why a Released PV won't rebind until you clear its `claimRef` |
| **StorageClass default** | Find, change and remove the default annotation. Create a PVC that uses a non-default class |
| **Manual scheduling** | Set `spec.nodeName` directly, bypassing the scheduler (works even when the scheduler is down, note 19 part 5) |
| **PriorityClass** | Create a high-priority class for Postgres, fill the nodes, and watch preemption |
| **ResourceQuota and LimitRange** | Note 07. Exceed a quota and read the error on the *ReplicaSet* events, not the Deployment |
| **Pod security context** | `runAsUser`, `fsGroup`, `capabilities`, `readOnlyRootFilesystem`: the taskq manifests are a reference |
| **Service types** | Create `ClusterIP`, `NodePort` and headless Services imperatively: `kubectl expose deploy api --port=80 --target-port=8080 --type=NodePort` |
| **CoreDNS** | Find the Corefile, add a `hosts` entry or a stub domain, and test with `dig` |
| **kube-proxy** | Find its mode (`kubectl -n kube-system get cm kube-proxy -o yaml \| grep mode`) and the rules it writes |
| **In-place pod resize** | Change a running container's CPU request with `kubectl patch pod ... --subresource resize` and check whether it restarted (availability depends on the version: check the docs for your exam's version) |

## Part 6: Exam technique
Speed matters as much as knowledge. Most people who fail run out of time.

### Setup in the first minute
`k` = `kubectl` with completion is normally preconfigured. Add:

```bash
export do="--dry-run=client -o yaml"     # k create deploy x --image=nginx $do > x.yaml
export now="--force --grace-period=0"    # k delete pod x $now
```

Vim: `set expandtab tabstop=2 shiftwidth=2` in `~/.vimrc` so YAML indentation stays correct when you paste.

### Habits that earn points
1. **Run the `kubectl config use-context ...` command printed at the top of every task, every time.** Solving a task on the wrong cluster scores zero.
2. **Generate YAML; don't write it**: `k create deploy|svc|job|cronjob|cm|secret|sa|role|rolebinding|ingress ... $do`, and `k run pod --image=... $do`. Edit only what's missing.
3. **`k explain <resource>.<field> --recursive | less`** is faster than the docs for field names.
4. **Docs**: search for the concept page ("network policy", "etcd backup", "kubeadm upgrade") and copy examples. Know where the examples are for NetworkPolicy, PV/PVC, etcd, kubeadm upgrade, and Ingress/Gateway.
5. **Verify every task** (`k get`, `k describe`, `curl` from a pod) before moving on. A task that's 90% right often scores like 0%.
6. **Skip and flag**: if a task takes more than about 7 minutes, flag it and come back. Low-weight tasks are worth exactly as much time as high-weight ones are worth points.
7. **SSH tasks**: `ssh <node>`, then `sudo -i`, then do the work, then `exit` **back to the base host** before the next task.
8. **Output to files exactly as asked**: `k get pods -A --sort-by=.metadata.creationTimestamp -o name > /opt/answer.txt`. The grader checks the path and format.

### Output tricks to practise until automatic
```bash
k get pods -A -o wide --show-labels
k get pods -l app.kubernetes.io/name=api -o jsonpath='{.items[*].metadata.name}'
k get nodes -o jsonpath='{range .items[*]}{.metadata.name}{"\t"}{.status.nodeInfo.kubeletVersion}{"\n"}{end}'
k get pods -A -o custom-columns=NS:.metadata.namespace,POD:.metadata.name,NODE:.spec.nodeName
k get pods --sort-by=.status.containerStatuses[0].restartCount
k top pods -A --sort-by=memory | head
k get events -A --sort-by=.lastTimestamp | tail
k api-resources --namespaced=false
k auth can-i --list --as=system:serviceaccount:taskq:worker -n taskq
```

## Part 7: A two-week CKA sprint (weeks 17-18)

| Days | Work |
| --- | --- |
| 1-2 | Note 19 parts 1-2: build the kubeadm cluster twice, the second time from the docs only |
| 3 | etcd backup and restore, three times, from the docs only |
| 4 | Upgrade the cluster. Then rebuild and upgrade again |
| 5 | Control-plane troubleshooting: every row of note 19 part 5 |
| 6 | Certificates, the CSR user, kubeconfig editing |
| 7 | NetworkPolicy: Lab 20.1 plus 10 self-written tasks |
| 8 | Gateway API and Ingress, Kustomize, Helm commands |
| 9 | CRDs, plus the Part 5 table |
| 10 | **killer.sh session 1**: do it timed, then spend the rest of the day reviewing every answer |
| 11-12 | Redo weak areas. The drill picker in note 18, at speed |
| 13 | **killer.sh session 2** |
| 14 | Light review of Part 6 and your journal. Rest |

## Checklist
- [ ] NetworkPolicy: you can explain AND vs OR selectors, and lock down taskq without breaking DNS
- [ ] Gateway API: you can expose a Service with a Gateway and HTTPRoute, and convert an Ingress
- [ ] Kustomize: overlays with images, replicas, patches and generators
- [ ] CRDs: you can create one with validation, and inspect an operator's resources
- [ ] Every row in the Part 5 table, done twice
- [ ] Both killer.sh sessions completed and reviewed, scoring comfortably above the pass mark on the second
