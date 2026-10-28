# What is Amazon ECS?

Amazon Elastic Container Service (**ECS**) is AWS’s **native container orchestration** service. You define **what** runs (container image, CPU, memory, env, secrets) in a **task definition**, schedule **tasks** on **EC2** or **AWS Fargate**, and keep desired count stable with **services**.

ECS is the exam answer when the scenario wants **AWS-managed orchestration without Kubernetes**, **Fargate serverless tasks**, **CodeDeploy blue/green for containers**, or **ECS-specific CI/CD** (CodePipeline ECS action, `imagedefinitions.json`).

## Core building blocks
| Component | Purpose |
| --- | --- |
| **Cluster** | Logical grouping of capacity (Fargate and/or EC2 container instances) |
| **Task definition** | Blueprint: container images, ports, roles, volumes, logging, health checks |
| **Task** | Running instance of a task definition (one or more containers) |
| **Service** | Maintains desired task count, rolling deployments, load balancer registration, service discovery |
| **Container instance** | EC2 host registered to cluster (not used for Fargate-only clusters) |
| **Capacity provider** | Links cluster to **Auto Scaling group** or **Fargate** with managed scaling |

```text
Cluster
├── Capacity: Fargate and/or EC2 (via capacity providers)
├── Service "api" (desired count: 3)
│   └── Tasks (each runs task definition revision)
└── Optional: one-off RunTask jobs (batch, migrations, Step Functions)
```

## Launch types (exam-critical)
| Launch type | Who manages servers | Typical use |
| --- | --- | --- |
| **Fargate** | AWS | No EC2 to patch; pay per task vCPU/memory |
| **EC2** | You (ASG, AMI, ECS agent) | GPU, custom host config, cost optimization at scale |
| **External** | Your on-prem/VM (**ECS Anywhere**) | Hybrid — same ECS APIs, external instances |

**Exam tip**: “No server management for containers” → **Fargate** (ECS or EKS Fargate). “Need DaemonSet-style host agents on every node” → **EC2 launch type** or **EKS on EC2**, not Fargate.

Modern deployments often use **capacity providers** instead of setting `launchType` directly:
- **FARGATE** / **FARGATE_SPOT** capacity providers
- **EC2 capacity provider** tied to an ASG with managed scaling

## Task definition essentials
| Field / concept | Notes |
| --- | --- |
| **Family + revision** | Immutable revisions; services point at a revision ARN |
| **CPU / memory** | Fargate has **valid combinations**; EC2 uses host resources |
| **Container definitions** | Image URI (usually **ECR**), port mappings, command, env |
| **Task execution role** | Pull images, write logs, fetch secrets at **start** (`ecr:*`, `logs:*`, `secretsmanager:GetSecretValue`) |
| **Task role** | **Application** AWS API access at **runtime** (S3, DynamoDB, SQS) |
| **Network mode** | **awsvpc** required for Fargate; bridge/host mainly EC2 |
| **Volumes** | Bind mounts, **EFS**, **FSx**, Docker volumes |
| **Logging** | `awslogs`, **FireLens** (Fluent Bit/Fluentd sidecar) |

**Exam trap**: **Task execution role** ≠ **task role**. Pull from ECR and read Secrets Manager for container startup → **execution role**. App calls AWS APIs → **task role**.

## Services and deployments
| Setting | Meaning |
| --- | --- |
| **Desired count** | Target number of running tasks |
| **Minimum healthy % / maximum %** | Rolling deploy: how many tasks can be stopped/started at once |
| **Deployment circuit breaker** | Auto **rollback** failed deployments (with rollback CloudWatch events) |
| **Health check grace period** | Time before ELB health checks count against new tasks |
| **Placement** (EC2) | Strategies: **binpack**, **spread**, **random**; constraints on instance attributes |

Simple in-place rollout: update service → new tasks with new task definition → drain old tasks (controlled by min/max %).

Advanced **blue/green with traffic shifting**: **CodeDeploy for ECS** (not the basic CodePipeline ECS action alone).

## Scheduling models
| Model | API / feature |
| --- | --- |
| **Long-running** | **ECS service** behind ALB/NLB or internal only |
| **One-off / batch** | **RunTask** (CLI, EventBridge, Step Functions `.sync`) |
| **Scheduled** | **EventBridge schedule** → RunTask or update service |
| **Cron-style maintenance** | EventBridge + RunTask with SSM/DB migration container |

## ECS vs EKS vs Elastic Beanstalk (exam selection)
| Requirement | Service |
| --- | --- |
| Kubernetes, Helm, CNCF tooling | **EKS** |
| AWS-native APIs, simpler ops, tight CodeDeploy ECS integration | **ECS** |
| PaaS for web apps (Tomcat, Node, Docker single container) with minimal IaC | **Elastic Beanstalk** (Docker platform) |
| **AWS Copilot** CLI for containerized apps | **ECS on Fargate** |
| GitOps with Argo CD / Flux | **EKS** |

## Related AWS services
| Service | Role with ECS |
| --- | --- |
| **Amazon ECR** | Private image registry — ECS **pulls**, does not store images |
| **Application / Network Load Balancer** | Public or internal traffic to tasks (awsvpc) |
| **AWS Cloud Map** | **Service discovery** (DNS + health) for east-west calls |
| **Amazon ECS Service Connect** | Managed service mesh–lite: discovery + metrics + optional proxy |
| **CodePipeline / CodeBuild / CodeDeploy** | Build → push ECR → deploy service |
| **CloudFormation / Terraform** | Cluster, services, task defs as IaC |
| **CloudWatch** | Metrics, logs, **Container Insights**, alarms for rollback |
| **Secrets Manager / Parameter Store** | Injected via task definition secrets (execution role) |
| **IAM** | Task roles, execution roles, pipeline deploy roles |
| **Step Functions / EventBridge** | Orchestrate RunTask, automation |

## End-to-end DevOps flow (reference)
```text
Developer commit
        ↓
CodePipeline (Source → CodeBuild)
        ↓
CodeBuild: docker build → push Amazon ECR (tag = commit SHA)
        ↓
Deploy: ECS deploy action OR CodeDeploy for ECS (blue/green)
        ↓
ECS service runs new task definition revision
        ↓
ALB target group registers healthy tasks; old tasks drain
        ↓
CloudWatch Container Insights + awslogs / FireLens
```

## ECS Anywhere (awareness)
Register **external instances** (on-premises, other clouds) to an ECS cluster with the **SSM-managed ECS agent**.

Use when exam mentions **same ECS control plane** for cloud and edge/on-prem without moving to Kubernetes.

## Pricing awareness (exam level)
- **Fargate**: per vCPU and memory **per task** runtime.
- **EC2 launch type**: pay for EC2/EBS/ELB; you optimize with Spot capacity providers, right-sizing ASG.
- No separate “ECS cluster hour” fee (unlike EKS control plane charge).

## Quick mental model
- **ECR** = image warehouse.
- **Task definition** = recipe.
- **Task** = running container group.
- **Service** = “always keep N of these running and roll out updates.”
- **CodeDeploy for ECS** = blue/green + **traffic shifting** + **hooks** + **alarm rollback**.

**Exam tip**: ECS questions on DOP-C02 emphasize **CI/CD choice**, **IAM roles**, **networking (awsvpc + ALB)**, **scaling**, **observability**, and **CodeDeploy vs CodePipeline ECS** — not low-level Docker trivia.
