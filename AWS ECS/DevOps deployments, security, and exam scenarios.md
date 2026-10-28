# ECS DevOps deployments, security, and exam scenarios

## IAM roles (highest-yield ECS topic)
| Role | Used by | Typical permissions |
| --- | --- | --- |
| **Task execution role** | ECS agent / Fargate at **start** | `ecr:GetAuthorizationToken`, ECR pull, `logs:*`, `secretsmanager:GetSecretValue`, `ssm:GetParameters` |
| **Task role** | Application code at **runtime** | Least-privilege S3, DynamoDB, SQS, SNS, etc. |
| **CodeDeploy service role** | CodeDeploy | ELB, ECS, CloudWatch alarms for deployment |
| **Pipeline / CodeBuild role** | CI/CD | ECR push, `ecs:RegisterTaskDefinition`, `ecs:UpdateService`, `iam:PassRole` |

**Exam tip**: `CannotPullContainerError` or secrets not injected → fix **task execution role** and network to ECR/Secrets Manager — not the task role.

**PassRole**: Any automation that registers a task definition must be allowed **`iam:PassRole`** on the execution and task roles referenced in the definition.

## Secrets and configuration
| Source | Integration |
| --- | --- |
| **Secrets Manager** | `secrets` in container definition — JSON key or full secret |
| **SSM Parameter Store** | `secrets` with parameter ARN (SecureString needs KMS decrypt on execution role) |
| **Environment files** | S3 env file reference on container definition |
| **Plain env** | Non-sensitive config only |

Do not bake secrets into images or commit them to Git; pipeline updates **image tag**, not secrets, in steady state.

## Container image workflow (ECR)
```text
CodeBuild (or GitHub Actions)
        ↓
docker build → tag (commit SHA / semver)
        ↓
Push to Amazon ECR
        ↓
Pipeline passes image URI to ECS deploy or CodeDeploy
        ↓
New task definition revision (image field updated)
        ↓
ECS service deploys tasks; execution role pulls from ECR
```

Cross-account ECR: **repository policy** on the image account + IAM on the pulling account; prefer **same Region** as the cluster.

Related notes: **ECR Security, policies, CI-CD**, **CodeBuild buildspec**.

## CI/CD — CodePipeline ECS deploy action vs CodeDeploy

### CodePipeline **ECS** provider (simple)
- Updates **task definition** and **service** from pipeline artifact.
- Common artifact: **`imagedefinitions.json`** mapping container name → image URI.

```text
Source → CodeBuild (build, push ECR, emit imagedefinitions.json) → ECS deploy action
```

Good for: **rolling** in-place service update, minimal traffic management requirements.

### **CodeDeploy for ECS** (advanced)
- **Blue/green** with **two task sets**, **listener traffic shifting**, **lifecycle hooks**.
- AppSpec references **TargetService** (`AWS::ECS::Service`), task definition, load balancer info.
- Deployment configurations: **Canary**, **Linear**, **AllAtOnce**.
- **Automatic rollback** on **CloudWatch alarm** or failed **BeforeAllowTraffic** hook.

```text
Source → CodeBuild (appspec.yaml + taskdef.json + image)
        ↓
CodeDeploy deployment action
        ↓
Green task set + shift ALB/NLB listener
        ↓
BeforeAllowTraffic Lambda validates → traffic → AfterAllowTraffic
```

| Wording in question | Prefer |
| --- | --- |
| “Update ECS service with new image” only | **ECS deploy action** |
| “Gradual traffic shift”, “10% every N minutes”, “rollback on alarm”, “BeforeAllowTraffic” | **CodeDeploy for ECS** |
| “Blue/green” with hooks | **CodeDeploy for ECS** |

**Exam trap**: **CodePipeline ECS provider** does not replace **CodeDeploy** for linear/canary **traffic shifting** and **deployment hooks**.

## Rolling deployment settings (ECS native)
When not using CodeDeploy, service **deployment configuration** controls rolling:

| Parameter | Effect |
| --- | --- |
| **minimumHealthyPercent** | 100% = no drop below full desired during deploy (with max 200%) |
| **maximumPercent** | 200% = allow double tasks temporarily during rollout |
| **deployment circuit breaker** | Stop and **rollback** if tasks fail to stabilize |

Pair circuit breaker with **CloudWatch alarms** on unhealthy host count or 5xx for operational rollback runbooks.

## CloudFormation / IaC
Define **`AWS::ECS::Cluster`**, **`AWS::ECS::TaskDefinition`**, **`AWS::ECS::Service`**, **`AWS::ECS::CapacityProvider`**, target groups, and roles in stacks.

**CodeDeploy blue/green** often needs **`DeploymentController: CODE_DEPLOY`** on the service — exam may show CloudFormation setting this before pipeline uses CodeDeploy.

Stack updates that change task definition force new deployments; use **change sets** and pipeline approvals for production.

## CodeDeploy AppSpec (ECS reminder)
```yaml
version: 0.0
Resources:
  - TargetService:
      Type: AWS::ECS::Service
      Properties:
        TaskDefinition: arn:aws:ecs:region:account:task-definition/app:12
        LoadBalancerInfo:
          ContainerName: web
          ContainerPort: 8080
Hooks:
  - BeforeAllowTraffic: arn:aws:lambda:region:account:function:validate-green
```

Hooks run **Lambda** or **SNS** for validation and notifications.

## EventBridge and Step Functions
| Trigger | Pattern |
| --- | --- |
| **EventBridge schedule** | RunTask nightly batch container |
| **EventBridge rule** (ECR push, Config, GuardDuty) | RunTask remediation or start pipeline |
| **Step Functions** `arn:aws:states:::ecs:runTask.sync` | Wait until task completes in workflow |

Step Functions needs IAM to `ecs:RunTask`, **`iam:PassRole`** for task roles, and correct **subnet/SG** in the integration.

## Observability and operations
| Need | Tool |
| --- | --- |
| CPU/memory at cluster/service/task | **CloudWatch Container Insights** |
| Application logs | **`awslogs`** or **FireLens** → CloudWatch / OpenSearch |
| Trace requests | **X-Ray** sidecar or SDK in app |
| Execute command in running task | **ECS Exec** (SSM channel; enable on cluster + task) |
| Deployment events | CodeDeploy deployment history, ECS service events, EventBridge |

**Exam trap**: **ECS Exec** requires task and execution roles with SSM messaging permissions and **enableExecuteCommand** on service — not SSH to Fargate.

## Security patterns
- Tasks in **private subnets**; only ALB in public subnets.
- **Least-privilege task role** per service; avoid wide node/instance role for app AWS access (on EC2, still prefer task role over instance profile for app).
- **Encrypt** ECR images (KMS); execution role needs **kms:Decrypt** on repository key.
- Scan images with **ECR basic scanning** or **Inspector**; block deploy in pipeline with approval Lambda on CRITICAL findings.
- Use **AWS WAF** on ALB for internet-facing APIs.
- **IMDSv2** on EC2 container instances; restrict who can deploy task definitions (pipeline role only).

## Multi-account and cross-Region
```text
Tools account pipeline
        ↓ assumes DeployRole
Workload account ECS cluster + ECR pull (replica or cross-account policy)
        ↓
CodeDeploy or CloudFormation in workload account
```

Artifact buckets and **KMS keys** need cross-account policies when artifacts are encrypted.

**ECR replication** to workload Region reduces deploy latency and cross-Region pull failures.

## ECS vs other compute (exam selection table)
| Scenario | Service |
| --- | --- |
| AWS-native containers, CodeDeploy blue/green | **ECS** |
| Kubernetes required | **EKS** |
| Single Docker app, minimal ops | **Elastic Beanstalk** Docker |
| Function-level, event-driven | **Lambda** (container or zip) |
| Store images only | **ECR** (not ECS) |
| CLI-first Fargate microservices | **ECS + Copilot** |

## High-value exam scenarios
| Scenario | Correct approach |
| --- | --- |
| Build image in pipeline, deploy to Fargate service | **CodeBuild** → **ECR** → **CodePipeline ECS** or **CodeDeploy** |
| Linear traffic shift to new task set | **CodeDeploy for ECS** + **Linear** deployment config |
| Auto rollback failed deployment without CodeDeploy | ECS **deployment circuit breaker** |
| Task needs S3 read at runtime | **Task role** with S3 policy |
| Pull private ECR image on Fargate | **Task execution role** + network to ECR |
| Scheduled database migration container | **EventBridge** → **RunTask** |
| Multi-step workflow runs ECS task then notifies | **Step Functions** `.sync` RunTask |
| Scale on ALB load | **Application Auto Scaling** target tracking **RequestCountPerTarget** |
| EC2 cluster runs out of capacity | **Capacity provider** managed scaling on ASG |
| Centralize logs on Fargate without DaemonSet | **FireLens** sidecar |
| Interactive debug in task | **ECS Exec** |

## Exam traps
- **ECR stores images; ECS runs them** — registry vs orchestrator.
- **Execution role** for pull/logs/secrets; **task role** for app AWS APIs.
- **Fargate** requires **awsvpc**; no SSH — use **ECS Exec**.
- **CodePipeline ECS action** ≠ **CodeDeploy traffic shifting**.
- **CodeDeploy agent** required for **EC2/on-prem**, **not** for ECS/Lambda (agentless).
- **Service auto scaling** changes task count; **capacity providers** change EC2 fleet size.
- **Cluster Autoscaler** is EKS; ECS uses **capacity providers**.
- **Copilot** targets **ECS/Fargate**, not EKS.

## Quick review checklist
- [ ] Task execution role vs task role
- [ ] CodePipeline ECS vs CodeDeploy for ECS (traffic shift wording)
- [ ] imagedefinitions.json vs appspec + taskdef artifact
- [ ] Rolling min/max % and deployment circuit breaker
- [ ] ECR push (build) vs pull (execution role)
- [ ] `iam:PassRole` on pipeline/CodeDeploy/Step Functions
- [ ] Private subnet + VPC endpoints/NAT for ECR and logs
- [ ] Container Insights vs log drivers / FireLens
- [ ] Service auto scaling metrics vs capacity provider scaling

## Related notes in this repo
- **CodeDeploy** — AppSpec, lifecycle hooks, ECS blue/green
- **CodePipeline** — ECS deploy action, cross-account deploy
- **ECR** — scanning, replication, KMS, task execution role pull
- **CodeBuild** — Docker build and push in buildspec
- **Amazon CloudWatch** — Container Insights, alarms for rollback
- **AWS EKS** — when Kubernetes is the stated requirement
