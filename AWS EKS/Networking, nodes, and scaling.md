# EKS networking, nodes, and scaling

## Two-VPC architecture
When you create an EKS cluster:
1. **AWS-managed control plane VPC** — contains the API server and etcd. You cannot access this VPC directly.
2. **Your VPC** — contains worker nodes, pods, load balancers, and supporting infrastructure.

Communication flow:
- Worker nodes register with the Kubernetes API server.
- The control plane monitors node health and schedules pods.
- AWS creates **EKS-managed ENIs** in your subnets to connect the control plane to your data plane.

## Subnet and IP planning
| Requirement | Guidance |
| --- | --- |
| **Worker nodes** | Place in **private subnets** across multiple AZs for production |
| **Load balancers** | ALB/NLB may use public or internal subnets depending on Ingress/Service annotations |
| **Pod IPs** | Default **VPC CNI** assigns real VPC IPs to pods — plan CIDR capacity carefully |
| **Secondary CIDRs** | Add VPC CIDR blocks or use custom networking when IP exhaustion is a risk |

**Exam trap**: Running out of IP addresses in subnets is a common EKS production failure — not a Kubernetes scheduling issue alone.

## Amazon VPC CNI
The **amazon-vpc-cni-k8s** add-on:
- Assigns **private IP addresses from the VPC subnet** to pods
- Enables pod-to-pod and pod-to-AWS-service communication using normal VPC routing
- Supports security group assignment to pods (where configured)

Implications:
- Each pod consumes an IP in the subnet CIDR (by default).
- Large clusters need sufficient subnet sizing or custom networking.
- Security groups can enforce east-west traffic controls at the ENI level.

## Core networking add-ons
| Add-on | Role |
| --- | --- |
| **CoreDNS** | DNS for Services and pods (`service.namespace.svc.cluster.local`) |
| **kube-proxy** | Implements Kubernetes Service networking on nodes |
| **AWS Load Balancer Controller** | Provisions ALB/NLB from Ingress and Service resources |
| **Calico / Cilium / other CNI overlays** | Network policies and advanced segmentation beyond default CNI |

**Calico** (and similar) adds **NetworkPolicy** support to control which pods/namespaces may communicate — useful for zero-trust segmentation between applications.

## AWS Load Balancer Controller
Replaces the older **ALB Ingress Controller**.

Creates:
- **ALB** for HTTP/HTTPS Ingress
- **NLB** for Layer-4 Services (including `LoadBalancer` type and some Ingress classes)
- **TargetGroupBinding** for advanced target management

Typical flow:
```text
Ingress resource (with annotations)
        ↓
AWS Load Balancer Controller
        ↓
Application Load Balancer + target groups
        ↓
Pod IPs registered as targets
```

Requires:
- IAM permissions (IRSA role is the standard pattern)
- Correct subnet tags for ALB/NLB discovery
- Security groups allowing traffic from ALB to pod/node targets

## Private clusters and API access
For **private-only API endpoints**:
- kubectl, CI/CD, and GitOps controllers must run inside the VPC, over VPN, Direct Connect, or through a bastion/SSM path.
- Ensure **VPC interface endpoints** or NAT for AWS APIs used by nodes and add-ons.

Common endpoints for private EKS:
- `com.amazonaws.region.eks`
- `com.amazonaws.region.ecr.api` / `ecr.dkr`
- `com.amazonaws.region.sts`
- `com.amazonaws.region.logs`
- S3 gateway endpoint for pull-through/cache/layers where applicable

## Security groups
| Layer | Typical pattern |
| --- | --- |
| **Node security group** | Allow control plane → node and node ↔ node communication per EKS guidance |
| **Cluster security group** | Managed communication between control plane and nodes |
| **Pod security groups** | Optional fine-grained rules with VPC CNI pod SG feature |
| **ALB security group** | Allow client CIDRs on 443; allow ALB → targets |

Follow current EKS documentation for required control-plane-to-node port rules — exam scenarios often test **overly restrictive SGs blocking API or kubelet traffic**.

## Node types in depth

### Managed node groups
- EKS creates and manages an Auto Scaling group.
- Supports **On-Demand**, **Spot**, and **mixed** capacity.
- Handles rolling updates and managed draining during upgrades.
- Best default for most DevOps exam answers involving EC2 workers.

### Self-managed nodes
- You create the ASG/launch template and register nodes.
- More flexibility, more operational responsibility.
- Still need correct IAM, bootstrap, and `aws-auth`/access entry configuration.

### Fargate profiles
- Select pods by **namespace** and **label selectors**.
- No SSH, no DaemonSets, no privileged host access patterns that require nodes.
- Each pod gets an isolated microVM billing envelope.

## Scaling workers

### Cluster Autoscaler
```text
Pending pods cannot schedule (insufficient CPU/memory)
        ↓
Cluster Autoscaler detects unschedulable pods
        ↓
Scales ASG / managed node group up
        ↓
New nodes join cluster; pods schedule
        ↓
When nodes underutilized → scale down (respecting PDBs)
```

Requirements:
- IAM permissions to describe Auto Scaling groups and set desired capacity
- Correct tags on node groups (for auto-discovery)
- Works within **predefined node groups** — does not invent new instance types arbitrarily

### Karpenter
Open-source node provisioner (AWS origin) that:
- Watches for unschedulable pods
- Provisions **right-sized nodes quickly** across instance types/families
- Supports Spot, consolidation, and disruption budgets

```text
Cluster Autoscaler          Karpenter
────────────────────          ─────────
Scales existing ASGs          Provisions new nodes dynamically
Simpler, well-known           Faster, more flexible bin-packing
Exam: "scale node group"      Exam: "optimize cost/latency with varied instance types"
```

**Exam tip**: "Automatically add capacity across Spot and On-Demand with flexible instance selection" → **Karpenter**. "Scale an existing managed node group based on pending pods" → **Cluster Autoscaler**.

## Spot instances on EKS
- Use **managed node groups with Spot** or Karpenter with Spot capacity.
- Combine with **PodDisruptionBudgets**, multiple replicas, and fault-tolerant workloads.
- Spot interruptions send **2-minute notice** — applications must handle graceful termination.

## Persistent storage
| Storage | Access mode | Use |
| --- | --- | --- |
| **EBS via CSI driver** | ReadWriteOnce | Single-pod databases, caches |
| **EFS via CSI driver** | ReadWriteMany | Shared files across pods |
| **FSx** | Varies | Specialized high-performance or Windows needs |

StatefulSets commonly use EBS volumes with AZ affinity — the volume and pod must stay in the same AZ.

## Multi-AZ resilience pattern
```text
Cluster spans 3 AZs
├── Private subnets in each AZ
├── Managed node group with min nodes per AZ
├── Deployments with replicas ≥ 2 and topology spread
├── PDB ensures at least one pod during node drain
└── ALB health checks across AZ target groups
```

## Networking exam distinctions
| Requirement | Solution |
| --- | --- |
| Assign VPC IPs to pods | Amazon VPC CNI |
| Restrict pod-to-pod traffic | NetworkPolicy (Calico/Cilium/etc.) |
| Expose HTTP service externally | Ingress + AWS Load Balancer Controller → ALB |
| Expose TCP service externally | Service type LoadBalancer → NLB |
| Private API server access only | Private cluster endpoint + VPC connectivity |
| Pods reach AWS APIs without internet | VPC interface endpoints |
| Out of subnet IPs for pods | Expand CIDR / custom networking / alternate CNI strategy |
