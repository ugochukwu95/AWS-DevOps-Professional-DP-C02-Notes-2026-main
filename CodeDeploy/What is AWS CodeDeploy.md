# What is AWS CodeDeploy?

AWS CodeDeploy is a **deployment service** that automates application releases to **Amazon EC2**, **on-premises servers**, **AWS Lambda**, and **Amazon ECS** (including **Fargate**). It supports **rolling (in-place)** and **blue/green** strategies with **lifecycle hooks** and **automatic rollback**.

CodeDeploy answers: **"How do we release new application versions to compute safely with minimal downtime?"**

It does **not** build code — **CodeBuild** produces artifacts; **CodePipeline** orchestrates; **CodeDeploy** performs the **deploy action**.

## Core concepts
| Concept | Purpose |
| --- | --- |
| **Application** | Logical grouping of deployment groups (e.g. `MyWebApp`) |
| **Deployment group** | Set of targets (EC2 instances, ASG, ECS service, Lambda) |
| **Deployment configuration** | Speed/safety rules (one-at-a-time, half-at-a-time, canary, linear) |
| **Revision** | Deployable content — S3 bundle (EC2) or task definition / Lambda version |
| **Deployment** | One execution of a revision to a deployment group |
| **AppSpec file** | `appspec.yml` — lifecycle hooks and file mappings (platform-specific) |

```text
CodeBuild artifact (appspec + bundle) in S3
        ↓
CodePipeline CodeDeploy action
        ↓
CodeDeploy deployment group
        ↓
EC2 / ECS / Lambda updated with rollback options
```

## Compute platforms (exam-critical)
| Platform | Agent | Revision source |
| --- | --- | --- |
| **EC2 / on-premises** | **CodeDeploy agent** required | S3 zip/tar with **AppSpec** |
| **Lambda** | Agentless | S3 zip or container image; alias traffic shifting |
| **ECS** | Agentless | New **task definition** + image; blue/green via load balancer |

**Exam tip**: "Deploy to Auto Scaling group behind ALB" → **CodeDeploy EC2** or **ECS** depending on compute; not Beanstalk unless specified.

## Deployment styles (overview)
| Style | Behavior |
| --- | --- |
| **In-place (rolling)** | Update **existing** instances in batches |
| **Blue/green** | Run **new version** alongside old; **shift traffic**; terminate or keep old fleet |

Detailed comparison in `Deployment configurations, AppSpec, and lifecycle hooks.md`.

## CodeDeploy vs related services
| Requirement | Service |
| --- | --- |
| Rolling/blue-green to EC2/ECS/Lambda | **CodeDeploy** |
| Orchestrate pipeline stages | **CodePipeline** |
| PaaS deploy with EB policies | **Elastic Beanstalk** (native policies, not CodeDeploy action) |
| Update ECS service only (simple) | CodePipeline **ECS deploy action** |
| ECS blue/green + traffic hooks + alarm rollback | **CodeDeploy for ECS** |
| Infrastructure stacks | **CloudFormation** |
| Kubernetes manifests / Helm | **EKS** + kubectl/GitOps or **CodeDeploy for EKS** |

**Exam trap**: **CodePipeline ECS provider** = simple task definition update; **CodeDeploy** when question mentions **traffic shifting**, **lifecycle hooks**, or **CloudWatch alarm rollback**.

## Revision storage
| Platform | Typical revision |
| --- | --- |
| **EC2** | S3 object — application files + `appspec.yml` at root |
| **Lambda** | S3 bucket + key or ECR image + function version |
| **ECS** | Task definition JSON (often created in pipeline); container image in ECR |

Pipeline **input artifact** must include AppSpec for EC2; ECS/Lambda use action configuration + task definition parameters.

## Deployment states (awareness)
`Created` → `Queued` → `InProgress` → `Succeeded` | `Failed` | `Stopped`

Monitor in console, CLI, **CloudWatch Events/EventBridge**, and **SNS** notifications.

## IAM roles
| Role | Purpose |
| --- | --- |
| **CodeDeploy service role** | Allows CodeDeploy to read S3 revisions, update ASG, ECS, Lambda, ELB |
| **EC2 instance profile** | Agent downloads bundles from S3, reports lifecycle events |
| **CodePipeline role** | Invokes CodeDeploy `CreateDeployment` |

Service role needs `s3:GetObject` on artifact bucket, ELB/ECS/Lambda permissions per deployment type.

## Agent (EC2 / on-premises)
- **CodeDeploy agent** installed on each instance (via SSM, user data, AMI).
- Agent executes scripts defined in AppSpec hooks.
- Unhealthy agent → deployment fails for that instance.

**SSM** can install and manage the agent at scale.

## Integration summary
```text
Source → CodeBuild → artifact (appspec + app)
        ↓
CodeDeploy action (application name, deployment group, deployment config)
        ↓
Optional: CloudWatch alarm → automatic rollback
```

See `Deployment configurations, AppSpec, and lifecycle hooks.md` and `CI-CD, rollback, and exam scenarios.md`.
