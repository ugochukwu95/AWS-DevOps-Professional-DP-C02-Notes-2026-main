# What is infrastructure automation?

**Infrastructure automation** on DOP-C02 means defining, deploying, updating, and governing AWS resources **repeatably** — with **IaC**, **pipelines**, **policy-as-code**, and **operational automation** — instead of one-off console clicks.

```text
Source of truth (Git template / Terraform / SSM document)
        ↓
Validate (lint, cfn-guard, policy checks, hooks)
        ↓
Deploy (CloudFormation, StackSets, pipeline, Terraform apply)
        ↓
Detect drift (CloudFormation drift, Config rules)
        ↓
Remediate (re-deploy, Config remediation, State Manager)
```

**Exam mantra**: **Prevent** bad infra (hooks, SCPs) + **detect** drift (Config, drift detection) + **deploy** consistently (CFN/StackSets/pipelines).

## Goals the exam tests
| Goal | Typical mechanism |
| --- | --- |
| **Repeatable environments** | CloudFormation/SAM/Terraform; same template dev→prod |
| **Multi-account baseline** | **StackSets**, **Control Tower**, **Organizations SCPs** |
| **Least manual change** | CI/CD deploy stage; no SSH to “fix” prod |
| **Compliance at provision time** | **CloudFormation Hooks**, **Service Control Policies** |
| **Compliance after provision** | **AWS Config** rules + remediation |
| **Immutable servers** | **EC2 Image Builder** → ASG/launch template updates |
| **Configuration at scale** | **SSM State Manager** associations |

## Infrastructure as code (IaC) vs configuration management
| | **IaC (CloudFormation, Terraform, CDK, SAM)** | **SSM State Manager / Run Command** |
| --- | --- | --- |
| **Manages** | AWS **resources** (VPC, Lambda, RDS, IAM) | **OS/app configuration** on existing instances |
| **Model** | Declarative stacks | Desired-state documents on targets |
| **Exam** | “Deploy entire environment from Git” | “Ensure agent installed & patch baseline on all tagged EC2” |

Both can appear in one org: **CFN** creates EC2 ASG; **State Manager** enforces CloudWatch agent on those instances.

## Declarative vs imperative
| Style | Example |
| --- | --- |
| **Declarative** | CloudFormation template defines desired state; stack update diff |
| **Imperative** | Run Command “install this package now” |

Pipelines should prefer **declarative** for infra; use **imperative** runbooks for **break-glass** or **one-off** ops (often wrapped in Automation).

## Drift — two meanings
| Drift type | Tool |
| --- | --- |
| **Template vs deployed stack** | CloudFormation **drift detection** on stack resources |
| **Resource vs org policy** | **AWS Config** rules (e.g., SG open to world) |

Fix: **update stack** to template, or **Config remediation**, not “ignore until outage.”

## Immutable vs mutable infrastructure
| Approach | Pattern |
| --- | --- |
| **Immutable** | New AMI (Image Builder) → new launch template → ASG instance refresh / rolling replace |
| **Mutable** | Patch in place via SSM Patch Manager (still automated, but same instance ID) |

**Exam tip**: “No SSH patching in prod; deploy new golden image” → **Image Builder** + **ASG rolling update** / **CodeDeploy**.

## Parameters and secrets in automation
| Store | Use in automation |
| --- | --- |
| **CloudFormation parameters / mappings** | Environment sizing, feature flags in template |
| **SSM Parameter Store** | Non-secret config; **`AWS::SSM::Parameter::Value`** in CFN |
| **Secrets Manager** | DB passwords, API keys — reference from CFN/Lambda; rotate |
| **CodePipeline variables** | Per-environment overrides in pipeline |

Never commit secrets to Git — exam ethical and technical answer.

## Multi-environment patterns
| Pattern | Notes |
| --- | --- |
| **Same template, different parameters** | One repo; param files per env |
| **Separate accounts** (recommended prod) | SCPs + StackSets + pipeline assumes cross-account role |
| **Separate pipelines** | Blast radius isolation |
| **Git branches → environments** | `main` → prod with approval gate |

Related: **CodePipeline** multi-environment notes.

## What is *not* primary IaC on the exam
| Distractor | Why |
| --- | --- |
| **Manual console** | Opposite of automation |
| **User data only** without stack | Fragile; not source of truth |
| **Elastic Beanstalk** config only | PaaS — valid for apps, less for org-wide landing zone |
| **Copies of AMIs by hand** | Use **Image Builder** pipelines |

Deep dive on tools: **Tools, pipelines, and policy-as-code.md**.  
Exam stems: **DOP-C02 exam scenarios and traps.md**.

## Related notes in this repo
- **AWS CloudFormation** — stacks, drift, nested stacks, StackSets, hooks
- **Terraform** — state, workspaces
- **AWS SAM and Lambda** — serverless IaC
- **Systems Manager** — State Manager, Automation
- **AWS Config** — rules, conformance packs
- **AWS Control Tower** — landing zone, CfCT, AFT
- **CodePipeline / CodeBuild** — IaC CI/CD
