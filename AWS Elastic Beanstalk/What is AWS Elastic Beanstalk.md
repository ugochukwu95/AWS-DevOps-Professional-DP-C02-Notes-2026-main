# What is AWS Elastic Beanstalk?

AWS Elastic Beanstalk is a **Platform as a Service (PaaS)** for deploying and scaling **web applications and services**. You upload **application code** (or a Docker image); Elastic Beanstalk provisions and operates the underlying AWS resources — typically **EC2**, **Auto Scaling**, **Application Load Balancer**, and optionally **RDS**.

Elastic Beanstalk answers: **"How do we deploy a Java/Node/Python/.NET app without hand-building ASG + ALB + launch templates every time?"**

You **retain full control** of the AWS resources (SSH, EC2 console, CloudFormation stack) — Beanstalk is **not** a black box like a pure SaaS runtime.

## What Beanstalk manages
| Area | Beanstalk responsibility |
| --- | --- |
| **Capacity** | Auto Scaling group size, instance types (configurable) |
| **Load balancing** | ALB (load-balanced environments) |
| **Health** | Enhanced health, rolling deploy health checks |
| **Platform** | OS + runtime (Java, Node, Python, Docker, etc.) |
| **Deployment** | Rolling, immutable, traffic splitting, blue/green |
| **Monitoring** | CloudWatch metrics, log streaming (optional) |

You still configure **VPC**, **IAM instance profile**, **environment variables**, and **.ebextensions**.

## Core concepts
| Concept | Purpose |
| --- | --- |
| **Application** | Logical container for environments (e.g. `my-app`) |
| **Environment** | Running version of the app (e.g. `my-app-prod`) |
| **Application version** | Labeled source bundle in S3 (zip/WAR/Docker context) |
| **Platform** | Managed stack (e.g. **Python 3.11 running on 64bit Amazon Linux 2023**) |
| **Environment tier** | **Web server** or **Worker** |

## Environment tiers
| Tier | Purpose |
| --- | --- |
| **Web server** | HTTP requests via ALB (or single instance) |
| **Worker** | Background jobs from **Amazon SQS** queue (daemon on instances) |

**Exam tip**: Async processing from a queue with EC2 workers → **Worker tier** + SQS, not a web tier with cron alone.

## Architecture patterns
### Load-balanced (typical production)
```text
Internet → ALB → EC2 instances (Auto Scaling group) → app
                      ↓
                 optional RDS (separate or linked)
```

### Single-instance (dev/test)
```text
Single EC2 — no ALB — brief downtime on deploy acceptable
```

## Platform types (exam awareness)
- **Supported platforms**: Node.js, Java (Tomcat/Corretto), Python, PHP, Ruby, Go, .NET on Windows/Linux
- **Docker**: Single/multi-container Docker platforms
- **Custom platform**: Organization-specific AMIs/platforms

Upload **source bundle** or deploy from **Docker** depending on platform.

## Under the hood
Beanstalk creates and updates **AWS CloudFormation stacks** for the environment. Advanced users can **export** templates or inject resources via **.ebextensions**.

**Exam tip**: Beanstalk is **higher level than raw CloudFormation** for app deploy, but **uses** CloudFormation — not a replacement for org-wide IaC governance (use CFN/CDK/Terraform for full infra control).

## Elastic Beanstalk vs related services
| Requirement | Service |
| --- | --- |
| Simple PaaS deploy for monolith web app | **Elastic Beanstalk** |
| Full control of Kubernetes | **EKS** |
| Container orchestration AWS-native | **ECS/Fargate** |
| Only static website | **S3 + CloudFront** |
| Serverless functions | **Lambda** |
| Manual EC2 + Ansible | Not Beanstalk |
| CI/CD orchestration | **CodePipeline** (can **deploy to** Beanstalk) |

**Exam trap**: **Copilot/ECS** for microservices containers; **Beanstalk** for traditional **platform-managed** app servers or Docker on EC2 with minimal ops.

## Application version lifecycle
```text
Developer / CI uploads version to S3 (via EB CLI, console, CodePipeline)
        ↓
Beanstalk environment update (deploy policy applied)
        ↓
Instances run new version; health verified
        ↓
Rollback to previous application version if deploy fails
```

## Configuration sources
| Mechanism | Use |
| --- | --- |
| **Console / CLI / API** | Environment options, capacity, load balancer |
| **Saved configuration** | Snapshot of settings applied to other environments |
| **`.ebextensions`** | Files in source bundle — packages, env options, resources |
| **Environment properties** | Key/value env vars (can reference Secrets Manager/SSM in advanced setups) |

See `Deployment policies, configuration, and extensions.md` and `CI-CD, operations, and exam scenarios.md`.

## Health and rollback
- **Enhanced health** aggregates instance, load balancer, and application signals (colors: Green/Yellow/Red/Grey).
- Configure **health check URL** for application-level checks.
- Failed deploy triggers **automatic rollback** (when enabled) depending on deployment policy.

## When Beanstalk appears on DevOps CO2
Expect questions on:
- **Deployment policy** selection (zero downtime vs speed)
- **Web vs worker** tier
- **CodePipeline** deploy action
- **.ebextensions** for config
- Beanstalk vs **ECS/EKS/CloudFormation**
