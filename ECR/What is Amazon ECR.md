# What is Amazon ECR?

Amazon Elastic Container Registry (**ECR**) is a **fully managed Docker/OCI container image registry**. It stores, manages, and deploys images for **Amazon ECS**, **Amazon EKS**, **AWS Lambda** (container images), **AWS Fargate**, and **CodeBuild**.

ECR answers: **"Where do we privately store versioned container images for AWS deployments?"**

## ECR vs Docker Hub (exam)
| Requirement | Service |
| --- | --- |
| Private images in your AWS account with IAM | **Amazon ECR** |
| Pull public images into AWS with caching | **ECR pull through cache** |
| Package repos (npm/Maven) | **CodeArtifact** — not ECR |
| Run containers | **ECS/EKS/Lambda** — not ECR |

## Core components
| Component | Purpose |
| --- | --- |
| **Registry** | Container for repositories in an account/Region (`account-id.dkr.ecr.region.amazonaws.com`) |
| **Repository** | Named store for images (e.g. `my-app`) |
| **Image** | Manifest + layers identified by **tag** and **digest** (SHA256) |
| **Repository policy** | Resource-based JSON policy (cross-account pull/push) |
| **Lifecycle policy** | Rules to expire untagged or old images |
| **Scanning configuration** | Basic or enhanced vulnerability scanning |

## Image identity
```text
111122223333.dkr.ecr.us-east-1.amazonaws.com/my-app:v1.2.3   ← tag (mutable)
111122223333.dkr.ecr.us-east-1.amazonaws.com/my-app@sha256:abc… ← digest (immutable)
```

**Exam tip**: Production deploys should pin **digest** or use **immutable tags** — tags can be overwritten.

## Public vs private
| | **Private ECR** | **Amazon ECR Public** |
| --- | --- | --- |
| Access | IAM + repository policy | Public gallery + alias |
| Typical use | Company applications | Open-source distribution |

DevOps CO2 focus is **private ECR** in your accounts.

## Authentication
Docker/API clients use **temporary tokens** from `aws ecr get-login-password` (IAM-based), not long-lived registry passwords.

Required IAM (typical):
- `ecr:GetAuthorizationToken` — on `*` (account-level)
- `ecr:BatchCheckLayerAvailability`, `GetDownloadUrlForLayer`, `BatchGetImage` — pull
- `ecr:PutImage`, `InitiateLayerUpload`, `UploadLayerPart`, `CompleteLayerUpload` — push

CodeBuild/CodePipeline roles use the same pattern in buildspec.

## How ECR fits in CI/CD
```text
CodeBuild (docker build && docker push)
        ↓
ECR repository
        ↓
ECS deploy / EKS rollout / Lambda update / CodePipeline ECR source
```

CodePipeline can use **ECR as a source** (new image tag triggers pipeline).

## Encryption
- Images encrypted **at rest** with **AES-256** (AWS-managed) or **KMS CMK** (repository setting).
- **In transit**: TLS for push/pull.
- Cross-account pull with CMK requires **KMS key policy** + IAM on consumer.

## Features overview (exam map)
| Feature | Purpose |
| --- | --- |
| **Image scanning** | CVE detection on push or continuous (enhanced) |
| **Lifecycle policies** | Auto-delete old/untagged images — cost control |
| **Replication** | Copy images across Regions/accounts |
| **Pull through cache** | Cache upstream registries (Docker Hub, etc.) in ECR |
| **Repository creation templates** | Standardize new repos (scanning, encryption, policies) |
| **Managed signing** | Sign images on push (supply chain) |
| **Blob mounting** | Share layers across repos in same registry (cost/performance) |

See `Scanning, lifecycle, replication, and pull-through cache.md` and `Security, policies, CI-CD, and exam scenarios.md`.

## ECR vs ECS (exam trap)
| **ECR** | **ECS** |
| --- | --- |
| Stores **images** | Runs **tasks/services** using images |
| `docker push` | `RunTask`, service update with image URI |

## Pricing awareness
- Storage per GB-month
- Data transfer (out to internet/cross-Region)
- Enhanced scanning (Inspector) additional cost
- Pull through cache upstream sync

## Regional behavior
ECR is **Regional**. Images in `us-east-1` are not visible in `eu-west-1` unless **replication** or explicit push/pull cross-Region.

Use **replication** for DR and multi-Region ECS/EKS deploys.
