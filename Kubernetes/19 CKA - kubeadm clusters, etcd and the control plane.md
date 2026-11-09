# 19 CKA - kubeadm clusters, etcd and the control plane (Weeks 17-18)

**Goal**: fill the biggest gap between this path and the CKA exam. kind and EKS hide the control plane from you; the CKA expects you to install it, upgrade it, back it up, and repair it when it breaks.

Everything here runs on two Ubuntu VMs on your Mac. The exam clusters are built with kubeadm on Ubuntu, so practise in the same environment.

## What changes compared with kind and EKS

| Task | kind | EKS | kubeadm (exam) |
| --- | --- | --- | --- |
| Install the control plane | `kind create cluster` | AWS | `kubeadm init`, then install a CNI yourself |
| Add a node | Config file | Node group | `kubeadm join` with a token |
| Upgrade | Recreate | Terraform / AWS | `kubeadm upgrade` and package upgrades, node by node |
| etcd backup | n/a | AWS | `etcdctl snapshot save` |
| Control-plane components | Static pods, hidden in a container | Invisible | **Static pods** in `/etc/kubernetes/manifests` that you can break and fix |
| Certificates | Automatic | AWS | `kubeadm certs check-expiration` and `renew` |

## Part 1: Build a two-node kubeadm cluster

### Create the VMs (Multipass)
```bash
brew install --cask multipass
multipass launch 24.04 --name cp     --cpus 2 --memory 4G --disk 20G
multipass launch 24.04 --name worker --cpus 2 --memory 3G --disk 20G
multipass list                         # note both IPs (192.168.64.x)
```

kubeadm's preflight checks require at least 2 CPUs and about 1.7 GB of memory on the control plane. Multipass uses `192.168.64.0/24` on macOS, so the pod network below uses `10.244.0.0/16` to avoid overlapping with it.

### Prepare both nodes
The script [taskq/cka/node-setup.sh](taskq/cka/node-setup.sh) does what the kubeadm install docs describe, in this order: disable swap; load `overlay` and `br_netfilter`; set `ip_forward` and the bridge sysctls; install containerd with the **systemd cgroup driver**; install `kubelet`, `kubeadm` and `kubectl` from `pkgs.k8s.io` and **hold** them; configure `crictl`.

```bash
cd Kubernetes/taskq/cka
for vm in cp worker; do
  multipass transfer node-setup.sh $vm:/tmp/node-setup.sh
  multipass exec $vm -- sudo K8S_MINOR=v1.35 bash /tmp/node-setup.sh
done
```

Read the script before running it. On the exam you won't install packages, but you will be asked about these settings, and you'll debug nodes where one of them is wrong. A kubelet with the wrong cgroup driver is a classic example.

### Initialise the control plane
```bash
multipass shell cp
sudo kubeadm init --pod-network-cidr=10.244.0.0/16 --apiserver-advertise-address=$(hostname -I | awk '{print $1}')
mkdir -p ~/.kube && sudo cp /etc/kubernetes/admin.conf ~/.kube/config && sudo chown $(id -u):$(id -g) ~/.kube/config
kubectl get nodes          # cp is NotReady: there's no CNI yet
kubectl -n kube-system get pods   # coredns Pending for the same reason
```

What `kubeadm init` did, phase by phase (`kubeadm init --help` lists them):
1. **preflight**: checks swap, ports, the container runtime and resources.
2. **certs**: creates a CA and every certificate in `/etc/kubernetes/pki`.
3. **kubeconfig**: writes `admin.conf`, `super-admin.conf`, `controller-manager.conf`, `scheduler.conf` and `kubelet.conf` to `/etc/kubernetes`.
4. **control-plane** and **etcd**: writes static pod manifests to `/etc/kubernetes/manifests`.
5. **kubelet-start**: starts the kubelet, which runs those static pods.
6. **upload-config**, **mark-control-plane** (taint and label), **bootstrap-token**, **addon** (CoreDNS and kube-proxy).

### Install a CNI (Calico, which enforces NetworkPolicy)
```bash
CALICO_VERSION=v3.31.0     # check https://github.com/projectcalico/calico/releases for the latest
curl -fsSLO https://raw.githubusercontent.com/projectcalico/calico/${CALICO_VERSION}/manifests/calico.yaml
# Set the pool to match --pod-network-cidr
sed -i 's|# - name: CALICO_IPV4POOL_CIDR|- name: CALICO_IPV4POOL_CIDR|; s|#   value: "192.168.0.0/16"|  value: "10.244.0.0/16"|' calico.yaml
grep -A1 CALICO_IPV4POOL_CIDR calico.yaml
kubectl apply -f calico.yaml
kubectl -n kube-system get pods -w      # calico-node Running, then coredns Running
kubectl get nodes                        # cp Ready
```

### Join the worker
```bash
# on cp
kubeadm token create --print-join-command
# on worker
multipass shell worker
sudo kubeadm join 192.168.64.x:6443 --token ... --discovery-token-ca-cert-hash sha256:...
# on cp
kubectl get nodes -o wide
```

Bootstrap tokens expire after 24 hours, so the `kubeadm init` output stops working the next day. `--print-join-command` creates a fresh one.

Then copy the kubeconfig to your Mac and deploy taskq there too (push the image to a registry, or `docker save` it and run `ctr -n k8s.io images import` on each node). That gives you a third environment for the NetworkPolicy labs in note 20.

```bash
multipass exec cp -- sudo cat /etc/kubernetes/admin.conf > ~/.kube/kubeadm-lab.conf
KUBECONFIG=~/.kube/config:~/.kube/kubeadm-lab.conf kubectl config view --flatten > /tmp/merged && mv /tmp/merged ~/.kube/config
kubectl config get-contexts       # kubernetes-admin@kubernetes
```

**Snapshots save time**: `multipass stop cp worker && multipass snapshot cp && multipass snapshot worker`. Then break things freely and `multipass restore` afterwards.

## Part 2: Control-plane anatomy (memorise these paths)

| Path | What's there |
| --- | --- |
| `/etc/kubernetes/manifests/` | Static pod manifests: `kube-apiserver.yaml`, `kube-controller-manager.yaml`, `kube-scheduler.yaml`, `etcd.yaml` |
| `/etc/kubernetes/pki/` | CA, API server, kubelet-client, front-proxy and service-account keys. `etcd/` holds etcd's own CA and certificates |
| `/etc/kubernetes/*.conf` | kubeconfigs for admin, controller-manager, scheduler and kubelet |
| `/var/lib/kubelet/config.yaml` | KubeletConfiguration: `staticPodPath`, `cgroupDriver`, `clusterDNS`, eviction thresholds |
| `/etc/systemd/system/kubelet.service.d/10-kubeadm.conf` (or `/usr/lib/systemd/...`) | The kubelet's systemd drop-in: flags and the config file it uses |
| `/var/lib/etcd/` | etcd data (a hostPath of the etcd static pod) |
| `/var/log/pods/`, `/var/log/containers/` | Container logs on the node |

**Static pods**: the kubelet watches `staticPodPath` and runs any manifest it finds there, **without** the API server. That's how the API server can run before the API exists. The kubelet creates a read-only **mirror pod** in the API, named `<pod>-<nodename>`, so you can see it with `kubectl`. Deleting the mirror pod does nothing; editing or removing the file is what counts.

```bash
sudo ls /etc/kubernetes/manifests
grep staticPodPath /var/lib/kubelet/config.yaml
kubectl -n kube-system get pods -o wide | grep cp
sudo crictl ps                         # the same containers, from the runtime's view
```

### Lab 19.1: Make your own static pod
```bash
# on worker
sudo tee /etc/kubernetes/manifests/static-web.yaml <<EOF
apiVersion: v1
kind: Pod
metadata: { name: static-web }
spec:
  containers: [{ name: web, image: nginx }]
EOF
# on cp
kubectl get pods -o wide             # static-web-worker
kubectl delete pod static-web-worker # comes straight back
# on worker
sudo rm /etc/kubernetes/manifests/static-web.yaml   # now it's gone
```

## Part 3: etcd backup and restore
A classic exam task. etcd holds **all** cluster state. Back up to a file, restore from it.

### Back up
`etcdctl` needs the endpoint and three TLS files. Read them from the etcd manifest rather than memorising them:

```bash
sudo grep -E 'listen-client-urls|cert-file|key-file|trusted-ca-file' /etc/kubernetes/manifests/etcd.yaml
sudo apt-get install -y etcd-client    # if etcdctl isn't installed (it usually is on the exam)
# etcdutl may not be in the package. The etcd release tarball (github.com/etcd-io/etcd/releases) contains both.
# Match the version of the etcd image: sudo grep image: /etc/kubernetes/manifests/etcd.yaml

sudo ETCDCTL_API=3 etcdctl \
  --endpoints=https://127.0.0.1:2379 \
  --cacert=/etc/kubernetes/pki/etcd/ca.crt \
  --cert=/etc/kubernetes/pki/etcd/server.crt \
  --key=/etc/kubernetes/pki/etcd/server.key \
  snapshot save /opt/etcd-backup.db

sudo etcdutl snapshot status /opt/etcd-backup.db -w table   # older etcdctl: "etcdctl snapshot status"
```

### Restore
Restoring creates a **new data directory**, then you point etcd at it:

```bash
kubectl create ns before-restore-test     # something that should disappear after the restore

sudo etcdutl snapshot restore /opt/etcd-backup.db --data-dir /var/lib/etcd-restore
# older versions: sudo ETCDCTL_API=3 etcdctl snapshot restore /opt/etcd-backup.db --data-dir /var/lib/etcd-restore

sudo vi /etc/kubernetes/manifests/etcd.yaml
#   in the "etcd-data" hostPath volume: path: /var/lib/etcd  ->  path: /var/lib/etcd-restore
#   (if you also change --data-dir, change the volumeMount to match; simplest is to only change the hostPath)

# The kubelet notices the change and recreates etcd; the API server is unavailable for about a minute
watch sudo crictl ps                       # etcd and kube-apiserver restart
kubectl get ns                             # before-restore-test is gone
```

If the API server doesn't come back: `sudo crictl ps -a | grep -E 'etcd|apiserver'`, then `sudo crictl logs <id>`. The usual mistakes are a typo in the hostPath, or a restore into a directory that already existed.

## Part 4: Upgrading a kubeadm cluster
One minor version at a time. Control plane first, then each worker. Each node is drained before its kubelet is upgraded.

### Control-plane node
```bash
# 1. Point apt at the next minor version's repository
sudo sed -i 's/v1.35/v1.36/' /etc/apt/sources.list.d/kubernetes.list
sudo apt-get update
apt-cache madison kubeadm | head -3                    # pick the exact version, for example 1.36.1-1.1

# 2. Upgrade kubeadm itself and plan
sudo apt-mark unhold kubeadm && sudo apt-get install -y kubeadm=1.36.1-1.1 && sudo apt-mark hold kubeadm
sudo kubeadm upgrade plan
sudo kubeadm upgrade apply v1.36.1                      # rewrites the static pod manifests, upgrades CoreDNS and kube-proxy

# 3. Drain, upgrade kubelet and kubectl, restart, uncordon
kubectl drain cp --ignore-daemonsets
sudo apt-mark unhold kubelet kubectl && sudo apt-get install -y kubelet=1.36.1-1.1 kubectl=1.36.1-1.1 && sudo apt-mark hold kubelet kubectl
sudo systemctl daemon-reload && sudo systemctl restart kubelet
kubectl uncordon cp
```

### Each worker
```bash
# on worker: same repository change, then
sudo apt-mark unhold kubeadm && sudo apt-get install -y kubeadm=1.36.1-1.1 && sudo apt-mark hold kubeadm
sudo kubeadm upgrade node                               # updates the kubelet's configuration only
# on cp
kubectl drain worker --ignore-daemonsets --delete-emptydir-data
# on worker
sudo apt-mark unhold kubelet kubectl && sudo apt-get install -y kubelet=1.36.1-1.1 kubectl=1.36.1-1.1 && sudo apt-mark hold kubelet kubectl
sudo systemctl daemon-reload && sudo systemctl restart kubelet
# on cp
kubectl uncordon worker
kubectl get nodes                                       # both on v1.36.1
```

The exam usually asks for one node at a specific version. Read the task for the exact version and which components to upgrade, and note whether you should upgrade only the control plane.

## Part 5: Control-plane troubleshooting
Snapshot the VMs first. Then break each item, observe the symptom **from `kubectl` first** (that's what you'll see on the exam), and fix it on the node.

| Break it (on cp) | Symptom from kubectl | Find it | Fix |
| --- | --- | --- | --- |
| Typo in `kube-apiserver.yaml` (for example `--etcd-servers=https://127.0.0.1:2380`, or invalid YAML) | `The connection to the server ... :6443 was refused` | `sudo crictl ps -a \| grep apiserver`, `sudo crictl logs <id>`. If no container exists at all, the YAML is invalid: `sudo journalctl -u kubelet \| tail` | Fix the manifest and wait about 1 minute |
| Move `kube-scheduler.yaml` out of `/etc/kubernetes/manifests` | New pods stay `Pending` with **no events**, because nothing is scheduling them | `kubectl -n kube-system get pods` (no scheduler) | Move it back |
| Wrong `--kubeconfig` in `kube-controller-manager.yaml` | Deployments create no ReplicaSets, and `scale` does nothing | Controller-manager pod in CrashLoopBackOff, read its logs | Fix the path |
| `sudo systemctl stop kubelet` on worker | worker `NotReady` after about 40s | `systemctl status kubelet`, `journalctl -u kubelet` | `systemctl start kubelet` (and `enable` it) |
| Edit `/var/lib/kubelet/config.yaml` on worker: `cgroupDriver: cgroupfs` | worker `NotReady`, kubelet fails or restarts | `journalctl -u kubelet -f` complains about a cgroup driver mismatch with containerd | Set it back to `systemd` and restart the kubelet |
| Wrong CA path in `/etc/kubernetes/kubelet.conf` on worker | worker `NotReady` | `journalctl -u kubelet`: x509 or file-not-found errors | Fix the path |
| Move the `kubelet` binary, or set the wrong path in the systemd drop-in | worker `NotReady` | `systemctl status kubelet` shows exit code 203/EXEC | Fix the path, then `daemon-reload` and restart |
| `kubectl -n kube-system scale deploy coredns --replicas=0` | Pods can't resolve Service names | Drill 1 in note 18 | Scale it back |

The node-side commands to know without thinking:

```bash
sudo systemctl status kubelet
sudo journalctl -u kubelet --since "10 min ago" | tail -50
sudo crictl ps -a                    # includes exited containers
sudo crictl logs <container-id>
sudo crictl pods
sudo ls -l /etc/kubernetes/manifests
```

## Part 6: Certificates, users and kubeconfig

### Certificate expiry
```bash
sudo kubeadm certs check-expiration
sudo kubeadm certs renew all       # then restart the control-plane static pods: move the manifests out and back in
sudo openssl x509 -in /etc/kubernetes/pki/apiserver.crt -noout -subject -issuer -dates -ext subjectAltName
```

kubeadm certificates last 1 year, and the CA lasts 10 years. `kubeadm upgrade apply` renews them, which is one reason to upgrade regularly.

### Lab 19.2: Create a user with the CSR API
Another classic: give a new user `jane` access to the `taskq` namespace.

```bash
# 1. Private key and CSR. The CN becomes the username and O becomes a group
openssl genrsa -out jane.key 2048
openssl req -new -key jane.key -out jane.csr -subj "/CN=jane/O=taskq-viewers"

# 2. Submit it to Kubernetes
cat <<EOF | kubectl apply -f -
apiVersion: certificates.k8s.io/v1
kind: CertificateSigningRequest
metadata: { name: jane }
spec:
  request: $(base64 < jane.csr | tr -d '\n')
  signerName: kubernetes.io/kube-apiserver-client
  expirationSeconds: 86400
  usages: ["client auth"]
EOF
kubectl get csr                       # Pending
kubectl certificate approve jane
kubectl get csr jane -o jsonpath='{.status.certificate}' | base64 -d > jane.crt

# 3. Build a kubeconfig entry
kubectl config set-credentials jane --client-certificate=jane.crt --client-key=jane.key --embed-certs=true
kubectl config set-context jane --cluster=kubernetes --user=jane --namespace=taskq
kubectl --context jane get pods          # works through the taskq-viewers RoleBinding (note 09)
kubectl --context jane get secrets       # Forbidden
```

Know the kubeconfig structure: **clusters** (server and CA), **users** (credentials), and **contexts** (cluster + user + namespace), plus `current-context`.

## Part 7: High availability (concepts for the exam)
- **Stacked etcd**: etcd runs on each control-plane node (kubeadm's default). **External etcd**: a separate etcd cluster.
- etcd needs a **quorum** of `(n/2)+1`: 3 members tolerate 1 failure and 5 tolerate 2. Always use an odd number.
- Several API servers sit behind a load balancer, which goes in `--control-plane-endpoint`. The scheduler and controller-manager use **leader election**, so only one instance of each is active.
- Add control-plane nodes with `kubeadm join ... --control-plane --certificate-key ...`.

## Checklist
- [ ] Build the kubeadm cluster from scratch in under 30 minutes, using the docs only
- [ ] Back up etcd and restore it, then prove the restore with a namespace that disappears
- [ ] Upgrade both nodes one minor version
- [ ] Fix every row of the Part 5 table from `kubectl` symptoms alone
- [ ] Create a CSR user and grant them a Role
- [ ] Explain static pods, mirror pods and why the API server can be a pod
