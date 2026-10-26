# StackSets, CI/CD, hooks, and exam scenarios

## CloudFormation StackSets
Deploy **the same stack** to **multiple accounts and Regions** from a **StackSet administrator** account.

```text
StackSet administrator account
        ↓
StackSet (template + parameters)
        ↓
Stack instances (Account A us-east-1, Account B eu-west-1, …)
```

### Deployment models
| Model | Notes |
| --- | --- |
| **Service-managed** | Integrates with **AWS Organizations**; auto-deploy to accounts in OUs; new accounts can receive stacks automatically |
| **Self-managed** | You manage administrator and **execution roles** in each target account |

**Service-managed** requires trusted access with Organizations — common in **Control Tower** landing zones.

### IAM roles (self-managed exam pattern)
| Role | Account | Purpose |
| --- | --- | --- |
| **Administrator role** | Admin | Create StackSet, manage instances |
| **Execution role** | Target | CloudFormation creates resources in target account |

Administrator assumes **execution role** in target (`sts:AssumeRole`).

### StackSets vs repeated stacks
| Scenario | Answer |
| --- | --- |
| Baseline logging/config on all member accounts | **StackSets** |
| One app in one Region | Single **stack** |
| Control Tower account baseline | Service-managed **StackSets** |

## CodePipeline integration
```text
Source → CodeBuild (optional cfn package/lint) → CloudFormation deploy action
```

Deploy action options:
- **Create/replace stack** or **Create and execute change set**
- **Parameter overrides** from pipeline
- **Action role** — permissions to call CloudFormation and pass **execution role**
- **Stack name**, **template path** in artifact, **capabilities**

CodeBuild often runs:
- `cfn-lint`, `cfn-guard`, `aws cloudformation validate-template`
- `aws cloudformation package` (upload nested templates/Lambda zip to S3)

**Exam tip**: Artifacts bucket + KMS + pipeline role + **CloudFormation service role** must align for deploy stage success.

## SAM and CDK in pipelines
| Tool | Pipeline flow |
| --- | --- |
| **SAM** | `sam build` → `sam package` → CloudFormation deploy with `CAPABILITY_AUTO_EXPAND` |
| **CDK** | `cdk synth` → deploy synthesized template (`cdk deploy` uses CloudFormation) |

Both end as **CloudFormation stacks**.

## CloudFormation Hooks (proactive controls)
**Hooks** run **before** CloudFormation creates/updates resources — validate compliance.

Used by **AWS Control Tower proactive controls** and custom org guardrails.

| Hook phase | Purpose |
| --- | --- |
| **preCreate / preUpdate** | Block non-compliant resources before provision |

Implementation often uses **CloudFormation Guard** rules or Lambda hooks.

```text
Template submitted
        ↓
Hook evaluation (Guard policy)
        ↓
PASS → proceed | FAIL → stack operation blocked
```

**Exam distinctions**:
| Mechanism | When |
| --- | --- |
| **SCP** | Blocks API calls org-wide (preventive) |
| **Proactive hook** | Blocks **non-compliant CloudFormation** deploy |
| **Config rule** | Detective — after resource exists |
| **Terraform apply** | **Not** blocked by CFN hooks unless through CFN — exam trap |

## CloudFormation Guard (cfn-guard)
Policy-as-code validate templates in **CI** (CodeBuild) or via hooks.

Fail pipeline when template violates rules (encryption required, no open SG, etc.).

## AWS Service Catalog
Publishes **CloudFormation products** (templates + constraints) for self-service with governance.

Ties to **Control Tower Account Factory** and internal portals.

## Security best practices
- **Least privilege** on stack operator IAM and execution roles
- **Stack policies** protect critical resources from update/delete
- **Termination protection** on production stacks
- **Secrets** via dynamic references — not parameters in plaintext in Git
- **S3 bucket** for templates/nested stacks — block public access, SSE-KMS
- **CloudTrail** audit stack and StackSet API calls
- **Drift detection** on schedule for critical stacks

## Multi-account landing zone pattern
```text
Management account
        ↓
StackSets (logging, Config recorder, IAM roles) → all OUs
        ↓
Workload accounts deploy app stacks via CI/CD
        ↓
SCP + proactive hooks + Config detective controls
```

Aligns with **Control Tower**, **AFT**, **CfCT** notes.

## High-value exam scenarios
| Scenario | Correct approach |
| --- | --- |
| Deploy baseline IAM roles to every new org account | **Service-managed StackSet** on OU |
| Preview changes before prod stack update | **Change set** |
| Same VPC template reused inside one app | **Nested stack** |
| Pass VPC ID from network stack to app stack | **Export/ImportValue** |
| Block S3 bucket without encryption in CFN deploy | **Proactive hook** / **Guard** |
| Detect engineer changed SG in console | **Drift detection** + **Config** |
| Deploy Lambda+API from SAM | **Transform** + **CAPABILITY_AUTO_EXPAND** |
| Pipeline deploy with IAM roles in template | **CAPABILITY_NAMED_IAM** |
| Keep DynamoDB table if stack deleted | **DeletionPolicy: Retain** |
| Org-wide vs single account deploy | **StackSets** vs **stack** |
| Who deleted the stack? | **CloudTrail** |

## Exam traps
- **Change set** does not apply until **executed**.
- **ImportValue** is **Regional** — not cross-Region.
- **Hooks** apply to **CloudFormation** provisioning paths — not arbitrary Terraform/console-only creates (proactive control wording in Control Tower is CFN-focused).
- **StackSets** need correct **execution role** trust in target accounts (self-managed).
- **Disable rollback** leaves broken stack — use only for debug.
- **Custom resource** failures cause stack failure — must handle timeouts.
- **Elastic Beanstalk** uses CFN under the hood — but EB deploy action ≠ CloudFormation action in pipeline unless you deploy template directly.
- **CloudFormation** does not manage **existing** resources until **import** or create in stack.

## CloudFormation in the DevOps toolchain
```text
Git (template) → CodeBuild (lint/guard/package) → Artifact S3
        ↓
CodePipeline → CloudFormation (change set) → Manual approval
        ↓
Execute → Stack update → Config/ drift checks
```

## Review checklist
- [ ] Template sections and intrinsic functions
- [ ] DeletionPolicy / UpdateReplacePolicy
- [ ] Change sets
- [ ] Drift detection
- [ ] Nested stacks vs Export/Import
- [ ] Custom resources basics
- [ ] StackSets service-managed vs self-managed
- [ ] CodePipeline CFN action + capabilities
- [ ] Hooks vs SCP vs Config (proactive vs preventive vs detective)
- [ ] Dynamic references for secrets
- [ ] SAM/CDK → CloudFormation relationship
