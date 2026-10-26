# CodePipeline stages, actions, and deployment patterns

## Serial vs parallel actions
Within one **stage**, actions with the same **`runOrder`** run in **parallel**. Lower `runOrder` completes before higher.

```text
Build stage
├── runOrder 1: CodeBuild UnitTests
├── runOrder 1: CodeBuild Lint          ← parallel with UnitTests
└── runOrder 2: CodeBuild Package       ← after both finish
```

**Exam tip**: "Run security scan and unit tests concurrently" → same stage, **same runOrder**, two CodeBuild actions.

## Source actions
| Source | Notes |
| --- | --- |
| **CodeCommit** | Native; trigger via EventBridge on repository state change |
| **CodeStar Connections** | GitHub, GitLab, Bitbucket — OAuth/app; preferred over deprecated OAuth-only GitHub |
| **S3** | Object key as source (zip); EventBridge on `Object Created` |
| **ECR** | Image tag as source for container pipelines |

Output artifact typically named e.g. `SourceOutput` (configurable).

## Build and test actions
Almost always **CodeBuild**:
- **Build** stage: compile, docker build, package CloudFormation/SAM/CDK
- **Test** stage: integration tests, load tests (separate project for IAM isolation)

Pass **EnvironmentVariables** in action configuration to override buildspec (image tag, environment name).

## Manual approval
**Manual approval** action pauses the pipeline until an authorized user approves or rejects.

- Configure **SNS topic** to notify approvers.
- Often placed **before production deploy**.
- Rejection fails the stage (and execution unless overridden).

```text
Deploy-Staging → Succeeded
        ↓
Approval-Prod (Manual) → waiting
        ↓
Approver clicks Approve in console / CLI
        ↓
Deploy-Production runs
```

**Exam tip**: "Require human gate before prod" → **Manual approval** action + SNS, not a Lambda sleep.

## CloudFormation deploy action
Deploys infrastructure from template artifact.

| Mode | Use |
| --- | --- |
| **Create/update stack** | Direct stack deployment |
| **Replace on failure** | Rollback behavior options in stack policy |
| **Change sets** | Preview changes before execute (exam: safer prod) |

Requirements:
- Template in input artifact (packaged by CodeBuild with `aws cloudformation package` if nested/lambda assets)
- **Action role** — permissions to create/update stack resources
- **Stack configuration** — parameter overrides, capabilities (`CAPABILITY_IAM`, `CAPABILITY_NAMED_IAM`, `CAPABILITY_AUTO_EXPAND`)

Separate **CloudFormation service role** (execution role) vs **pipeline action role** — exam distinguishes **who starts deploy** vs **what CFN assumes in account**.

## CodeDeploy actions
| Compute | Pipeline use |
| --- | --- |
| **EC2 / on-premises** | Deploy revision from artifact bucket |
| **ECS** | Blue/green or linear with task definition update |
| **Lambda** | Traffic shifting with aliases |

CodeDeploy action consumes **AppSpec** and revision from build artifact.

Classic pattern:
```text
CodeBuild → output artifact with appspec + revision
        ↓
CodeDeploy action → deployment group → rolling or blue/green
```

## ECS deploy action
Native **ECS** provider updates service/task definition from **imagedefinitions.json** or task definition artifact.

Container pipeline:
```text
Source → CodeBuild (build + push ECR) → ECS deploy (new task def)
```

For **blue/green with traffic shifting**, exam may prefer **CodeDeploy for ECS** over basic ECS provider — read scenario for "traffic shift", "rollback on alarm".

## Lambda deploy action
Updates function code/alias from artifact (zip or container image URI in template).

Heavy logic often uses **CloudFormation** or **SAM** instead of raw Lambda action.

## S3 deploy action
Syncs artifact files to S3 bucket (static website, config blobs). Not for complex app rollout — use CodeDeploy/CloudFormation for compute.

## Cross-Region actions
A pipeline in **us-east-1** can include actions in **eu-west-1** (e.g. deploy to multiple Regions).

Requirements:
- **Artifact store** and **KMS keys** support cross-Region access or use **Region-specific artifact buckets**
- Action configuration specifies **Region** for that action
- IAM roles trust and permissions in **target Region/account**

**Exam tip**: "Deploy same template to us-east-1 and eu-west-1 in parallel" → one pipeline, **parallel deploy actions** in deploy stage with different Region — or **CloudFormation StackSets** as alternative answer.

## Cross-account deployment
```text
Tools account (Account A)
Pipeline → CloudFormation / CodeDeploy action
        ↓ assumes
DeploymentRole in Account B (trust + permissions)
        ↓
Resources created in Account B
```

Needs:
- **Trust policy** on Account B role
- **Pipeline/action permission** to `sts:AssumeRole`
- **Artifact bucket policy** if CodeDeploy/CFN reads artifacts cross-account
- **KMS** key policies for encrypted artifacts

## Multi-environment patterns
| Pattern | Description |
| --- | --- |
| **Single pipeline, sequential stages** | Dev → Test → Approve → Prod stages |
| **Separate pipelines per environment** | Isolated blast radius; different IAM |
| **Same pipeline, parameter overrides** | Pipeline variables for env-specific params |
| **Git branches** | Triggers filter `main` → prod, `develop` → dev |

Prefer **narrower IAM in prod stages** and **manual approval** between non-prod and prod.

## Custom actions and Lambda invoke
**Invoke** category can run **Lambda** for custom steps (compliance checks, smoke tests, notifications).

**Custom action** (with job worker) — legacy pattern for third-party tools; exam favors **Lambda** or **CodeBuild** over custom job workers unless question specifies Jenkins integration.

## Integrations with EventBridge
- **Start pipeline** on CodeCommit push, ECR image push, Image Builder `AVAILABLE`, Config event, etc.
- **React to pipeline** state changes for notifications and rollback (see security/exam file).

Replace **`pollForSourceChanges: true`** when question stresses **real-time** and **lower API overhead**.

## Common pipeline templates (exam narratives)

### 1 — Web app (ALB + EC2)
```text
Source (CodeCommit) → CodeBuild → CodeDeploy (rolling) → Manual approval optional
```

### 2 — Microservices (ECS Fargate)
```text
Source → CodeBuild (docker push ECR) → ECS or CodeDeploy blue/green
```

### 3 — Infrastructure as code
```text
Source → CodeBuild (cfn package) → CloudFormation change set → Manual approval → Execute change set
```

### 4 — Serverless
```text
Source → CodeBuild (SAM/CFN) → CloudFormation deploy stack (Lambda, API Gateway)
```

### 5 — Static site
```text
Source → CodeBuild → S3 deploy → CloudFront invalidation (Lambda invoke)
```

## Troubleshooting (structure)
| Symptom | Check |
| --- | --- |
| Deploy wrong code version | Artifact names; branch trigger; execution ID |
| CloudFormation action access denied | Action role, PassRole, execution role, capabilities |
| CodeBuild not started | Pipeline role `codebuild:StartBuild`; project name |
| Approval never received | SNS subscription confirmed; approver IAM |
| Cross-account fail | Trust, artifact KMS, bucket policy |
| Stuck waiting | Disabled **transition**; approval pending |

## Stage/action exam scenarios
| Scenario | Answer |
| --- | --- |
| Parallel lint and unit test | Same stage, same **runOrder**, two CodeBuild actions |
| Gate production deploy | **Manual approval** + SNS |
| Deploy SAM app | CodeBuild package → **CloudFormation** deploy |
| ECS blue/green with rollback | **CodeDeploy** for ECS |
| Trigger on Git push without polling | **EventBridge** or Connections **trigger** |
| Multi-Region CloudFormation | Cross-Region actions or **StackSets** |
| Deploy to workload account from tools account | Cross-account **role** on deploy action |
