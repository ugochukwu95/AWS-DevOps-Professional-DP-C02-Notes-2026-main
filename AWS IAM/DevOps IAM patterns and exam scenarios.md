# DevOps IAM patterns and exam scenarios

## IAM Identity Center (AWS SSO)
Workforce access across multiple accounts from one login portal.

| Concept | Purpose |
| --- | --- |
| **Identity Center directory / external IdP** | Source of user identities |
| **Permission set** | Template of IAM policies assigned to a user/group for an account |
| **Account assignment** | Maps user/group + permission set → role in target account |

Features relevant to the exam:
- **ABAC** with principal tags and `aws:PrincipalTag/` conditions
- Temporary credentials through STS — no long-lived IAM users for humans
- Separate from application/IAM roles used by services

**Exam tip**: Human multi-account console/CLI access → **Identity Center**. Unattended pipeline deployment → **IAM role with OIDC or AssumeRole**, not Identity Center users.

## Service roles in CI/CD

### CodePipeline service role
Allows the pipeline to:
- Read/write artifact buckets
- Start CodeBuild projects
- Invoke Lambda actions
- Start CloudFormation change sets/stacks
- Start CodeDeploy deployments
- Use KMS keys for encrypted artifacts
- Pass other service roles where configured

The pipeline role needs **`iam:PassRole`** only for roles it explicitly hands to downstream actions.

### CodeBuild service role
Allows the build environment to:
- Pull source from CodeCommit, S3, GitHub, CodeConnections
- Read/write artifacts and cache buckets
- Publish logs to CloudWatch Logs
- Decrypt Secrets Manager secrets and SSM parameters
- Call AWS APIs required by integration tests
- Assume a cross-account role for deployment stages

Keep build roles scoped per project or environment. A single overly powerful build role is a common exam wrong answer.

### CodeDeploy role
Allows CodeDeploy to:
- Read revision bundles from S3
- Update Auto Scaling groups, EC2 instances, ECS services, or Lambda aliases
- Coordinate with ELB/ALB target groups during blue/green deployments

### CloudFormation execution role
CloudFormation assumes this role to create/update/delete stack resources.

- Stack operator needs `cloudformation:*` and **`iam:PassRole`** on the execution role
- Execution role needs permissions for the resources in the template
- **Service-managed stack sets** use organization roles; self-managed stack sets use administrator and execution roles per account

### Lambda execution role
Trust: `lambda.amazonaws.com`

Minimum pattern:
- CloudWatch Logs write permissions
- Plus permissions for services the function calls (S3, DynamoDB, SQS, etc.)
- VPC-enabled functions also need ENI-related EC2 permissions

## Least-privilege patterns for pipelines
```text
Source stage role
  read-only on repository / connection

Build stage role
  read artifacts, write test reports, pull secrets

Deploy-to-dev role
  assume role or deploy directly with scoped CloudFormation/CodeDeploy permissions

Deploy-to-prod role
  separate role, manual approval gate, tighter resource ARNs
```

Prefer:
- Separate roles per environment (dev/test/prod)
- Resource-level ARNs instead of `"Resource": "*"`
- Condition keys (`aws:SourceArn`, `aws:RequestedRegion`, tags)
- Approval actions before production roles are used

## Resource policies vs IAM policies — quick reference
| Resource | Cross-account access mechanism |
| --- | --- |
| **S3** | Bucket policy + caller IAM policy (unless public, which exams usually avoid) |
| **KMS** | Key policy + caller IAM policy — key policy is mandatory |
| **SNS / SQS** | Resource policy + caller IAM policy |
| **Lambda** | Resource-based policy on function + caller permission to invoke |
| **ECR** | Repository policy + caller IAM policy |
| **Secrets Manager** | Resource policy optional; often same-account role access |
| **Another IAM role** | Trust policy + `sts:AssumeRole` in caller policy |

## ABAC (attribute-based access control)
Grant access when principal tags match resource tags.

Example rule intent:
- Developers with `team=payments` may only modify resources tagged `team=payments`
- Use `aws:PrincipalTag/team` and `aws:ResourceTag/team`

Works with:
- IAM roles and Identity Center permission sets
- Many AWS services that support tag-based authorization

**Exam tip**: "Dynamic access based on job function tags without creating a role per team" → ABAC with tags.

## IAM Access Analyzer
- Identifies resources shared with external entities
- Validates custom policies against IAM policy grammar
- Generates least-privilege policy suggestions from CloudTrail activity
- Supports organization-wide analyzers in multi-account setups

Use Access Analyzer when an exam scenario asks how to **find unintended public or cross-account access**.

## Credential and access hygiene
| Practice | Why |
| --- | --- |
| No access keys in buildspec or Git | Secrets leak through logs and forks |
| Rotate or eliminate long-lived keys | Reduces blast radius |
| Use Secrets Manager / Parameter Store | Runtime secret retrieval with IAM role |
| Enable MFA on privileged humans | Required for sensitive operations |
| Use separate tooling and workload accounts | Limits production exposure |
| Apply SCP guardrails | Prevent disabling logging or creating public resources org-wide |

## SCP vs IAM — exam comparison
| Aspect | IAM policy | SCP |
| --- | --- | --- |
| Applies to | Users, groups, roles in one account | Member accounts and OUs |
| Can grant permissions | Yes | **No** — guardrail only |
| Affects management account | Yes | **No** |
| Affects service-linked roles | Yes | **No** |
| Overrides explicit IAM allow | No, unless SCP lacks permission | SCP can remove permission even if IAM allows |

Example SCP intent: "No one in member accounts may disable CloudTrail" — attach SCP with explicit deny on `cloudtrail:StopLogging` even if an admin role would otherwise allow it.

## Troubleshooting access denied

### Step-by-step
1. Confirm **which principal** made the call (role ARN, session name).
2. Check **CloudTrail** `AccessDenied` event for the attempted action and resource.
3. Verify **identity-based policy** allows the action on the resource.
4. For cross-account or resource access, verify **resource-based/trust policy**.
5. Check **permissions boundary** and **session policy** on the role.
6. Check **SCP** in Organizations for the account/OU.
7. For service workflows, verify **`iam:PassRole`** and the target role trust policy.
8. For KMS/S3/ECR failures, verify **encryption key policy** and `aws:SourceAccount` conditions.

### Common DevOps failure patterns
| Symptom | Likely cause |
| --- | --- |
| Pipeline starts but deploy action fails | Missing PassRole, wrong CloudFormation execution role trust, or insufficient deploy permissions |
| CodeBuild cannot read artifact | S3 bucket policy, KMS key policy, or build role missing `s3:GetObject` / `kms:Decrypt` |
| Cross-account Lambda invoke fails | Lambda resource policy missing source account/principal |
| GitHub Actions cannot assume role | OIDC trust `sub`/`aud` mismatch or wrong provider ARN |
| Developer can create wide IAM policies | Missing permissions boundary on delegated admin role |
| Org member disables security logging | Need SCP deny — IAM allow is not enough governance |

## High-value exam scenarios
| Scenario | Correct approach |
| --- | --- |
| CI/CD needs AWS access without static keys | IAM role + OIDC provider or `AssumeRole` |
| Pipeline deploys CloudFormation in another account | Cross-account role with trust + PassRole + execution role permissions |
| Restrict developers to their team's resources | ABAC with principal/resource tags |
| Prevent any account from making S3 buckets public | SCP with explicit deny |
| Limit how much access an IAM admin can grant | Permissions boundary on delegated admin roles |
| Human access to 50 AWS accounts | IAM Identity Center permission sets |
| Audit which external principals can access S3 | IAM Access Analyzer |
| Require MFA to delete production buckets | IAM policy condition `aws:MultiFactorAuthPresent` |
| Third-party SaaS assumes role in your account | Trust policy + `sts:ExternalId` |
| CodeBuild must read encrypted artifacts | Build role IAM policy + KMS key policy |
| Ensure only CodePipeline can write deployment bucket | S3 bucket policy with `aws:SourceArn` condition |
| Service needs to manage resources automatically | Service role with trust for that AWS service |
| Find who ran a API call | CloudTrail — not IAM |

## Exam traps
- **IAM cannot grant cross-account access alone** when a resource policy or trust policy is also required.
- **SCPs never grant permissions** — they only filter what IAM could otherwise allow.
- **Permission boundaries do not apply to the account root user.**
- **PassRole is not enough** — the service must be trusted by the role and allowed by the role permissions.
- **Groups cannot be principals** in resource policies or trust policies.
- **Role chaining max session is 1 hour** even if role max is 12 hours.
- **Identity Center permission sets are for people**, not the standard answer for machine pipeline authentication.
- **Overly broad `AdministratorAccess` on build roles** is almost always wrong — choose least privilege.
- **Resource policy allow + no identity allow** may still fail for cross-account calls depending on the service and direction of access.
- **Deleting a role immediately** breaks running pipelines, scheduled tasks, and CloudFormation stacks that depend on it.

## Quick service-role cheat sheet
| Service | Role name pattern | Must trust |
| --- | --- | --- |
| CodePipeline | Pipeline service role | `codepipeline.amazonaws.com` |
| CodeBuild | Project service role | `codebuild.amazonaws.com` |
| CodeDeploy | CodeDeploy service role | `codedeploy.amazonaws.com` |
| CloudFormation | Stack execution role | `cloudformation.amazonaws.com` |
| Lambda | Execution role | `lambda.amazonaws.com` |
| EC2 / ASG apps | Instance profile role | `ec2.amazonaws.com` |
| EventBridge | Target/input transformer role | `events.amazonaws.com` |
| GitHub Actions | Deploy role | OIDC provider + `sts:AssumeRoleWithWebIdentity` |

## Review checklist before the exam
- [ ] Policy evaluation order and explicit deny
- [ ] Trust policy vs permission policy vs PassRole
- [ ] Cross-account AssumeRole vs resource-based policy
- [ ] OIDC for external CI/CD
- [ ] SCP vs permission boundary vs session policy
- [ ] Identity Center vs IAM users vs IAM roles
- [ ] CodePipeline/CodeBuild/CloudFormation role separation
- [ ] High-value condition keys (`SourceArn`, `SourceAccount`, `SecureTransport`, tags)
- [ ] CloudTrail for **who**; IAM for **what is allowed**
