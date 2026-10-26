# Delegated administrator for AWS Organizations
We recommend storing AWS resources in member accounts and limiting use of the management account. SCPs do not restrict users or roles in the management account.

From the management account, you can delegate **Organizations policy management** to member accounts using a **resource-based delegation policy** (`organizations:PutResourcePolicy`). This is separate from registering a delegated administrator for an individual AWS service.

## What can be delegated
Per statement in the delegation policy, specify:
- **Principal**: Member account ID(s) receiving delegation
- **Policy types**: e.g. `SERVICE_CONTROL_POLICY`, `TAG_POLICY`, `BACKUP_POLICY`, `AISERVICES_OPT_OUT_POLICY`, `RESOURCE_CONTROL_POLICY`
- **Actions**: e.g. `CreatePolicy`, `UpdatePolicy`, `AttachPolicy`, `DetachPolicy`, `DeletePolicy`, `EnablePolicyType`, `DisablePolicyType`, plus read/list actions to view org structure and policies

Different member accounts can manage different policy types (e.g. security team manages SCPs, backup team manages backup policies).

## Requirements
1. Delegation policy created in the **management account** only
2. Delegated member account must have matching **IAM permissions** for the delegated actions
3. Delegated admins still cannot perform all management-account-only tasks (e.g. closing the organization, changing the management account)

## Three delegation methods (don't confuse them)
| Method | API / mechanism | Use for |
| --- | --- | --- |
| Resource-based delegation policy | `organizations:PutResourcePolicy` | SCP/tag/backup/RCP/AI opt-out policy management |
| Register delegated administrator | `organizations:RegisterDelegatedAdministrator` | Most integrated AWS services (after trusted access) |
| Service-specific admin API | e.g. `guardduty:EnableOrganizationAdminAccount` | Some services (GuardDuty, Security Hub, etc.) |

**Note**: As of June 2025, `NotAction` and `NotResource` are not allowed in resource-based delegation policies.
