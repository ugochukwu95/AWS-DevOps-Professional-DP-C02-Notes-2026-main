# Elastic Beanstalk CI/CD, operations, and exam scenarios

## CI/CD integration

### CodePipeline
```text
Source → CodeBuild (optional test/package) → Deploy (Elastic Beanstalk)
```

- **Deploy action provider**: Elastic Beanstalk
- Input: application zip/WAR from build artifact or source
- Creates new **application version** in S3 and updates environment

Pipeline service role needs Elastic Beanstalk and S3 permissions on artifact/version buckets.

### CodeBuild + Beanstalk
CodeBuild produces deployable artifact (e.g. `app.zip`, Java WAR) → pipeline or EB CLI `eb deploy` uploads version.

Not required to use CodeBuild — EB CLI can deploy from laptop (discouraged for prod).

### EB CLI / AWS CLI
- `eb init`, `eb create`, `eb deploy`, `eb status` — developer workflow
- `aws elasticbeanstalk create-application-version`, `update-environment` — automation

Exam favors **CodePipeline** for enterprise CI/CD answers.

## IAM and security
| Component | IAM |
| --- | --- |
| **EC2 instance profile** | App access to AWS APIs (S3, DynamoDB, SQS for workers) |
| **Service role** | Beanstalk service manages ASG, ALB, CloudWatch (Elastic Beanstalk service role) |
| **User/CI role** | `elasticbeanstalk:*`, `s3:PutObject` for versions, `PassRole` for instance profile |

Least privilege on instance profile — workers need SQS; web tier may need S3/DynamoDB only.

## VPC
Environments can run in **VPC** (private subnets + ALB in public subnets typical). Configure during create or via saved config.

Similar exam patterns to CodeBuild VPC: subnets, NAT for outbound, security groups.

## Monitoring and logs
| Feature | Use |
| --- | --- |
| **Enhanced health** | Environment dashboard, root cause hints |
| **CloudWatch metrics** | CPU, latency, HTTP 4xx/5xx, environment health |
| **Log streaming** | Instance logs to CloudWatch Logs |
| **X-Ray** | Tracing (especially with **traffic splitting** canary analysis) |
| **SNS notifications** | Email on deploy/health events |

Route **environment health degradation** alarms through **EventBridge** for Step Functions runbooks if question asks multi-step response.

## Scaling
- **Auto Scaling** triggers on CPU, latency, or custom CloudWatch metrics.
- **Scheduled scaling** via `.ebextensions` or console.
- **Worker tier** scales on **SQS queue depth**.

## Rollback
- Deploy previous **application version** from S3 (retained versions).
- Failed deploy **automatic rollback** when policy supports it.
- **Blue/green**: swap CNAME back to blue environment.

**Exam tip**: "Quickly revert bad release" → previous **application version** or blue/green swap — not rebuild from scratch.

## Elastic Beanstalk vs ECS vs EKS
| | **Beanstalk** | **ECS/EKS** |
| --- | --- | --- |
| Ops model | PaaS — platform manages app server | Container orchestration |
| Best fit | Classic web apps, worker queues | Microservices, Kubernetes ecosystem |
| Deploy unit | Version bundle / Docker on EB platform | Task definition / Helm chart |
| Exam bias | Deployment **policies**, tiers | IRSA, service mesh, Fargate |

## Elastic Beanstalk vs CloudFormation
- Beanstalk **generates** CloudFormation for the environment.
- Use **CloudFormation/CDK/Terraform alone** when you need full custom infra without EB opinions.
- **.ebextensions** `Resources` extends EB stack — hybrid approach.

## Common operational tasks
| Task | Approach |
| --- | --- |
| Change instance type | Configuration update or `.ebextensions` |
| Enable HTTPS | ALB listener + ACM cert |
| Set JVM/memory | `option_settings` namespace for Tomcat/Java |
| SSH to instance | EC2 key pair; **Session Manager** alternative |
| Clone prod to staging | Saved config + new environment + same version |

## Troubleshooting (exam-relevant)
| Symptom | Check |
| --- | --- |
| Deploy stuck | Health check failing; `container_commands` error; batch stuck in rolling |
| 502 from ALB | App not listening on configured port; proxy settings |
| Worker not processing | SQS queue policy, daemon config, worker tier link |
| Env update rolls back | Failed command in `.ebextensions`; instance health Red |
| Wrong env vars | Environment properties vs `.ebextensions` precedence |

## High-value exam scenarios
| Scenario | Correct approach |
| --- | --- |
| Deploy Java web app with minimal infra setup | **Elastic Beanstalk** web tier |
| Process SQS messages on EC2 | **Worker tier** |
| Fastest deploy; downtime acceptable | **All at once** |
| Prod zero-downtime single environment | **Immutable** or rolling with additional batch |
| Canary before full release | **Traffic splitting** |
| Parallel v2 environment then DNS cutover | **Blue/green** |
| Config in source repo at deploy time | **.ebextensions** |
| Pipeline deploy on git push | **CodePipeline** → EB deploy action |
| Monolith on Tomcat; not Kubernetes | **Beanstalk**, not EKS |
| Keep database if environment deleted | **External RDS** or retain policy |
| Async jobs from web requests | Web tier → **SQS** → worker tier |

## Exam traps
- **Beanstalk is not serverless** — underlying **EC2** (unless comparing to Lambda).
- **All at once** in production with zero-downtime requirement — wrong answer.
- **CodeDeploy** vs **EB deploy action** — standard EB pipeline uses **Elastic Beanstalk** provider.
- Deleting environment **may delete** coupled RDS — external DB for prod.
- **Worker tier** still uses EC2 — not Lambda (unless you choose Lambda separately).
- **Traffic splitting** ≠ **blue/green** — know the difference.
- Full microservices on Fargate → **ECS/Copilot**, not Beanstalk (unless Docker on EB explicitly).

## Review checklist
- [ ] Web server vs worker tier
- [ ] All deployment policies and when to use each
- [ ] Traffic splitting vs blue/green
- [ ] .ebextensions (commands vs container_commands)
- [ ] Saved configuration
- [ ] CodePipeline EB deploy action
- [ ] Enhanced health and rollback
- [ ] Beanstalk vs ECS/EKS vs CloudFormation
- [ ] SQS worker pattern
- [ ] RDS lifecycle coupling
