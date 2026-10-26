# Stacks, updates, drift, and nested stacks

## Stack lifecycle
```text
CREATE_IN_PROGRESS → CREATE_COMPLETE
UPDATE_IN_PROGRESS → UPDATE_COMPLETE
DELETE_IN_PROGRESS → DELETE_COMPLETE
```

On **create/update failure**, default behavior **rolls back** (deletes failed create or reverts update) unless **disable rollback** is set.

| Setting | Effect |
| --- | --- |
| **Rollback on failure** (default) | Automatic revert — safe for prod |
| **Disable rollback** | Preserve failed partial stack for debugging |
| **Termination protection** | Prevent accidental stack delete |
| **Stack policy** | Deny updates to specific resources (protect prod data layer) |

**ContinueUpdateRollback**: Recover stack stuck in `UPDATE_ROLLBACK_FAILED`.

## Change sets (exam-critical)
Preview **what will change** before applying an update.

```text
Submit template/params → CreateChangeSet → Review (add/modify/remove)
        ↓
ExecuteChangeSet → UpdateStack
```

Use in:
- Console, CLI, CI/CD (**CodePipeline** CloudFormation deploy action often uses change sets for prod)
- Peer review of infrastructure diffs (like `terraform plan`)

**Exam tip**: "Preview IAM and resource changes before production deploy" → **change set**.

## Update behaviors
CloudFormation determines **create / update / replace / delete** per property change.

| Change type | Example |
| --- | --- |
| **In-place update** | Tags on S3 bucket |
| **Replacement** | Property change forces new physical resource (new name/ID) |

**DependsOn** — explicit dependency when `Ref`/`GetAtt` is insufficient.

**CreationPolicy / cfn-signal** — wait for application signal before marking resource CREATE_COMPLETE (legacy EC2/bootstrap patterns; awareness for exam).

## Drift detection
**Drift** = someone changed resources **outside** CloudFormation (console, CLI, Terraform).

```text
DetectStackDrift → DRIFTED | IN_SYNC | NOT_CHECKABLE
```

- Stack-level and resource-level drift status
- Remediation: update template to match intent, or **import** / manual fix and redeploy

**Exam tip**: "Console edit broke IaC compliance" → **Config** detects config change; **CloudFormation drift detection** compares to template — fix by redeploying template or importing.

Drift ≠ **CloudTrail** (who changed) — use both.

## Nested stacks
Split large templates into **reusable child stacks**.

```text
Root stack
├── NetworkStack (nested)
├── AppStack (nested)
└── DatabaseStack (nested)
```

- Child template URL in **S3**
- Parent passes **Parameters** to child
- Child **Outputs** available to parent via `Fn::GetAtt`

Benefits: modular IaC, reuse, parallel creation where possible.

**Exam tip**: "Reuse network template across app stacks" → **nested stack** or **StackSets** depending on account scope.

## Cross-stack references (same Region)
**Export** in stack A:
```yaml
Outputs:
  VpcId:
    Value: !Ref MyVpc
    Export:
      Name: MyApp-VpcId
```

**Import** in stack B:
```yaml
VpcId: !ImportValue MyApp-VpcId
```

Exports are **Regional** — cannot import across Regions.

## Custom resources
Run **Lambda** (or on-prem handler) during create/update/delete when no native CFN resource exists.

Pattern:
```text
CloudFormation → Lambda custom resource → physical resource
        ↓
Send response to pre-signed S3 URL (cfn-response)
```

Requires stable **service role** and idempotent handler logic.

**Exam tip**: "Provision third-party resource via API during stack create" → **custom resource** (Lambda).

## Resource import
**Import existing resources** into a new or existing stack without recreating them.

Use when adopting IaC on brownfield accounts.

Distinct from **CloudFormation resource type** `AWS::...` create.

## Macros and transforms
| Feature | Purpose |
| --- | --- |
| **Transform: AWS::Serverless** | SAM — expands serverless resources |
| **Macros** | Template preprocessing (org-internal transforms) |

Require **CAPABILITY_AUTO_EXPAND** when expanded template includes new resources.

## Stack update policies (Auto Scaling groups)
For **AWS::AutoScaling::AutoScalingGroup** embedded in templates (exam awareness from domain docs):

| Update policy | Behavior |
| --- | --- |
| **AutoScalingRollingUpdate** | Replace instances in batches |
| **AutoScalingReplacingUpdate** | Replace entire group |

Similar concepts to Elastic Beanstalk rolling/immutable — but at **CloudFormation ASG** level.

## Rollback and safety patterns
```text
Dev: direct UpdateStack
Staging: change set + automated tests
Prod: change set + manual approval (CodePipeline) + StackPolicy on data resources
```

Combine with:
- **Termination protection** on prod stacks
- **DeletionPolicy: Retain** on stateful resources
- **AWS Config** rules on resource types after deploy

## Nested vs StackSets (exam distinction)
| | **Nested stacks** | **StackSets** |
| --- | --- | --- |
| Scope | **One account**, one Region (per stack) | **Many accounts/Regions** |
| Use | Modular template within app | Landing zone, org-wide baseline |

## Troubleshooting
| Symptom | Check |
| --- | --- |
| UPDATE_ROLLBACK_COMPLETE | Fix template; continue update rollback if stuck |
| Circular dependency | Refactor DependsOn / split stacks |
| Export already exists | Export name collision across stacks |
| Custom resource failed | Lambda logs, timeout, IAM, cfn-response |
| Early validation failed | Template syntax, Guard/hook failure |
| Insufficient capabilities | Add CAPABILITY_IAM / NAMED_IAM / AUTO_EXPAND |

## Stack exam scenarios
| Scenario | Answer |
| --- | --- |
| Preview prod infra changes | **Change set** |
| Modular VPC + app templates one account | **Nested stacks** |
| Share subnet IDs between stacks | **Export/ImportValue** |
| Keep RDS when stack deleted | **DeletionPolicy: Snapshot/Retain** |
| Detect manual console changes | **Drift detection** |
| Integrate non-CFN API resource | **Custom resource** |
| SAM/Lambda API | **Transform AWS::Serverless** |
