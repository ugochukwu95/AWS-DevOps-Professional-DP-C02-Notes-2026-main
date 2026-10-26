# What is Amazon EKS?

Amazon Elastic Kubernetes Service (**EKS**) is a managed Kubernetes control plane. AWS runs and patches the Kubernetes API server, scheduler, controller manager, and **etcd**. You run worker capacity — EC2 nodes, Fargate, or hybrid/on-premises options — in your VPC.

EKS lets DevOps teams use standard Kubernetes tooling (kubectl, Helm, GitOps, CI/CD) while AWS manages control-plane availability, upgrades, and API endpoint security.

## Control plane vs data plane
| Layer | Owner | Contains |
| --- | --- | --- |
| **Control plane** | AWS (managed VPC) | API server, etcd, scheduler, controllers |
| **Data plane** | You (your VPC) | Worker nodes, pods, Services, Ingress/Load Balancers |

When you create a cluster, AWS places **EKS-managed ENIs** in your VPC so the control plane can communicate with nodes. You do not manage the control-plane VPC directly.

```text
AWS-managed control plane VPC
        ↕ (EKS-managed ENIs in your subnets)
Your VPC
├── Worker nodes (EC2 or Fargate)
├── Pods and Services
├── ALB/NLB (via AWS Load Balancer Controller)
└── NAT/VPC endpoints for private workloads
```

## Compute options
| Option | Use | Exam note |
| --- | --- | --- |
| **Managed node groups** | EC2 workers managed by EKS | Common default; supports On-Demand and Spot |
| **Self-managed nodes** | You manage Auto Scaling groups / launch templates | More control; more operational burden |
| **AWS Fargate profiles** | Serverless pods, no node management | Per-pod billing; no DaemonSets on Fargate |
| **EKS Hybrid Nodes** | On-premises / edge nodes joining cloud control plane | Hybrid workloads |
| **EKS Anywhere / Outposts** | Kubernetes outside standard AWS Regions | Separate products; know they exist for hybrid exam distractors |

**Exam tip**: Need **no node management** → **Fargate profiles**. Need **DaemonSets, host networking, or broader node control** → **EC2 node groups**.

## Core cluster components
| Component | Purpose |
| --- | --- |
| **Cluster** | EKS-managed Kubernetes API endpoint and control plane |
| **Node group** | Group of EC2 instances registered as Kubernetes nodes |
| **Fargate profile** | Selector that schedules matching pods on Fargate |
| **Add-on** | Managed installation of cluster software (VPC CNI, CoreDNS, kube-proxy, etc.) |
| **Access entry / aws-auth** | Maps IAM principals to Kubernetes RBAC |
| **OIDC identity provider** | Enables IRSA for pod-level AWS permissions |

## Managed add-ons (commonly tested)
| Add-on | Purpose |
| --- | --- |
| **Amazon VPC CNI** | Assigns VPC IP addresses to pods |
| **CoreDNS** | In-cluster DNS |
| **kube-proxy** | Service network rules on nodes |
| **Amazon EBS CSI driver** | Dynamic EBS volume provisioning for pods |
| **Amazon EFS CSI driver** | Shared persistent storage |
| **AWS Load Balancer Controller** | Creates ALB/NLB/TargetGroupBinding from Ingress/Service |
| **Cluster Autoscaler** | Scales node groups based on pending pods |
| **Metrics Server** | Enables HPA and kubectl top |

Add-ons can be installed and updated through the EKS console, API, Terraform, or CloudFormation.

## Cluster endpoint access
| Mode | Behavior |
| --- | --- |
| **Public endpoint** | API reachable from internet (restrict with CIDR allowlists) |
| **Private endpoint** | API reachable only from within VPC/peered networks |
| **Public + private** | Common production pattern — admins/VPN use private; CI in VPC uses private |

Private clusters require network path from build systems, bastions, or CI runners to the API server.

## High availability
- Control plane runs across **multiple AZs** automatically.
- Worker nodes should span **multiple private subnets/AZs**.
- Spread Deployments/StatefulSets with pod anti-affinity and topology spread constraints.
- Use **PodDisruptionBudgets** during node drains and upgrades.

## EKS vs ECS — exam distinctions
| Requirement | Service |
| --- | --- |
| Standard Kubernetes APIs, Helm, CNCF ecosystem | **EKS** |
| AWS-native container orchestration with simpler ops | **ECS** |
| No node management for Kubernetes pods | **EKS on Fargate** |
| AWS Copilot CLI for containers | **ECS/Fargate** |
| GitOps with Flux/Argo CD on Kubernetes | **EKS** |

## EKS and the wider DevOps toolchain
```text
Developer commits
        ↓
CodePipeline / GitHub Actions / GitLab CI
        ↓
CodeBuild builds container → pushes to ECR
        ↓
Deploy stage updates Kubernetes manifest / Helm chart
        ↓
EKS runs new Deployment; ALB shifts traffic
        ↓
CloudWatch Container Insights + control plane logs monitor rollout
```

Common deployment mechanisms on EKS:
- **kubectl / Helm** from CI/CD
- **GitOps** (Argo CD, Flux)
- **CodeDeploy for EKS** — blue/green with ALB/NLB and optional traffic shifting
- **CloudFormation/Terraform** for cluster and add-on infrastructure

## Cluster lifecycle operations
| Operation | Notes |
| --- | --- |
| **Version upgrade** | Upgrade control plane first, then node groups/add-ons |
| **Node rotation** | Managed node groups support rolling updates with surge capacity |
| **Draining** | Respect PDBs; use managed node group update strategies |
| **Backup** | etcd is managed by AWS; back up application state (RDS, EBS snapshots, Velero for K8s resources) |

## Pricing model (exam awareness)
- Pay for the **EKS cluster hour** per cluster.
- Pay separately for **EC2/Fargate**, **EBS**, **ELB**, **data transfer**, and other attached services.
- Fargate bills per vCPU/memory for pod runtime.

## Related services
| Service | Role with EKS |
| --- | --- |
| **Amazon ECR** | Private container image registry |
| **AWS IAM / IRSA / Pod Identity** | AWS API access from pods |
| **Application Load Balancer** | Ingress traffic via AWS Load Balancer Controller |
| **CloudWatch** | Control plane logs and Container Insights |
| **AWS Secrets Manager / Parameter Store** | Secrets via CSI driver or external-secrets |
| **Karpenter** | Fast, flexible node provisioning (open source) |
| **Cluster Autoscaler** | Scales existing node groups |

**Exam tip**: EKS questions usually test **architecture, deployment patterns, IAM for pods, networking, and observability** — not deep Kubernetes trivia unrelated to AWS.
