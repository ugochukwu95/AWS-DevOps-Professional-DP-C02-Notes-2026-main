# Best practices for a multi-account environment

## Enable root access management to simplify managing root user credentials for member accounts
Root access management prevents recovery of root user credentials, improving account security in your organization.
- Remove root user credentials for member accounts to prevent sign in to the root user. This also prevents member accounts from recovery of the root user.
- Assume a privileged session to perform the following tasks on member accounts:
  - Remove a misconfigured bucket policy that denies all principals from accessing an Amazon S3 bucket.
  - Delete an Amazon Simple Queue Service resource-based policy that denies all principals from accessing an Amazon SQS queue.
  - Allow a member account to recover their root user credentials. The person with access to the root user email inbox for the member account can reset the root user password and sign in as the member account root user.

## Manage your accounts within a single organization
We recommend creating a single organization and managing all your accounts within this organization.

## Group workloads based on business purpose and not reporting structure
We recommend that you isolate production workload environments and data under your top-level workload-oriented OUs.

## Use a dedicated management account
Run minimal workloads in the management account. SCPs do not apply there, so it is the highest-risk account if compromised.

## Apply SCP guardrails at the root or workload OUs
Use SCPs as guardrails (deny lists), not as the sole grant of permissions. Combine with least-privilege IAM in each account.

## Centralize security and logging accounts
Use dedicated member accounts for centralized logging (CloudTrail, Config, Security Hub), security tooling (GuardDuty admin), and backups—register them as delegated administrators where appropriate.

## Enable all features and use AWS Control Tower for landing zones
For greenfield multi-account setups, Control Tower on top of Organizations provides account vending, guardrails (SCPs), and compliance monitoring.

## Use multiple OUs for environment separation
Typical pattern: Security OU (log archive, audit), Infrastructure OU (shared services), Workloads OU (dev/staging/prod sub-OUs).

