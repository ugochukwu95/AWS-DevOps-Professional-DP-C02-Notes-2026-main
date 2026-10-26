# CodeBuild security, VPC, integrations, and exam scenarios

## Service role (IAM)
CodeBuild assumes the **project service role** for every build. Attach least-privilege policies.

Typical permissions:
| Need | Actions (examples) |
| --- | --- |
| CloudWatch Logs | `logs:CreateLogGroup`, `CreateLogStream`, `PutLogEvents` |
| S3 artifacts/cache | `s3:GetObject`, `PutObject` on artifact/cache buckets |
| ECR | `ecr:GetAuthorizationToken`, `BatchGetImage`, `PutImage`, … |
| Secrets Manager | `secretsmanager:GetSecretValue` on specific ARNs |
| Parameter Store | `ssm:GetParameters`, `GetParameter` |
| CodeCommit / CodeConnections | Read repository content |
| KMS | `kms:Decrypt`, `kms:GenerateDataKey` for encrypted S3/secrets |
| VPC builds | `ec2:CreateNetworkInterface`, `DeleteNetworkInterface`, … |
| CodeArtifact | `codeartifact:GetAuthorizationToken`, `ReadFromRepository`, plus `sts:GetServiceBearerToken` |
| Cross-account deploy prep | `sts:AssumeRole` on target deploy role (if buildspec assumes role) |

**Exam tip**: Build fails with `AccessDenied` on S3 or Secrets Manager → fix **service role**, not the developer IAM user.

## VPC configuration
By default, CodeBuild runs in an AWS-managed network with internet access for package downloads.

Enable **VPC** on the project when builds must reach:
- Private **RDS**, **ElastiCache**, internal **ALB**
- Resources in private subnets without public endpoints
- Internal **CodeArtifact** via VPC endpoints

```text
CodeBuild project (VPC mode)
        ↓
ENIs in customer subnets
        ↓
Security groups allow required ports
        ↓
NAT gateway or VPC endpoints for AWS APIs (S3, ECR, Logs, STS)
```

Requirements:
- Subnets with enough **IP addresses** for build ENIs
- **Security group** rules for target resources
- Route to **NAT** or **interface/gateway endpoints** (S3, ECR, CloudWatch Logs, STS, Secrets Manager)

**Exam trap**: VPC-enabled build cannot reach internet or AWS APIs → missing **NAT** or **VPC endpoints**.

## Secrets and credentials
| Pattern | Use |
| --- | --- |
| **Secrets Manager** in buildspec `env.secrets-manager` | DB passwords, API keys |
| **Parameter Store** SecureString | Config and secrets |
| **CodeBuild service role** | AWS API access — no static keys |
| **GitHub token in Secrets Manager** | Source credentials for GitHub (legacy OAuth patterns) |
| **CodeConnections** | Preferred GitHub/GitLab enterprise connectivity for pipelines |

Mask secrets in logs — CodeBuild redacts some secret values when sourced from Secrets Manager/Parameter Store in env.

## Encryption
- **Artifacts** and **cache** buckets: SSE-KMS with CMK — grant CodeBuild role and pipeline role decrypt/encrypt.
- **S3 bucket policies** must allow the service role.
- **CloudWatch Logs** encryption with KMS optional.

Cross-account artifact buckets need bucket policy + IAM on both sides.

## Monitoring and notifications
| Tool | Use |
| --- | --- |
| **CloudWatch Logs** | Full build output; search failures |
| **CloudWatch Metrics** | `FailedBuilds`, `Duration`, `Builds` in `AWS/CodeBuild` |
| **CloudWatch Alarms** | Alert on failed builds or duration SLA breach |
| **EventBridge** | React to CodeBuild build state change events |
| **CodeStar Notifications / Chatbot** | Slack/Teams on failure |
| **CodePipeline** | Stage failure stops pipeline; visible in pipeline execution |

EventBridge example use: build **FAILED** → SNS → ticket, or trigger rollback workflow.

## Integrations (DevOps exam)

### CodePipeline
- Build action consumes source artifact, produces build artifact.
- Can run **multiple CodeBuild actions in parallel** in one stage (e.g. lint + unit test + security scan).
- **Input/output artifact names** must match between stages.

### Amazon ECR
- Build and push images in post_build; deploy stage updates ECS task definition or EKS manifest with new image URI.

### AWS CodeArtifact
```bash
aws codeartifact login --tool npm --domain my-domain --repository my-repo
npm ci && npm run build
```
Service role needs CodeArtifact + `sts:GetServiceBearerToken`.

### CloudFormation / SAM / CDK
- Package in CodeBuild (`aws cloudformation package`, `sam build`, `cdk synth`) → artifact to deploy stage.
- **Separate** CloudFormation **execution role** for stack changes — narrower than build role.

### Cross-account deployment
```text
Account A CodeBuild service role
        ↓ sts:AssumeRole
Account B DeployRole
        ↓
CloudFormation deploy / ECS update
```
Caller role needs `sts:AssumeRole`; target role needs trust + deploy permissions.

### SSM Parameter Store output
Post_build can write approved AMI ID or image tag to Parameter Store for downstream ASG refresh (often combined with Image Builder or ECR flows).

## Webhooks
GitHub / Bitbucket webhooks trigger CodeBuild on push, PR, or tag events.

Filter with **webhook filters** (HEAD_REF, BASE_REF, ACTOR_ACCOUNT_ID, etc.).

For CodePipeline, **triggers** on the pipeline often replace direct CodeBuild webhooks in enterprise setups.

## Reserved capacity fleets
- Dedicated **build fleet** with consistent performance.
- Useful for large orgs, monorepos, or strict build-time SLAs.
- Configure instance type, VPC, compute type at fleet level.

## Lambda compute (awareness)
Run eligible builds on **Lambda** instead of container hosts — short, smaller workloads. Know as exam distractor vs standard EC2-based CodeBuild for **Docker/heavy builds** (standard CodeBuild + privileged mode is usual answer).

## Troubleshooting
| Symptom | Likely cause |
| --- | --- |
| `Unable to locate credentials` in build | Command expects keys; use service role and AWS CLI in CodeBuild (credentials automatic) |
| `ResourceInitializationError` VPC | Subnets/SG, no IPs, no route to ECR/S3 |
| `Cannot connect to Docker daemon` | Privileged mode off |
| Secret shows in log | Used echo on plaintext var; use secrets-manager env type |
| Yarn/npm timeout | No NAT/endpoints in VPC; or proxy needed |
| Pipeline artifact empty | buildspec `artifacts` paths wrong or `base-directory` mismatch |
| `AccessDenied` KMS | Key policy or role missing decrypt on CMK |
| GitHub source failed | Expired token; use CodeConnections |

## High-value exam scenarios
| Scenario | Correct approach |
| --- | --- |
| Run unit tests on every commit in AWS | **CodeBuild** + webhook or **CodePipeline** |
| Build Docker image and push to ECR | CodeBuild **privileged mode** + ECR login in buildspec |
| Build must query private RDS for integration tests | CodeBuild in **VPC** + SG + NAT/endpoints |
| Store API key for build | **Secrets Manager** or Parameter Store in buildspec `env` |
| Speed up repeated npm builds | **Cache** `node_modules` / `.npm` |
| Parallel test shards | **Batch build** |
| Publish JUnit results in console | **reports** in buildspec |
| Pull private npm from AWS | **CodeArtifact login** in pre_build |
| No long-lived keys in repo | **Service role** + secrets integration |
| Build in Account A, deploy stack in Account B | CodeBuild **AssumeRole** + pipeline deploy stage (or post_build with scoped role) |
| Artifact encryption compliance | S3 **SSE-KMS** + IAM/KMS on service role |
| Alert team when build fails | **EventBridge** on CodeBuild state → SNS/Chatbot |

## Exam traps
- CodeBuild **does not** automatically deploy to production — pipeline stages and IAM boundaries matter.
- **Developer IAM user** permissions do not apply inside the build — only the **service role** does.
- **Privileged mode** increases risk — enable only when building Docker images.
- **VPC CodeBuild** without endpoints/NAT breaks package pull and AWS API calls.
- **buildspec in repo** is trusted — protect branch permissions (CodeCommit approval rules, GitHub branch protection).
- **CodeDeploy** deploys; **CodeBuild** builds — don't confuse in multi-choice.
- **Local Jenkins** vs **CodeBuild** — exam favors managed AWS CI unless question requires on-prem control.

## CodeBuild vs CodePipeline vs CodeDeploy
| Service | Role |
| --- | --- |
| **CodePipeline** | Orchestration, approvals, artifact flow |
| **CodeBuild** | Compile, test, package, image build |
| **CodeDeploy** | Rolling/blue-green deployment to compute |

## Review checklist
- [ ] buildspec phases and failure behavior
- [ ] Service role vs secrets vs Parameter Store
- [ ] CODEPIPELINE artifacts and env vars
- [ ] Privileged mode + ECR push pattern
- [ ] VPC + NAT/endpoints
- [ ] Cache and batch builds
- [ ] Test reports (JUnit)
- [ ] CodeArtifact login
- [ ] CloudWatch Logs/metrics and EventBridge on failure
- [ ] KMS on artifacts/cache
