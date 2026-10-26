# EKS DevOps deployments, security, and exam scenarios

## IAM access to the cluster

### Human and CI/CD access to Kubernetes API
Two layers:
1. **AWS IAM authentication** — caller must be allowed to `eks:DescribeCluster` and obtain credentials for the cluster
2. **Kubernetes RBAC authorization** — maps the IAM identity to K8s permissions

Modern approach: **EKS access entries** map IAM principals to Kubernetes groups/roles.

Legacy approach: **`aws-auth` ConfigMap** maps IAM roles/users to `system:masters` or other K8s groups.

**Exam tip**: Pipeline role needs both **IAM permission to access the cluster** and **RBAC permission inside Kubernetes** to apply manifests.

### IRSA — IAM Roles for Service Accounts
Allows a **pod** to assume an IAM role using OIDC federation.

Setup:
1. Enable **OIDC provider** on the EKS cluster.
2. Create IAM role with trust policy for the OIDC provider and scoped `sub`/`aud` conditions.
3. Annotate Kubernetes ServiceAccount with `eks.amazonaws.com/role-arn`.
4. Pod receives temporary AWS credentials via projected token.

Use IRSA when:
- App pods need S3, DynamoDB, SQS, Secrets Manager, etc.
- AWS Load Balancer Controller needs ELB permissions
- External-dns, cluster autoscaler, or CSI drivers need AWS API access

**Exam tip**: "Pod needs least-privilege S3 access without node-wide credentials" → **IRSA**, not the node instance role.

### EKS Pod Identity
Newer AWS-managed alternative to IRSA:
- Associates IAM roles with Kubernetes ServiceAccounts through the **EKS Pod Identity Agent** add-on
- Simplifies role association without manual OIDC trust policy tuning for each role

For the exam: both solve **pod-level AWS permissions**. IRSA is still common in existing architectures; Pod Identity is the simplified AWS-native direction.

### Node instance role vs pod role
| Role | Scope |
| --- | --- |
| **Node (EC2 instance profile)** | Permissions shared by all pods on that node unless blocked |
| **IRSA / Pod Identity role** | Scoped to pods using a specific ServiceAccount |

Prefer **pod roles** over broad node roles for least privilege.

## Container image workflow with ECR
```text
CodeBuild / GitHub Actions
        ↓
docker build → tag with commit SHA
        ↓
Push to Amazon ECR
        ↓
EKS kubelet pulls image (node role or Fargate task role needs ecr:GetAuthorizationToken + pull actions)
        ↓
Deployment updated with new image tag/digest
```

Best practices:
- Pin images by **digest** or immutable tag in production
- Enable **ECR image scanning** on push
- Use **private ECR** with repository policies for cross-account pulls
- Replicate images to deployment Regions/accounts when needed

## CI/CD deployment patterns

### Pattern 1 — kubectl / Helm from pipeline
```text
CodePipeline
├── Source (CodeCommit / GitHub / CodeConnections)
├── Build (CodeBuild → unit tests → push ECR)
└── Deploy (CodeBuild with kubectl/helm assumes deploy role)
```

Deploy role needs:
- EKS cluster access (IAM + RBAC)
- ECR pull if applying from pipeline host outside cluster
- KMS decrypt if manifests/secrets are encrypted

### Pattern 2 — GitOps
```text
Git repo holds desired manifests/Helm values
        ↓
Argo CD / Flux in cluster watches repo
        ↓
Cluster self-syncs to declared state
```

Benefits: auditable desired state, drift detection, rollback via Git.

Pipeline builds/pushes image; GitOps repo update triggers rollout.

### Pattern 3 — CodeDeploy for EKS
Supports **blue/green** deployments for Kubernetes:
- Uses **Deployment** or **Ingress/Service** with ALB/NLB
- Shifts traffic between old and new target groups
- Supports pre/post-traffic **Lambda hooks** for validation
- Integrates with CodePipeline as a deploy action

Use when exam scenario mentions **controlled traffic shifting**, **automatic rollback on CloudWatch alarm**, or **CodeDeploy lifecycle hooks** with EKS.

```text
New task definition / image registered
        ↓
CodeDeploy creates green target group
        ↓
BeforeAllowTraffic hook validates metrics/tests
        ↓
Traffic shifts blue → green
        ↓
Rollback on alarm failure
```

## Observability and logging

### Control plane logs
Enable to CloudWatch Logs:
- API server
- Audit
- Authenticator
- Controller manager
- Scheduler

Use **audit logs** to trace Kubernetes API changes for security investigations.

### Worker and application logs
EKS does **not** automatically ship pod logs to CloudWatch.

Options:
- **CloudWatch Container Insights** — metrics and diagnostics for clusters/nodes/pods
- **Fluent Bit / Fluentd DaemonSet** → CloudWatch Logs
- **FireLens** pattern on Fargate
- **ADOT / OpenTelemetry** for traces and metrics

**Exam trap**: "Enable EKS control plane logging" ≠ "all pod stdout logs appear in CloudWatch automatically."

### Monitoring integrations
| Signal | Tool |
| --- | --- |
| Cluster/pod CPU, memory, network | CloudWatch Container Insights |
| ALB target health during rollout | CloudWatch alarms + CodeDeploy rollback |
| Kubernetes events | `kubectl get events`, CloudWatch if forwarded |
| AWS API calls from pods | CloudTrail (via assumed role session) |

## Secrets management
| Approach | Notes |
| --- | --- |
| **Kubernetes Secrets** | Base64 encoded at rest in etcd (AWS encrypts etcd) — restrict RBAC |
| **Secrets Store CSI driver + Secrets Manager/Parameter Store** | Mount secrets as volumes; no secret in manifest |
| **External Secrets Operator** | Syncs external secret stores into K8s Secrets |
| **Sealed Secrets / SOPS** | Encrypted secrets in Git for GitOps |

**Exam tip**: Do not store plaintext secrets in Git or container images. Pull at deploy/runtime with IAM-scoped access.

## Security and compliance patterns
- Run pods as **non-root**; use **read-only root filesystem** where possible
- Apply **Pod Security Standards** (baseline/restricted) or policy engines (OPA Gatekeeper, Kyverno)
- Use **NetworkPolicy** to limit east-west traffic
- Enable **private API endpoint** and restrict public endpoint CIDRs
- Scan images in **ECR**; block vulnerable images in admission policy where required
- Use **IRSA/Pod Identity** instead of embedding credentials
- Apply **PodDisruptionBudgets** and **Resource requests/limits** for stability

## Upgrades and rollouts
Recommended order:
1. Upgrade **control plane** version
2. Upgrade **add-ons** (VPC CNI, kube-proxy, CoreDNS, CSI drivers)
3. Upgrade **node groups** (rolling update)
4. Validate workloads with integration tests

For application rollout:
- **RollingUpdate** — default Deployment strategy
- **Blue/green or canary** — CodeDeploy, Argo Rollouts, or service mesh traffic splitting
- Use **readiness probes** so traffic only hits healthy pods

## Troubleshooting (exam-relevant)
| Symptom | Likely cause |
| --- | --- |
| Pods stuck Pending | Insufficient CPU/memory, no nodes, taints/tolerations, PVC unbound, subnet IP exhaustion |
| `ImagePullBackOff` | Wrong tag, ECR permissions, cross-account repo policy, private registry networking |
| Nodes NotReady | SG rules, bootstrap failure, insufficient node IAM, CNI failure |
| Ingress not creating ALB | Missing AWS LBC, wrong IAM/IRSA, subnet tags, invalid annotations |
| Pod cannot access S3/DynamoDB | Missing IRSA annotation, wrong trust policy, or using node role without permissions |
| kubectl access denied | IAM lacks cluster access or RBAC denies the mapped identity |
| API timeout from CI | Private cluster without VPC path to endpoint |

## High-value exam scenarios
| Scenario | Correct approach |
| --- | --- |
| Run Kubernetes without managing control plane | **Amazon EKS** |
| No EC2 node management for pods | **EKS Fargate profiles** |
| Pod needs AWS service access with least privilege | **IRSA** or **EKS Pod Identity** |
| Scale node group when pods pending | **Cluster Autoscaler** |
| Fast flexible provisioning across instance types/Spot | **Karpenter** |
| HTTP routing to microservices | **Ingress + AWS Load Balancer Controller** |
| Blue/green EKS deploy with traffic shift and rollback | **CodeDeploy for EKS** |
| Store container images privately | **Amazon ECR** |
| Centralize pod logs in CloudWatch | **Fluent Bit DaemonSet** or **Container Insights** |
| Audit Kubernetes API changes | **Enable EKS control plane audit logs** |
| Git as source of truth for manifests | **GitOps (Argo CD / Flux)** |
| Shared file storage across pods | **EFS CSI driver** |
| Database pod with single-writer storage | **EBS CSI + StatefulSet** |
| Hybrid/on-prem Kubernetes with AWS-managed control plane | **EKS Hybrid Nodes / EKS Anywhere** (know as distractors) |

## Exam traps
- **EKS control plane is managed; worker nodes are your responsibility** (unless Fargate).
- **Fargate does not support DaemonSets** — logging agents may need FireLens sidecars.
- **Node IAM role permissions apply to all pods** unless you use IRSA/Pod Identity and deny node metadata abuse.
- **Cluster Autoscaler scales existing groups**; it is not the same as Karpenter.
- **Ingress alone does not create an ALB** — you need the **AWS Load Balancer Controller** (or equivalent).
- **Private cluster** requires network connectivity for CI/CD and admin access.
- **CodeDeploy for EKS** is the AWS-native answer for blue/green with traffic shifting — not plain kubectl rolling update alone.
- **ECS Copilot** is for ECS, not EKS.

## Quick review checklist
- [ ] Control plane vs data plane and ENI connectivity
- [ ] Managed node groups vs Fargate profiles
- [ ] VPC CNI IP planning
- [ ] IRSA / Pod Identity setup purpose
- [ ] AWS Load Balancer Controller for ALB/NLB
- [ ] Cluster Autoscaler vs Karpenter
- [ ] ECR → EKS image pull permissions
- [ ] CodePipeline + CodeBuild + kubectl/Helm/GitOps/CodeDeploy patterns
- [ ] Control plane logs vs pod logs
- [ ] Private endpoint and VPC endpoints
