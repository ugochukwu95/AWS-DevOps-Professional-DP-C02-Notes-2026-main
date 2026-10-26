# Account Factory, AFT, and CfCT

## Account Factory (console / Service Catalog)
Default Control Tower account vending mechanism.
- End users provision accounts from the **Account Factory** product in **AWS Service Catalog**.
- Each vended account lands in a specified **OU** with baseline StackSets and controls applied automatically.
- Account email, OU, and SSO access are configured at request time.
- Best for: small teams, manual or low-volume account creation.

## Account Factory Customization (AFC)
Extends Account Factory with **AWS Step Functions** and **Lambda** to run customizations after account creation (e.g. enable GuardDuty, deploy VPC baseline).
- Triggered automatically when Account Factory creates an account.
- Customization code lives in the **AFC repository** (CodeCommit or connected Git provider).
- Best for: moderate customization without full Terraform pipeline.

## Account Factory for Terraform (AFT)
GitOps-style account provisioning and customization at scale—**key for DevOps Professional exam**.

```
Developer commits aft-account-request → CodePipeline → Service Catalog (Account Factory) → New account
                                                              ↓
                                    AFT runs global + account customizations (Terraform)
```

### AFT architecture (accounts involved)
| Account | Purpose |
| --- | --- |
| **Management account** | Control Tower landing zone; shares Service Catalog portfolio with AFT |
| **AFT management account** | Hosts AFT pipeline, Terraform state, `aft-account-request` repo |
| **Log Archive / Audit** | Standard Control Tower shared accounts |
| **Vended accounts** | Workload accounts created by AFT |

### How AFT works
1. Deploy the **AFT solution** (CloudFormation/Solution Library) into a dedicated AFT management account.
2. Share the Control Tower **Account Factory portfolio** with the `AWSAFTExecution` role in the AFT account.
3. Add account requests using the **`aft-account-request`** Terraform module (email, account name, OU, tags, custom fields).
4. Commit to Git → pipeline provisions account via Service Catalog → AFT runs **global** and **account-level** Terraform customizations from separate repos (`global-customizations`, `account-customizations`).

### AFT vs Account Factory
| | Account Factory | AFT |
| --- | --- | --- |
| Interface | Service Catalog console/API | Git + Terraform |
| Customization | AFC (Lambda/Step Functions) | Terraform modules in Git repos |
| Scale | Manual/low volume | High volume, repeatable, reviewable PRs |
| DevOps fit | Basic | **IaC / GitOps standard** |

## Customizations for AWS Control Tower (CfCT)
Deploy **custom resources and controls** across your landing zone using **CloudFormation** and a GitOps pipeline (similar philosophy to AFT but CFN-native).
- Customize OUs, accounts, and optional Control Tower controls via manifest files.
- Uses CodePipeline + Step Functions to deploy StackSets and control changes.
- Best for: teams standardized on CloudFormation rather than Terraform.

## Exam traps
- **Log Archive / Audit**: existing accounts can only be imported at **initial** landing zone setup—not later.
- **Preventive controls** do not apply to the **management account** (same as Organizations SCP behavior).
- **AFT** still uses Control Tower Account Factory under the hood—it automates the request, not a separate vending path.
- **Proactive controls** only block **CloudFormation** deployments—not Terraform or console creates unless they go through CFN.
