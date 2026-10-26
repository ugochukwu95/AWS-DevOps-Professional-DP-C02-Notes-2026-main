# What is AWS IAM?

AWS Identity and Access Management (**IAM**) controls **who** can access AWS resources and **what** they can do. IAM is a **global** service. Users, groups, roles, and customer managed policies exist once per account; access to Regional resources is still scoped by policy.

IAM answers:

- Which principal can invoke this API?
- Which role should a service assume to access other resources?
- How do CI/CD pipelines get least-privilege, auditable access without long-lived keys?

IAM does **not** encrypt data, audit API calls by itself, or prevent resource creation before it happens. Pair IAM with **KMS**, **CloudTrail**, **SCPs**, and **Config** for a full security model.

## Core identities


| Identity                     | Purpose                                    | Exam note                                                                  |
| ---------------------------- | ------------------------------------------ | -------------------------------------------------------------------------- |
| **Root user**                | Account creator with full access           | Avoid daily use; enable MFA; cannot be restricted by permission boundaries |
| **IAM user**                 | Long-lived human or legacy app identity    | Prefer roles/federation for people and workloads                           |
| **IAM group**                | Collection of users for shared permissions | Cannot be referenced as a principal in a resource policy                   |
| **IAM role**                 | Temporary credentials via **STS**          | Preferred for services, CI/CD, and cross-account access                    |
| **IAM Identity Center user** | Workforce SSO identity                     | Maps to permission sets that create roles in target accounts               |




## Policy types


| Type                                       | Attached to                                            | Grants access?                                    |
| ------------------------------------------ | ------------------------------------------------------ | ------------------------------------------------- |
| **Identity-based policy**                  | User, group, or role                                   | Yes                                               |
| **Resource-based policy**                  | S3 bucket, SNS topic, SQS queue, KMS key, Lambda, etc. | Yes, on that resource                             |
| **Permissions boundary**                   | User or role                                           | No — sets maximum permissions                     |
| **SCP**                                    | Organization, OU, or account                           | No — sets maximum permissions for member accounts |
| **Session policy**                         | Assumed-role session                                   | No — further limits an already-assumed session    |
| **Service control policy (Organizations)** | Org/OU/account                                         | No — guardrail only                               |




## Policy JSON structure

```json
{
  "Version": "2012-10-17",
  "Statement": [{
    "Sid": "ExampleRead",
    "Effect": "Allow",
    "Action": ["s3:GetObject", "s3:ListBucket"],
    "Resource": [
      "arn:aws:s3:::example-artifacts",
      "arn:aws:s3:::example-artifacts/*"
    ],
    "Condition": {
      "Bool": { "aws:SecureTransport": "true" }
    }
  }]
}
```

Key fields:

- **Effect**: `Allow` or `Deny`
- **Action** / **NotAction**: API operations
- **Resource** / **NotResource**: ARNs
- **Principal**: Who — used in resource-based and trust policies
- **Condition**: Context keys that refine when the statement applies



## Managed vs inline policies


| Policy               | Reuse                                  | Update impact                             |
| -------------------- | -------------------------------------- | ----------------------------------------- |
| **AWS managed**      | AWS-maintained, shared across accounts | AWS updates versions                      |
| **Customer managed** | Your reusable policy in the account    | You version and attach to many principals |
| **Inline**           | Embedded in one user/group/role        | Deleted with the identity                 |


Prefer **customer managed** policies for DevOps roles so pipeline, build, and deployment permissions are reviewable in one place.

## Policy evaluation logic

```text
Request arrives
        ↓
Explicit Deny in any applicable policy? → DENY
        ↓
Organizations SCP allows action? → if SCP denies, DENY
        ↓
Permission boundary allows action? → if boundary denies, DENY
        ↓
Session policy allows action? → if session policy denies, DENY
        ↓
Identity-based and/or resource-based Allow? → ALLOW
        ↓
Otherwise → implicit DENY
```

**Exam rules**:

- **Explicit deny always wins.**
- **SCPs and permission boundaries never grant** — they only cap maximum permissions.
- **An allow is required** from an identity-based or resource-based policy (unless using role assumption where trust + identity policies interact).
- **SCPs do not apply to the Organizations management account** or to **service-linked roles**.



## Authentication vs authorization


| Step               | Mechanism                                                                                      |
| ------------------ | ---------------------------------------------------------------------------------------------- |
| **Authentication** | Proves identity — password + MFA, access keys, web identity/OIDC/SAML federation, `AssumeRole` |
| **Authorization**  | Policy evaluation decides whether the authenticated principal may perform the action           |




## Credentials


| Credential                   | Lifetime                                  | Typical use                             |
| ---------------------------- | ----------------------------------------- | --------------------------------------- |
| Access key + secret          | Long-lived until rotated/deleted          | Legacy automation — avoid when possible |
| Session token from STS       | 15 minutes to 12 hours (varies by method) | Roles, federation, assumed roles        |
| CodeCommit HTTPS credentials | Rotatable, IAM-generated                  | Git over HTTPS to CodeCommit            |


Never embed access keys in source code, buildspec files, CloudFormation templates, or container images.

## High-value condition keys (DevOps exam)


| Condition key                          | Use                                                                          |
| -------------------------------------- | ---------------------------------------------------------------------------- |
| `aws:SourceAccount`                    | Allow only if request originates from a specific account                     |
| `aws:SourceArn`                        | Allow only if caller is a specific resource (for example a CodePipeline ARN) |
| `aws:PrincipalOrgID`                   | Restrict access to principals in your organization                           |
| `aws:SecureTransport`                  | Require HTTPS/TLS                                                            |
| `aws:MultiFactorAuthPresent`           | Require MFA for sensitive actions                                            |
| `aws:RequestedRegion`                  | Limit actions to approved Regions                                            |
| `aws:PrincipalTag/`                    | ABAC — match principal tag to resource tag                                   |
| `aws:ResourceTag/`                     | ABAC — tag-based access to resources                                         |
| `aws:userid`                           | Distinguish role sessions in CloudTrail (`role-id:session-name`)             |
| `aws:PrincipalArn`                     | Match a specific role or user ARN                                            |
| `aws:CalledVia` / `aws:CalledViaFirst` | Allow access only when invoked through another service                       |
| `aws:SourceVpc` / `aws:SourceVpce`     | Restrict to traffic from a VPC or VPC endpoint                               |
| `aws:EpochTime` / `aws:CurrentTime`    | Time-bound access                                                            |
| `iam:PassRole` + `iam:PassedToService` | Control which roles can be passed to which service                           |


Example — restrict S3 write to a specific CodeBuild project:

```json
"Condition": {
  "StringEquals": {
    "aws:SourceAccount": "111122223333"
  },
  "ArnLike": {
    "aws:SourceArn": "arn:aws:codebuild:eu-west-1:111122223333:project/my-project"
  }
}
```



## `iam:PassRole` — critical for DevOps

Many services create or manage resources **using a role you specify**. The caller needs `iam:PassRole` on that role **and** the role's trust policy must allow the service.

Common PassRole scenarios:

- CodePipeline passes a role to CodeBuild or CloudFormation
- CodeBuild passes a role to EC2/Fargate test runners
- CloudFormation passes a service role to create stacks
- EC2 launch template passes an instance profile
- Lambda function configuration references an execution role

PassRole permission alone is not enough. The target role must:

1. Trust the service (`lambda.amazonaws.com`, `codebuild.amazonaws.com`, etc.)
2. Have permission policies allowing the required API actions



## Related services — exam distinctions


| Requirement                                           | Service                                               |
| ----------------------------------------------------- | ----------------------------------------------------- |
| Control API permissions for principals in one account | **IAM policies and roles**                            |
| Set maximum permissions across many accounts          | **Organizations SCPs**                                |
| Workforce SSO across accounts                         | **IAM Identity Center**                               |
| Temporary credentials for a role                      | **AWS STS**                                           |
| Audit who called an API                               | **CloudTrail**                                        |
| Analyze unused/overly broad access                    | **IAM Access Analyzer**                               |
| Block disallowed APIs at organization level           | **SCP** — not IAM alone                               |
| Secrets for apps and pipelines                        | **Secrets Manager / Parameter Store** — not IAM users |


**Exam tip**: IAM answers **authorization**. CloudTrail answers **who invoked the API**. Config answers **what the resource configuration was**.