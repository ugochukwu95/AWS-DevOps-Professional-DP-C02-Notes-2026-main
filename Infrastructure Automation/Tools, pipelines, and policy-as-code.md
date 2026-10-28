# Infrastructure automation — tools, pipelines, and policy-as-code

## Amazon CloudFormation (core exam IaC)
| Capability | Exam use |
| --- | --- |
| **Stack** | Unit of deployment; create/update/delete |
| **Change set** | Preview changes before prod apply |
| **Stack policy** | Protect critical resources from update/delete during incident |
| **Drift detection** | Manual console/API changes vs template |
| **Nested stacks** | Modular templates; parent/child stacks |
| **StackSets** | Same template to **many accounts/Regions** |
| **Hooks** | **Pre-create/pre-update** validation — **proactive** guardrails |
| **Custom resources** | Lambda-backed CRUD for unsupported resources |

```text
Git (template.yaml)
        ↓
CodeBuild: cfn-lint, cfn-guard, validate-template
        ↓
CodePipeline → CloudFormation deploy (change set + manual approval)
        ↓
Stack UPDATE_COMPLETE
```

**Capabilities**: `CAPABILITY_IAM`, `CAPABILITY_NAMED_IAM`, `CAPABILITY_AUTO_EXPAND` (SAM/macros).

### StackSets (organization baseline)
| Model | When |
| --- | --- |
| **Service-managed** | **Organizations** integration; new accounts in OU get stacks |
| **Self-managed** | Custom admin + **execution roles** per target account |

Use for: centralized logging, Config recorder, GuardDuty delegate, standard VPC — see **CloudFormation StackSets** note.

### CloudFormation Hooks vs AWS Config
| | **CloudFormation Hooks** | **AWS Config** |
| --- | --- | --- |
| **Timing** | **Before** resource is created/updated in stack | **After** resource exists |
| **Effect** | **Block** non-compliant stack operation | **Flag** NON_COMPLIANT + optional remediation |
| **Exam** | “Prevent public RDS at deploy time” | “Detect and fix public RDS after fact” |

**Control Tower proactive controls** use hooks; **detective controls** use Config.

## AWS SAM and CDK (CloudFormation under the hood)
| Tool | Output |
| --- | --- |
| **SAM** | Transformed CFN with `AWS::Serverless::*` |
| **CDK** | Synthesizes to CloudFormation template |

Pipeline: `sam build` / `cdk synth` → deploy stack with `CAPABILITY_AUTO_EXPAND`.

## Terraform (repo: Terraform/)
| Concept | Exam |
| --- | --- |
| **State** | Source of truth mapping; S3 backend + DynamoDB lock |
| **Plan / apply** | Like change set + execute |
| **Modules** | Reuse like nested stacks |
| **Workspace** | Env separation |

CodeBuild can run `terraform plan` on PR and `apply` on merge — same CI/CD patterns as CFN.

## CI/CD for infrastructure
| Stage | Actions |
| --- | --- |
| **Source** | CodeCommit, GitHub, CodeConnections |
| **Build** | Lint (`cfn-lint`, `checkov`, `tf fmt`), unit tests for Lambda |
| **Deploy** | CloudFormation action, CodeDeploy (apps), ECS action |
| **Approval** | Manual gate before prod stack execute |

**Artifact**: packaged template (nested templates/Lambda zips in S3 from `aws cloudformation package` or `sam package`).

**IAM**: pipeline role, CloudFormation **service role**, `iam:PassRole` for resources that need execution roles.

## AWS Systems Manager — fleet configuration
| Feature | Automation role |
| --- | --- |
| **State Manager** | **Desired-state** associations (install agent, enforce config) on schedule |
| **Maintenance Windows** | Patch/install during approved window |
| **Automation** | Multi-step runbooks (also used by Config remediation) |
| **Distributor** | Package distribution |
| **Quick Setup** | Org-wide SSM capabilities |

Pattern:
```text
Tag: Environment=Prod
        ↓
State Manager association (document AWS-ConfigureAWSPackage or custom)
        ↓
Compliance reported in Systems Manager
```

## EC2 Image Builder (immutable infra)
```text
Image pipeline (components + recipe)
        ↓
Test instance (optional)
        ↓
Distribute AMI to Regions
        ↓
Update launch template → ASG instance refresh / CodeDeploy
```

Automate **OS and baseline software** — pair with **Config** to ensure instances use approved AMIs.

## AWS Config — governance automation
| Feature | Use |
| --- | --- |
| **Managed/custom rules** | Evaluate resource config |
| **Conformance packs** | Bundle rules for PCI/HIPAA-style baselines |
| **Remediation** | SSM Automation on NON_COMPLIANT |
| **Aggregator** | Org-wide compliance view |

Not a **deploy** tool — **detect and remediate** configuration drift.

## AWS Control Tower & Organizations
| Mechanism | Purpose |
| --- | --- |
| **AWS Control Tower** | Landing zone, guardrails, account factory |
| **AFT / Account Factory** | Automated account vending + baseline |
| **CfCT (Control Tower Customizations)** | Deploy customizations via Git → StackSets |
| **SCP** | **Prevent** API actions org-wide (e.g., no disable CloudTrail) |
| **Declarative policies** | Newer org-wide resource policy style (awareness) |

**Exam tip**: “Prevent member accounts from creating unencrypted S3” → **SCP** or **preventive** control; “find unencrypted S3” → **Config**.

## Service Catalog (awareness)
Self-service portal for **approved products** (CloudFormation templates) — governance for internal consumers; less common than StackSets on exam but valid “standardized infra products.”

## Policy-as-code in pipelines
| Tool | Where it runs |
| --- | --- |
| **cfn-guard** | Build stage — rules on CFN template |
| **AWS CloudFormation Hooks** | At stack operation time in AWS |
| **Config rules** | Continuous evaluation post-deploy |

Defense in depth: **guard in CI** + **hooks at deploy** + **Config in prod**.

## Cross-account deployment
```text
Tools account pipeline
        ↓ sts:AssumeRole
TargetAccountCloudFormationRole
        ↓
Stack creates resources in workload account
```

StackSets reverse the model: **administrator** account deploys **instances** everywhere.

## Rollback and safe updates
| Mechanism | Behavior |
| --- | --- |
| **CloudFormation rollback** | Failed update rolls back stack (unless disabled) |
| **Change set** | Human review before execute |
| **Stack policy** | Deny update/delete on production DB resource |
| **Blue/green** (Beanstalk, CodeDeploy, ECS) | Application-level safe rollout |

## Quick tool picker
| Requirement | Tool |
| --- | --- |
| Single-account stack from template | **CloudFormation** |
| Same baseline 50 accounts | **StackSets** |
| Serverless API + Lambda in one template | **SAM** |
| Third-party multi-cloud IaC | **Terraform** |
| Enforce package on all EC2 with tag | **State Manager** |
| Golden AMI pipeline | **Image Builder** |
| Block non-compliant CFN create | **CloudFormation Hooks** |
| Detect public SG after change | **Config** + remediation |
| Org prevent leaving org / disabling logging | **SCP** |

See **DOP-C02 exam scenarios and traps.md** for question patterns.
