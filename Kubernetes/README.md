# Kubernetes learning path: kind to EKS with one project

A 16-week, hands-on path from Linux and container fundamentals to running and breaking a real workload on Amazon EKS.

Everything is built around **one small project, `taskq`** (a Go API, a Go background worker and PostgreSQL). The code lives in [taskq/](taskq). The project stays small on purpose: you should be able to explain and troubleshoot every component in it. A repository with fifteen tools you cannot debug is weak evidence; one system you can break and fix on demand is strong evidence.

## How to use these notes
1. Work through the notes in order. Each one has **Concepts**, **Lab** (commands against your own cluster), and **Check yourself** questions.
2. Do the labs by typing commands, not by copy-pasting blocks. Read every error message.
3. Don't advance a stage until you can meet its "evidence" bar **without the notes open**.
4. Keep a `journal.md` (not committed) of every problem you hit: symptom, cause, fix. That journal becomes your failure-drill material in weeks 14-16.
5. Recreate the local cluster often. `make reset` takes about a minute; being comfortable destroying things is part of the skill.

## Roadmap

| Stage | Focus | Evidence you're ready to advance |
| --- | --- | --- |
| **Weeks 1-2: Foundations** | Linux processes, DNS, routing, TLS, container networking, CPU and memory limits | Explain how a request reaches a container and diagnose why it fails |
| **Weeks 3-6: Kubernetes** | Pods, Deployments, Services, configuration, probes, scheduling, storage, RBAC, resource requests and limits | Deploy and troubleshoot an application locally without following a tutorial |
| **Weeks 7-10: EKS** | Terraform provisioning, VPC CNI, node groups, workload IAM, load balancing, EBS storage, cluster access | Build an EKS environment and explain the purpose of every major component |
| **Weeks 11-13: Operations** | Helm, GitOps, metrics, logs, autoscaling, disruption budgets, upgrades and recovery | Roll out changes, handle a failed deployment, and replace nodes safely |
| **Weeks 14-16: Failure drills** | Broken DNS, unavailable nodes, exhausted IPs, bad permissions, memory failures, storage problems | Find the cause from symptoms, restore service, and document prevention |
| **Weeks 17-18: CKA (optional)** | kubeadm install and upgrade, etcd backup, control-plane repair, certificates, NetworkPolicy, Gateway API, Kustomize, CRDs, exam speed | Both killer.sh sessions comfortably above the pass mark |

## Notes

| # | Note | Stage |
| --- | --- | --- |
| 00 | [Local cluster setup with kind](00%20Local%20cluster%20setup%20with%20kind.md) | Setup |
| 01 | [Project architecture - taskq](01%20Project%20architecture%20-%20taskq.md) | Setup |
| 02 | [Linux processes and container networking](02%20Linux%20processes%20and%20container%20networking.md) | Weeks 1-2 |
| 03 | [DNS, routing and TLS](03%20DNS,%20routing%20and%20TLS.md) | Weeks 1-2 |
| 04 | [CPU and memory limits](04%20CPU%20and%20memory%20limits.md) | Weeks 1-2 |
| 05 | [Pods, Deployments and Services](05%20Pods,%20Deployments%20and%20Services.md) | Weeks 3-6 |
| 06 | [Configuration, Secrets and probes](06%20Configuration,%20Secrets%20and%20probes.md) | Weeks 3-6 |
| 07 | [Scheduling, requests and limits](07%20Scheduling,%20requests%20and%20limits.md) | Weeks 3-6 |
| 08 | [Storage and StatefulSets](08%20Storage%20and%20StatefulSets.md) | Weeks 3-6 |
| 09 | [RBAC and ServiceAccounts](09%20RBAC%20and%20ServiceAccounts.md) | Weeks 3-6 |
| 10 | [Kubernetes troubleshooting playbook](10%20Kubernetes%20troubleshooting%20playbook.md) | Weeks 3-6 |
| 11 | [Terraform VPC and EKS cluster](11%20Terraform%20VPC%20and%20EKS%20cluster.md) | Weeks 7-10 |
| 12 | [VPC CNI and managed node groups](12%20VPC%20CNI%20and%20managed%20node%20groups.md) | Weeks 7-10 |
| 13 | [Cluster access and workload IAM](13%20Cluster%20access%20and%20workload%20IAM.md) | Weeks 7-10 |
| 14 | [Load balancing and EBS storage](14%20Load%20balancing%20and%20EBS%20storage.md) | Weeks 7-10 |
| 15 | [Helm and GitOps with Argo CD](15%20Helm%20and%20GitOps%20with%20Argo%20CD.md) | Weeks 11-13 |
| 16 | [Metrics, logs and autoscaling](16%20Metrics,%20logs%20and%20autoscaling.md) | Weeks 11-13 |
| 17 | [Disruption budgets, upgrades and node replacement](17%20Disruption%20budgets,%20upgrades%20and%20node%20replacement.md) | Weeks 11-13 |
| 18 | [Failure drills](18%20Failure%20drills.md) | Weeks 14-16 |
| 19 | [CKA - kubeadm clusters, etcd and the control plane](19%20CKA%20-%20kubeadm%20clusters,%20etcd%20and%20the%20control%20plane.md) | Weeks 17-18 |
| 20 | [CKA - networking, extensibility and exam technique](20%20CKA%20-%20networking,%20extensibility%20and%20exam%20technique.md) | Weeks 17-18 |

## How the project grows

| Stage | Where taskq runs | What changes |
| --- | --- | --- |
| Weeks 1-2 | Go binaries on your Mac, then plain Docker containers | Postgres in Docker Desktop. You learn processes, ports, DNS, limits |
| Weeks 3-6 | kind cluster (3 nodes) | Plain YAML in [taskq/k8s](taskq/k8s). Postgres starts outside the cluster, then moves into a StatefulSet |
| Weeks 7-10 | EKS (Terraform in [taskq/terraform/eks](taskq/terraform/eks)) | ALB Ingress, EBS volume for Postgres, worker writes results to S3 with Pod Identity |
| Weeks 11-13 | EKS and kind | Helm chart in [taskq/helm/taskq](taskq/helm/taskq), Argo CD, HPA, PDBs, upgrades |
| Weeks 14-16 | Both | Deliberately broken, then fixed and written up |

## Tool budget
Only these tools are introduced, each in the week it is needed:

| Tool | Introduced | Why |
| --- | --- | --- |
| Docker Desktop, Go, `kubectl` | Week 1 | Already installed |
| kind | Week 1 | Local multi-node cluster in Docker |
| PostgreSQL (`postgres` image) | Week 1 | The only stateful dependency |
| Terraform | Week 7 | Provisions VPC, EKS, IAM, S3 |
| AWS CLI | Week 7 | Credentials, `aws eks update-kubeconfig` |
| Helm | Week 9 (controllers), Week 11 (own chart) | AWS Load Balancer Controller, packaging taskq |
| Argo CD | Week 11 | GitOps |
| metrics-server | Week 12 | `kubectl top`, HPA |
| kube-prometheus-stack | Optional, Week 12 | Only if CloudWatch Container Insights isn't enough |
| Multipass, kubeadm, Calico | Week 17 (CKA) | Ubuntu VMs and a self-built cluster, like the exam's |
| Envoy Gateway | Week 18 (CKA) | One Gateway API implementation to practise with |

## Progress checklist

### Weeks 1-2: Foundations
- [ ] I can draw the path of `curl localhost:8080/jobs` to the Go process inside a container, naming every hop
- [ ] I can explain why a container exits immediately and how signals reach PID 1
- [ ] I can resolve a name with `dig`, explain `ndots`, and read `/etc/resolv.conf`
- [ ] I can inspect a TLS certificate chain with `openssl s_client` and explain a handshake failure
- [ ] I can make a container get OOM killed and CPU throttled on purpose, and prove which one happened

### Weeks 3-6: Kubernetes
- [ ] I can deploy taskq to an empty kind cluster from memory
- [ ] I can explain the difference between liveness, readiness and startup probes, and what breaks if each is wrong
- [ ] I can explain QoS classes and predict which pod is evicted first
- [ ] I can move Postgres into the cluster with a PVC and prove data survives a pod restart
- [ ] I can grant a ServiceAccount the minimum RBAC and test it with `kubectl auth can-i`
- [ ] I can debug `Pending`, `CrashLoopBackOff`, `ImagePullBackOff`, and a Service with no endpoints

### Weeks 7-10: EKS
- [ ] I can provision and destroy the EKS environment with Terraform
- [ ] I can explain where a pod's IP comes from on EKS and calculate max pods per node
- [ ] I can explain access entries vs Pod Identity vs IRSA
- [ ] I can expose the API through an ALB and explain every AWS resource the controller created
- [ ] I can explain why an EBS-backed pod can't move to another Availability Zone

### Weeks 11-13: Operations
- [ ] I can release taskq with Helm and roll back a bad release
- [ ] I can change the cluster only through Git (Argo CD) and explain drift
- [ ] I can autoscale the API with HPA and explain why it did or didn't scale
- [ ] I can drain and replace every node with zero failed requests
- [ ] I can upgrade the cluster version in the right order and restore Postgres from backup

### Weeks 14-16: Failure drills
- [ ] I have completed every drill in [18 Failure drills](18%20Failure%20drills.md) with an incident write-up
- [ ] A friend (or a script) broke something I didn't know about, and I found it from symptoms alone

### Weeks 17-18: CKA (optional)
- [ ] I can build a kubeadm cluster from the docs, upgrade it one minor version, and back up and restore etcd
- [ ] I can repair a broken API server, scheduler or kubelet from node logs
- [ ] I can lock down taskq with NetworkPolicy without breaking DNS
- [ ] I can use Gateway API, Kustomize, Helm and CRDs at exam speed
- [ ] I scored comfortably above the pass mark on the second killer.sh session
