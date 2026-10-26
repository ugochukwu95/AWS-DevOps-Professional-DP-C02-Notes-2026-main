# CodePipeline security, notifications, and exam scenarios

## IAM roles
| Role | Purpose |
| --- | --- |
| **Pipeline service role** | Read/write artifacts, start CodeBuild, invoke actions, use Connections |
| **CloudFormation action / execution roles** | Stack create/update permissions in target account |
| **CodeDeploy service role** | Register revisions, trigger deployments |
| **CodeBuild service role** | Build — separate from pipeline role |
| **Cross-account deployment role** | Assumed by pipeline or CloudFormation in workload account |

**PassRole**: Pipeline configuration must only pass roles the pipeline role is allowed to pass (`iam:PassRole` + `iam:PassedToService` conditions).

Least privilege:
- Pipeline role cannot need `*` on production if stages use **separate action roles** per environment.
- **Production deploy role** assumable only from pipeline in tools account.

## Artifact security
- Store artifacts in **customer-managed S3** with **block public access**.
- **SSE-KMS** with CMK — grant pipeline role, CodeBuild role, CodeDeploy/CFN roles `kms:Decrypt`/`Encrypt`.
- **Bucket policy** for cross-account artifact read during deploy.
- Lifecycle policies to expire old artifacts (cost + data minimization).

Never store secrets in artifact zips unencrypted — use **Parameter Store** / **Secrets Manager** in CodeBuild.

## Encryption in transit
Connections to Git providers use TLS. Internal AWS calls use TLS. S3 artifact encryption at rest as configured.

## Notifications
| Method | Capability |
| --- | --- |
| **CodePipeline notification rule** | Managed integration → **SNS only** (approvals, failures, successes) |
| **EventBridge rule** on `aws.codepipeline` | Route to Lambda, Step Functions, SNS, Chatbot — **flexible** |
| **AWS Chatbot** | Slack/Teams from SNS |

Example EventBridge pattern use:
- **Pipeline execution failed** → SNS → on-call
- **Manual approval started** → SNS to approvers
- **Production deploy succeeded** → EventBridge → audit log Lambda

**Exam tip**: "Notify Slack on failure and run rollback Lambda" → **EventBridge** on pipeline state → SNS + Lambda (notification rules alone only go to SNS).

## Event-driven pipeline starts
```text
CodeCommit repository state change
        ↓
EventBridge rule (or native pipeline trigger)
        ↓
StartPipelineExecution
```

Other sources:
- **S3** object created (artifact or source zip)
- **ECR** image push (image pipeline)
- **Image Builder** pipeline state change (via EventBridge)

**Anti-pattern for exam**: Relying on **pollForSourceChanges** when event-driven option exists.

## Credential exposure workflow (classic)
```text
CodeCommit push (sensitive pattern detected)
        ↓
EventBridge rule
        ↓
Step Functions → Lambda disables IAM key → SNS security team
```

CodePipeline may **not** be in the path — EventBridge orchestrates security response. Pipeline continues separately for normal releases.

## Cross-account architecture
```text
Account A — Shared Services
├── CodePipeline + artifact bucket (KMS)
├── CodeBuild projects
└── Pipeline role → sts:AssumeRole → Account B DeployRole

Account B — Production
├── CloudFormation stacks / ECS services
└── DeployRole trust Account A pipeline role
```

Checklist:
- [ ] Trust policy on DeployRole
- [ ] Pipeline role `sts:AssumeRole` on DeployRole ARN
- [ ] DeployRole permissions for target services
- [ ] S3/KMS cross-account for artifacts if deploy reads from A's bucket
- [ ] CloudFormation **stack policy** / SCP guardrails in B

## Audit and compliance
- **CloudTrail** logs `StartPipelineExecution`, `PutPipeline`, approval decisions.
- **CodePipeline execution history** shows action timing and commit IDs.
- Immutable **Git tags** and **ECR image digests** for traceability.
- **Manual approval** records who approved in CloudTrail/console history.

Config rules can detect pipelines without approval before prod (detective control).

## Resilience and rollback
| Strategy | Mechanism |
| --- | --- |
| **CloudFormation rollback** | Stack automatic rollback on failure |
| **CodeDeploy rollback** | Deployment failure auto-rollback configuration |
| **Re-run previous execution** | Redeploy known-good artifact from earlier execution |
| **Blue/green** | Shift traffic back on failed health checks |
| **Pipeline retry** | Retry failed stage (manual or automated where supported) |

Pipeline failure does **not** automatically roll back deployed stages unless deploy service configured to — exam distinguishes **stop pipeline** vs **revert live traffic**.

## CodePipeline vs Jenkins / GitHub Actions alone
| AWS-native exam bias | |
| --- | --- |
| Multi-service AWS deploy with approvals | **CodePipeline** |
| Fully managed, IAM-integrated artifact flow | **CodePipeline** + CodeBuild |
| Only run shell on single VM | Jenkins on EC2 (wrong if AWS managed CI/CD asked) |

GitHub Actions can deploy to AWS via OIDC — exam may compare **OIDC role** vs **CodePipeline in AWS account** for hybrid orgs.

## High-value exam scenarios
| Scenario | Correct approach |
| --- | --- |
| Orchestrate build then deploy to EC2 | **CodePipeline** → CodeBuild → **CodeDeploy** |
| Require approval before prod CloudFormation | **Manual approval** stage |
| Start pipeline on every CodeCommit push to main | **EventBridge** / pipeline trigger — not polling |
| Deploy infrastructure from packaged template | CodeBuild `package` → **CloudFormation** action |
| Parallel security scan and unit tests | Same stage, parallel **runOrder** |
| Deploy containers to ECS with new image | CodeBuild push ECR → **ECS** or **CodeDeploy** action |
| Tools account deploys to prod account | Cross-account **IAM role** on deploy action |
| Alert on pipeline failure | **Notification rule** → SNS or **EventBridge** |
| Encrypted artifacts between stages | Customer S3 + **KMS** + IAM on roles |
| Static site to S3 | **S3 deploy** action after build |
| Multi-Region same stack | Cross-Region deploy actions or **StackSets** |

## Exam traps
- CodePipeline **does not build** — **CodeBuild** action required.
- **First stage must be Source**; need at least one **Build/Test/Deploy** stage.
- **Artifact names** must align between actions.
- **Manual approval** is not CloudFormation change set — both can coexist.
- **Notification rules** → SNS only; Lambda needs **EventBridge**.
- **Superseded** executions when newer commit arrives at disabled transition.
- **CloudFormation capabilities** required for IAM resources in template.
- **PassRole** missing → deploy action fails even if template is valid.
- **CodeDeploy** vs **ECS action** — blue/green wording often → CodeDeploy for ECS.

## CodePipeline + CodeBuild + CodeDeploy quick map
| Service | Role in pipeline |
| --- | --- |
| **CodePipeline** | Workflow, artifacts, approvals, triggers |
| **CodeBuild** | Compile, test, package, docker build |
| **CodeDeploy** | Rolling/blue-green to compute targets |

## Review checklist
- [ ] Stage, action, artifact, execution, transition
- [ ] runOrder parallel vs serial
- [ ] EventBridge triggers vs polling
- [ ] Manual approval + SNS
- [ ] CloudFormation action roles and capabilities
- [ ] Cross-account deploy trust + AssumeRole + artifacts/KMS
- [ ] Notification rule vs EventBridge flexibility
- [ ] Cross-Region deploy considerations
- [ ] ECS vs CodeDeploy for blue/green wording
