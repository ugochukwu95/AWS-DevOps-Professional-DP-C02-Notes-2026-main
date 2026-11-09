# 00 Local cluster setup with kind

## Why a local cluster
The Kubernetes docs recommend a local environment for learning. You can destroy and recreate it in about a minute, break it without consequences, and it costs nothing. Everything in weeks 1-6 runs locally. EKS only appears in week 7, once you know what a healthy cluster looks like.

## Why kind (and not minikube)
**kind** ("Kubernetes in Docker") runs each Kubernetes *node* as a Docker container. Inside each node container, `containerd` runs your pods.

| | kind | minikube |
| --- | --- | --- |
| Node model | Each node is a Docker container | One VM or container per node (Docker, HyperKit, QEMU drivers) |
| Multi-node | First-class, declared in one config file | Supported (`--nodes`), less common |
| Startup | ~30-60 seconds | ~1-2 minutes |
| Addons | None built in, you install what you need | `minikube addons enable ingress/metrics-server/dashboard` |
| Load local images | `kind load docker-image` | `minikube image load` |
| Best for | CI, multi-node scheduling, node-failure drills | A batteries-included single-node lab |

kind is the choice here because:
- You need **multiple nodes** for scheduling, spreading, draining and node-failure drills.
- "Stop a node" is just `docker stop taskq-worker`, which is a very realistic failure.
- No addons means you install metrics-server and other components yourself, so you understand them.

**Check yourself**: kind nodes are containers. What does that mean for the pods running "inside" a node? (They are processes inside the node container's namespaces, run by `containerd` in that container. `docker exec taskq-worker crictl ps` shows them.)

## Prerequisites

| Tool | Check | Install |
| --- | --- | --- |
| Docker Desktop | `docker version` shows a *Server* section | Already installed. Start the app |
| `kubectl` | `kubectl version --client` | Already installed |
| Go | `go version` | Already installed |
| kind | `kind version` | `brew install kind` |
| `jq` (optional) | `jq --version` | `brew install jq` |

### Docker Desktop resources
Docker Desktop runs a Linux VM. Your cluster gets only what that VM gets.

1. Open **Docker Desktop > Settings > Resources**.
2. Set **CPUs: 4+**, **Memory: 6-8 GB**, **Disk: 40 GB+**.
3. Apply and restart.

Three kind nodes plus Postgres idle at around 2 GB. The memory drills need headroom.

## Step 1: Install kind
```bash
brew install kind
kind version
```

## Step 2: The cluster config
The config is in [taskq/kind-config.yaml](taskq/kind-config.yaml):

```yaml
kind: Cluster
apiVersion: kind.x-k8s.io/v1alpha4
name: taskq
nodes:
  - role: control-plane
    extraPortMappings:
      - containerPort: 30080   # NodePort of the api Service
        hostPort: 8080         # http://localhost:8080 on your Mac
        protocol: TCP
  - role: worker
  - role: worker
```

What each part does:
- **`name: taskq`**: the cluster name. Node containers become `taskq-control-plane`, `taskq-worker`, `taskq-worker2`, and the kubectl context becomes `kind-taskq`.
- **One control-plane and two workers**: this is enough for anti-affinity, topology spread, cordon and drain, and "a node died" drills.
- **`extraPortMappings`**: Docker publishes port 8080 on your Mac to port 30080 on the control-plane container. A `NodePort` Service on 30080 is reachable on *every* node (kube-proxy programs every node), so `localhost:8080` reaches the API.

## Step 3: Create the cluster
From the `taskq` folder:

```bash
cd Kubernetes/taskq
kind create cluster --config kind-config.yaml
# or: make cluster-up
```

Inspect what you just built:

```bash
kind get clusters                       # taskq
kubectl config current-context          # kind-taskq
kubectl cluster-info                    # API server URL (a random localhost port)
kubectl get nodes -o wide               # 3 nodes, their INTERNAL-IP on the kind network
docker ps --filter name=taskq           # the node containers
docker network inspect kind | jq '.[0].IPAM.Config'   # the kind bridge subnet
kubectl get pods -A                     # system pods: CoreDNS, kube-proxy, kindnet, etcd...
```

Look at what is running in `kube-system` and write down what each one does:

| Pod | Role |
| --- | --- |
| `etcd-taskq-control-plane` | Cluster state database |
| `kube-apiserver-*` | The only component that talks to etcd. Everything else talks to it |
| `kube-controller-manager-*` | Reconciliation loops (Deployments to ReplicaSets to Pods, node lifecycle) |
| `kube-scheduler-*` | Picks a node for each new pod |
| `coredns-*` | Cluster DNS (`*.svc.cluster.local`) |
| `kube-proxy-*` | Programs iptables/nftables rules so Service IPs work, one per node |
| `kindnet-*` | kind's simple CNI: gives pods IPs and routes between nodes |
| `local-path-provisioner` (in `local-path-storage`) | Creates PersistentVolumes from node disk. The `standard` StorageClass |

## Step 4: kubectl contexts
`kubectl` talks to whatever cluster the *current context* points to. Later you'll have both `kind-taskq` and an EKS context. Running a command against the wrong one is a classic mistake.

```bash
kubectl config get-contexts
kubectl config use-context kind-taskq
kubectl config set-context --current --namespace=taskq   # default namespace for this context
```

Tip: show the current context in your shell prompt, or always pass `--context` in scripts.

## Step 5: PostgreSQL in Docker Desktop (outside the cluster)
At first Postgres runs as a plain Docker container, **not** in Kubernetes. That keeps the first Kubernetes weeks focused on stateless workloads, and it mirrors a real setup where the database is managed outside the cluster (RDS, for example).

Attach it to the **`kind` Docker network**, which kind created in step 3. The node containers are on that network, so pods (whose traffic is NATed through their node) can reach it.

```bash
docker run -d --name taskq-pg \
  --network kind \
  -p 5432:5432 \
  -e POSTGRES_USER=taskq -e POSTGRES_PASSWORD=taskq -e POSTGRES_DB=taskq \
  -v taskq-pgdata:/var/lib/postgresql/data \
  postgres:17
# or: make pg-up
```

- `-p 5432:5432` lets the Go binaries on your Mac reach it at `localhost:5432` (week 1).
- `-v taskq-pgdata:...` is a named volume, so data survives `docker rm`.

Check it:

```bash
docker exec -it taskq-pg psql -U taskq -c 'select version();'
docker inspect -f '{{(index .NetworkSettings.Networks "kind").IPAddress}}' taskq-pg
```

### Making Postgres reachable by a stable name inside the cluster
Pods should connect to `postgres.taskq.svc.cluster.local`, not a hard-coded IP. A **Service without a selector**, plus a manually written **EndpointSlice**, maps that name to the container's IP. The template is [taskq/k8s/postgres-external.yaml.tmpl](taskq/k8s/postgres-external.yaml.tmpl):

```yaml
apiVersion: v1
kind: Service
metadata:
  name: postgres
  namespace: taskq
spec:
  ports:
    - name: postgres
      port: 5432
      targetPort: 5432
---
apiVersion: discovery.k8s.io/v1
kind: EndpointSlice
metadata:
  name: postgres-external
  namespace: taskq
  labels:
    kubernetes.io/service-name: postgres   # links the slice to the Service
addressType: IPv4
ports:
  - name: postgres
    port: 5432
    protocol: TCP
endpoints:
  - addresses: ["PG_IP"]
```

`make pg-endpoint` substitutes the container's real IP and applies it. If you recreate the Postgres container, its IP can change, so run `make pg-endpoint` again. (That is a good small drill in itself.)

**Fallback**: if pods can't reach the `kind` network IP, use an `ExternalName` Service that points to Docker Desktop's host alias. It goes through the published port 5432 on your Mac:

```yaml
apiVersion: v1
kind: Service
metadata:
  name: postgres
  namespace: taskq
spec:
  type: ExternalName
  externalName: host.docker.internal
```

`ExternalName` is just a DNS CNAME, so the client connects directly to port 5432 on the target. There is no proxying and no port remapping.

**Check yourself**: why does the Service+EndpointSlice approach give you a ClusterIP, while `ExternalName` doesn't? What does each look like in `dig` from inside a pod?

## Step 6: Build and load the image
kind nodes can't see your Mac's local Docker images. You either push to a registry or **copy the image into every node**:

```bash
docker build -t taskq:dev .
kind load docker-image taskq:dev --name taskq
docker exec taskq-worker crictl images | grep taskq    # proof it's on the node
```

`imagePullPolicy` matters here:
- Tag `:latest` defaults to `Always`, so the kubelet tries to pull from Docker Hub and fails with `ErrImagePull`.
- Tag `:dev` defaults to `IfNotPresent`, so it uses the loaded image. This is why taskq uses `:dev`.
- After rebuilding with the same tag, existing pods keep the old image until they are recreated: `kubectl rollout restart deploy/api`. `make redeploy` does build, load and restart in one go.

## Step 7: Deploy taskq
```bash
make deploy          # namespace, config, postgres endpoint, api, worker
kubectl -n taskq get pods -o wide
curl -s localhost:8080/healthz
curl -s -XPOST localhost:8080/jobs -d '{"payload":{"n":1}}'
```

(The details of the manifests are covered in notes 05 and 06. For now, confirm the loop works end to end.)

## Delete and recreate
```bash
kind delete cluster --name taskq     # or: make cluster-down
make reset                           # delete + create + pg-endpoint + build + load + deploy
```

Postgres survives a cluster reset because it is a Docker container with a named volume, not part of the cluster. `make pg-down` removes the container, and `docker volume rm taskq-pgdata` wipes the data.

## Useful kind commands

| Command | Purpose |
| --- | --- |
| `kind get nodes --name taskq` | List node containers |
| `docker exec -it taskq-worker bash` | Shell into a node, then `crictl ps`, `crictl logs`, `journalctl -u kubelet` |
| `kind export logs --name taskq ./kind-logs` | Dump all node and kubelet logs for debugging |
| `docker stop taskq-worker2` | Simulate a node failure |
| `docker start taskq-worker2` | Bring it back |

## Common setup problems

| Symptom | Likely cause | Fix |
| --- | --- | --- |
| `Cannot connect to the Docker daemon` | Docker Desktop not running | Start Docker Desktop |
| `kind create` hangs on "Starting control-plane" | VM out of memory or CPU | Raise Docker Desktop resources |
| `port is already allocated` on create | Something on your Mac uses 8080 | `lsof -i :8080`, or change `hostPort` |
| Pods `ErrImagePull` for `taskq:dev` | Image not loaded into nodes | `kind load docker-image taskq:dev --name taskq` |
| api not ready, logs show `connection refused` to postgres | EndpointSlice has a stale IP, or the container isn't on the `kind` network | `make pg-endpoint`, then `docker network inspect kind` |
| `kubectl` talks to the wrong cluster | Wrong context | `kubectl config use-context kind-taskq` |
