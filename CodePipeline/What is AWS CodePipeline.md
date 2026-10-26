# What is AWS CodePipeline?

AWS CodePipeline is a **fully managed continuous delivery (CD) service** that models, visualizes, and automates **release workflows** — source → build → test → approve → deploy.

CodePipeline answers: **"How do we orchestrate multi-step releases across AWS and third-party tools with auditable artifact flow?"**

It **orchestrates**; it does not compile code ( **CodeBuild** ) or perform deployments by itself ( **CodeDeploy**, **CloudFormation**, **ECS** actions do).

## Core concepts
| Concept | Purpose |
| --- | --- |
| **Pipeline** | End-to-end workflow definition |
| **Stage** | Logical group of actions (e.g. Source, Build, Deploy) |
| **Action** | Single step using a **provider** (CodeBuild, CloudFormation, Manual, …) |
| **Transition** | Gate between stages; can be enabled/disabled |
| **Execution** | One run of the pipeline for a specific source revision |
| **Artifact** | Zip passed between stages via S3 **artifact store** |
| **Service role** | IAM role CodePipeline assumes to access S3, CodeBuild, etc. |

## Minimum pipeline structure
```text
┌─────────┐    ┌─────────┐    ┌──────────┐
│ Source  │ → │ Build   │ → │ Deploy   │   (example)
│ (required│    │ or Test │    │ (required│
│  1st)   │    │         │    │  stage)  │
└─────────┘    └─────────┘    └──────────┘
```

Rules:
- **First stage** must be a **Source** action.
- At least **one additional stage** must be **Build**, **Test**, or **Deploy**.
- Stages run **sequentially**; actions within a stage can run in **parallel** or **serial** order.

## Action categories and common providers
| Category | Examples (provider) |
| --- | --- |
| **Source** | CodeCommit, S3, ECR image, CodeStar **Connections** (GitHub, GitLab, Bitbucket) |
| **Build** | **CodeBuild** |
| **Test** | CodeBuild (test project), third-party (Device Farm, etc.) |
| **Deploy** | **CodeDeploy**, **CloudFormation**, **ECS**, **S3**, **Lambda**, **Elastic Beanstalk** |
| **Approval** | **Manual** |
| **Invoke** | **Lambda**, Step Functions (via custom patterns / EventBridge) |

Each action has:
- **Input artifact(s)** — often from previous stage
- **Output artifact(s)** — consumed by later stages
- **Configuration** — project name, template path, role ARN, etc.
- **runOrder** — sequence within the stage (same number = parallel)

## Execution flow
```text
Trigger (event, manual, or source change)
        ↓
New pipeline execution
        ↓
Stage 1 actions complete → transition → Stage 2 → …
        ↓
Succeeded | Failed | Superseded | Stopped
```

| Status | Meaning |
| --- | --- |
| **Succeeded** | All stages completed |
| **Failed** | An action failed (unless retry/recovery configured) |
| **Superseded** | Newer execution replaced a waiting execution (e.g. at disabled transition) |
| **Stopped** | User stopped the pipeline |

**Transition behavior (exam)**: If a stage's **inbound transition is disabled**, executions **wait** at that boundary. When enabled, typically the **most recent** waiting execution continues; older ones may be **superseded**.

## Artifact store
- Artifacts are **encrypted** zip objects in **Amazon S3** (default AWS-managed bucket or **customer-managed bucket**).
- Same pipeline uses one artifact store Region; **cross-Region actions** require planning (replicate bucket, CMK, or Region-specific artifact stores).
- Pipeline and action roles need `s3:GetObject` / `PutObject`; **KMS** permissions if using CMK.

```text
Source action → output artifact "SourceOutput"
        ↓
Build action → input "SourceOutput" → output "BuildOutput"
        ↓
Deploy action → input "BuildOutput"
```

**Exam trap**: Mismatched **artifact names** between stages cause deploy of stale or empty packages.

## Triggers (how executions start)
| Method | Use |
| --- | --- |
| **EventBridge** (recommended) | CodeCommit push, S3 object created, custom events — **event-driven** |
| **CodeStar Connections webhook** | GitHub/GitLab push/PR |
| **CloudWatch Events / EventBridge rule** | `StartPipelineExecution` on pattern |
| **Manual** | Console, CLI `start-pipeline-execution` |
| **Poll for source changes** (`pollForSourceChanges`) | Legacy periodic polling — exam favors **EventBridge** over polling |

**Exam tip**: "Start pipeline immediately when code is pushed" → **EventBridge** or **Connections webhook**, not slow polling.

## Pipeline V2 (awareness)
Modern pipelines support:
- **Triggers** defined in pipeline (Git push filters, release tags)
- **Variables** at pipeline and action level
- **Git change types** (push, PR merge) with path filters

V1 pipelines still appear in older docs; exam scenarios accept **event-driven triggers** as best practice regardless of version wording.

## CodePipeline vs related services
| Requirement | Service |
| --- | --- |
| Orchestrate release stages | **CodePipeline** |
| Run build/test commands | **CodeBuild** |
| Rolling/blue-green to EC2/ECS/Lambda | **CodeDeploy** (often as pipeline action) |
| Provision/update infrastructure | **CloudFormation** action |
| Simple S3 upload deploy | **S3 deploy action** or CodeDeploy |
| Git repository hosting | **CodeCommit** / GitHub — not Pipeline |
| Schedule weekly Lambda | **EventBridge Scheduler** — not Pipeline |

## IAM overview
- **Pipeline service role** — S3 artifacts, start CodeBuild, invoke CloudFormation, pass action configuration.
- **Per-action roles** where required — e.g. **CloudFormation action role** (stack changes), **CodeDeploy role**, cross-account **deployment role**.
- **`iam:PassRole`** — Pipeline must pass roles to CloudFormation/CodeDeploy/Lambda when those services assume them.

See `Stages, actions, and deployment patterns.md` and `Security, cross-account, notifications, and exam scenarios.md`.
