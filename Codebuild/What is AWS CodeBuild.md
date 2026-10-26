# What is AWS CodeBuild?

AWS CodeBuild is a **fully managed continuous integration (CI) service** that compiles source code, runs unit tests, produces artifacts, and builds Docker images. You pay for build minutes — no servers to provision or patch.

CodeBuild answers: **"How do we run repeatable build and test commands in AWS without maintaining Jenkins workers?"**

## Core concepts
| Concept | Purpose |
| --- | --- |
| **Project** | Configuration for source, environment, IAM role, artifacts, cache, and logs |
| **Build** | One execution of a project (triggered by pipeline, webhook, API, or schedule) |
| **buildspec** | YAML file defining build phases, commands, artifacts, cache, and reports |
| **Environment** | OS image, compute type, privileged mode, environment variables |
| **Service role** | IAM role CodeBuild assumes to read source, write logs/artifacts, pull secrets |
| **Artifacts** | Output files (binaries, templates, images metadata) stored in S3 or passed to CodePipeline |

## How CodeBuild fits in CI/CD
```text
Source (CodeCommit, GitHub, CodePipeline, S3)
        ↓
CodeBuild project
        ├── buildspec: install → test → build → post_build
        ├── optional: Docker build (privileged mode)
        └── artifacts → S3 or CodePipeline
        ↓
CodeDeploy / CloudFormation / ECS / EKS / Lambda deploy stage
```

CodeBuild is commonly the **Build** and **Test** action in **CodePipeline**, but it can also run standalone with webhooks or `StartBuild`.

## Triggers
| Trigger | Use |
| --- | --- |
| **CodePipeline** | Standard multi-stage CD pipeline |
| **Webhook** (GitHub / GitHub Enterprise / Bitbucket) | Push/PR events start builds |
| **API / CLI** (`start-build`) | Custom automation, AFT, scripts |
| **EventBridge** | Scheduled or event-driven builds |
| **Manual** | Console or CLI on demand |

## Source types (exam-relevant)
| Source | Notes |
| --- | --- |
| **CodePipeline** | Input/output artifacts from pipeline; buildspec can live in repo or project |
| **CodeCommit** | Native AWS Git; IAM and optional credential helper |
| **GitHub / GitHub Enterprise / Bitbucket** | OAuth/token or **CodeConnections**; webhooks for auto-build |
| **S3** | Zip archive as source (less common for app repos) |
| **No source** | Custom workflow; commands only use env vars and pre-uploaded inputs |

**Primary source** + **secondary sources**: Multiple repos in one build (e.g. app repo + shared config repo).

## Environment images and compute
| Image type | Use |
| --- | --- |
| **Managed images** | AWS-maintained Amazon Linux, Ubuntu, Windows, ARM, GPU variants |
| **Custom image** | Your Docker image in **ECR** (must include CodeBuild agent/runtime expectations) |

| Compute option | Use |
| --- | --- |
| **On-demand** (general/build fleet) | Default; scales per account limits |
| **Reserved capacity fleet** | Dedicated warm capacity, predictable performance, private VPC builds at scale |
| **Lambda compute** | Short, lighter builds without provisioning build hosts (exam awareness) |

**Privileged mode**: Required to run **`docker build`** inside CodeBuild (Docker-in-Docker). Enables building and pushing container images to ECR.

## Build lifecycle and statuses
```text
SUBMITTED → QUEUED → PROVISIONING → DOWNLOAD_SOURCE → INSTALL → PRE_BUILD
    → BUILD → POST_BUILD → UPLOAD_ARTIFACTS → FINALIZING → COMPLETED
```

| Status | Meaning |
| --- | --- |
| **SUCCEEDED** | All phases completed |
| **FAILED** | Command returned non-zero or phase error |
| **FAULT** | CodeBuild internal error |
| **TIMED_OUT** | Exceeded project timeout |
| **STOPPED** | User stopped the build |

Logs stream to **CloudWatch Logs** (`/aws/codebuild/<project-name>`). Metrics appear in **`AWS/CodeBuild`** namespace.

## CodeBuild vs related services
| Requirement | Service |
| --- | --- |
| Run compile/test/build commands | **CodeBuild** |
| Orchestrate stages and approvals | **CodePipeline** |
| Deploy to EC2/ASG/Lambda/ECS | **CodeDeploy** (after build) |
| Self-hosted Jenkins on EC2 | Not CodeBuild — you manage servers |
| Run arbitrary shell on EC2 on schedule | **SSM** / **User data** — not CI pattern |
| Package repos (npm/Maven) | **CodeArtifact** (CodeBuild consumes via login) |

**Exam tip**: CodeBuild **builds and tests**; it does **not** replace deployment unless you explicitly run deploy commands in buildspec (usually separate deploy stage with least privilege).

## IAM essentials
- **Service role** attached to the project — not the developer's user.
- Role needs: CloudWatch Logs, S3 artifacts/cache, ECR pull/push, Secrets Manager/Parameter Store read, VPC ENI permissions if VPC-enabled, CodeConnections/CodeCommit access, KMS decrypt for encrypted buckets/secrets.
- **Do not** store long-lived access keys in buildspec or Git — use the service role and secrets integration.

## Encryption
- **Artifacts** and **cache** in S3 can use SSE-S3 or **SSE-KMS** (customer managed key).
- **Logs** encrypted in CloudWatch.
- Service role and **KMS key policy** must allow `kms:Decrypt` / `kms:GenerateDataKey`.

## Pricing awareness (exam level)
- Billed by **build duration** and **compute type** (and fleet/Lambda where used).
- **Cache** and **artifact** storage in S3 billed separately.
- Faster builds via right-sized compute, caching dependencies, and parallel batch builds.

See `Buildspec, artifacts, cache, and test reports.md` and `Security, VPC, integrations, and exam scenarios.md` for depth.
