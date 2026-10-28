# Infrastructure automation — DOP-C02 exam scenarios and traps

## High-value scenarios
| Scenario | Best answer |
| --- | --- |
| Deploy same VPC/logging stack to all new accounts in OU | **CloudFormation StackSets** (service-managed + Organizations) |
| Preview infra changes before prod | **CloudFormation change set** (+ manual approval in pipeline) |
| Template in Git; deploy on merge | **CodePipeline** → **CodeBuild** (lint) → **CloudFormation** deploy |
| SAM app with Lambda + API | `sam build` / `sam deploy` → **CloudFormation** with `CAPABILITY_AUTO_EXPAND` |
| Ensure SSM agent on all tagged EC2 | **SSM State Manager** association |
| No manual patching; roll new OS image | **Image Builder** → update **launch template** → **ASG** rolling refresh |
| Detect S3 buckets that become public | **AWS Config** rule + **remediation** |
| **Prevent** creating public RDS in CFN deploy | **CloudFormation Hook** or **Control Tower proactive control** |
| Org must not allow disabling CloudTrail | **SCP** in **Organizations** |
| Custom landing zone extensions from Git | **CfCT** (Control Tower Customizations) |
| Terraform team needs locking | **S3 backend** + **DynamoDB** state lock table |
| Drift: engineer changed SG in console | **CloudFormation drift detection** or **Config**; re-apply stack |
| Protect production RDS from stack update delete | **Stack policy** |
| Standardized internal “approved VPC product” | **Service Catalog** (if offered) vs StackSets for mandatory baseline |
| Multi-Region same stack | StackSet with multiple **Regions** per account |
| Cross-account prod stack from tools account | Pipeline **AssumeRole** + CloudFormation in target account |
| Conformance to PCI rule set across accounts | **Config conformance pack** + aggregator |
| Immutable Lambda code deploy | **CloudFormation/SAM** or pipeline — not SSH to runtime |

## Wrong-answer distractors
| Trap | Why wrong |
| --- | --- |
| **Config** to **block** stack create at deploy time | Config evaluates **existing** resources — use **Hooks/SCP** to prevent |
| **Run Command** to create VPC/subnets | **IaC/CloudFormation** creates network; SSM configures **instances** |
| **Elastic Beanstalk** for org-wide account baseline | Use **StackSets/Control Tower** |
| **Manual AMI copy** for golden image | **Image Builder** pipeline |
| **Single stack** when question says **50 accounts** | **StackSets** |
| **OpsWorks** for new designs | Legacy — **SSM**, **ECS**, **Beanstalk** per scenario |
| Store DB password in Git parameter | **Secrets Manager** / SSM SecureString |
| **Terraform apply** without remote state lock | Race conditions — **DynamoDB lock** |
| **Lambda custom resource** when native CFN resource exists | Prefer native resources unless exam specifies custom need |

## Incident vs automation crossover
| Scenario | Folder |
| --- | --- |
| Bad CloudFormation update broke prod | **Rollback** stack; **change sets** next time — also **Incident Response** |
| Config NON_COMPLIANT → auto-fix | **Infrastructure Automation** (Config remediation) |
| Credential in template commit | **Incident Response** (revoke) + fix pipeline secret scanning |

## Pipeline + IaC checklist (exam)
- [ ] Template lint/validate in **CodeBuild**
- [ ] **Change set** + approval for production
- [ ] **CAPABILITY_IAM** when creating roles
- [ ] Artifact bucket + **KMS** for packaged templates
- [ ] **PassRole** for Lambda/ECS execution roles in template
- [ ] **StackSets** execution roles in target accounts (self-managed)
- [ ] **Hooks** for preventive; **Config** for detective/remediate
- [ ] **SCP** for org-wide API denies
- [ ] **Image Builder** for immutable AMIs
- [ ] **State Manager** for OS-level desired state

## Related notes
- **AWS Cloudformation/** — stacks, StackSets, hooks
- **Terraform/** — state and manage
- **CodePipeline / CodeBuild** — deploy stages
- **AWS Control Tower** — AFT, CfCT
- **AWS Config** — rules, remediation
- **System Manager** — Automation, State Manager
- **AWS EC2 Image Builder**
- **Incident Response/** — rollback and failed deploys
