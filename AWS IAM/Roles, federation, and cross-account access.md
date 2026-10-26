# IAM roles, federation, and cross-account access

## IAM roles
A role has:
1. **Trust policy** — who can assume the role
2. **Permission policy(ies)** — what the role can do after assumption
3. Optional **permissions boundary** — maximum permissions cap

Roles do not have permanent passwords or access keys. Callers obtain **temporary credentials** through **AWS STS**.

## Trust policy vs permission policy
| Policy | Question it answers |
| --- | --- |
| **Trust policy** | Who may assume this role? |
| **Permission policy** | What APIs may this role call? |

Example trust policy — CodeBuild service role:
```json
{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Principal": { "Service": "codebuild.amazonaws.com" },
    "Action": "sts:AssumeRole"
  }]
}
```

Example trust policy — cross-account administrator access:
```json
{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Principal": { "AWS": "arn:aws:iam::111122223333:role/DeploymentRole" },
    "Action": "sts:AssumeRole",
    "Condition": {
      "StringEquals": { "sts:ExternalId": "unique-shared-secret" }
    }
  }]
}
```

## Common role types in DevOps workloads
| Role | Assumed by | Purpose |
| --- | --- | --- |
| **Service role** | AWS service on your behalf | CodePipeline, CodeBuild, CodeDeploy, CloudFormation service roles |
| **EC2 instance profile** | EC2 instance via metadata | App runtime access to S3, DynamoDB, SSM |
| **Lambda execution role** | Lambda service | Function access to AWS APIs |
| **Deployment role** | CI/CD pipeline or human operator | Deploy to target account/environment |
| **EventBridge target role** | EventBridge | Invoke API destinations, cross-account targets |
| **EKS IRSA role** | Pod via OIDC provider | Fine-grained pod-level AWS access |

## AWS STS operations (exam-relevant)
| API | Purpose |
| --- | --- |
| `AssumeRole` | Standard role assumption within or across accounts |
| `AssumeRoleWithWebIdentity` | OIDC/web identity providers (GitHub Actions, EKS IRSA) |
| `AssumeRoleWithSAML` | Enterprise IdP federation |
| `GetSessionToken` | MFA-protected longer sessions for IAM users |
| `GetFederationToken` | Federated user sessions with custom duration |
| `GetCallerIdentity` | Return current account, ARN, and user ID |

Default maximum session duration:
- **1 hour** by default for most roles
- Up to **12 hours** when configured on the role (where supported)

**Role chaining**: Assume Role A, then use those credentials to assume Role B. Maximum **1 hour** total for chained sessions regardless of role max duration.

## Cross-account access patterns

### Pattern 1 — AssumeRole (most common for DevOps)
```text
Account A (tools)                         Account B (workload)
─────────────────                         ────────────────────
DeploymentRole                            TargetDeployRole
  permission: sts:AssumeRole on B           trust: allows A's DeploymentRole
        ↓                                           ↓
Pipeline assumes TargetDeployRole → deploys CloudFormation / ECS / Lambda
```

Requirements:
- Identity policy in Account A allowing `sts:AssumeRole` on Account B role
- Trust policy on Account B role allowing Account A principal
- Permission policy on Account B role allowing deployment actions
- Optional `sts:ExternalId` in trust policy for third-party access scenarios

### Pattern 2 — Resource-based policy
Used when a resource in Account B grants access directly to a principal in Account A.

Examples:
- S3 bucket policy allowing another account to read artifacts
- SNS topic policy allowing cross-account publish/subscribe
- SQS queue policy for cross-account message access
- KMS key policy for cross-account decrypt
- ECR repository policy for image pull

For these, the caller usually still needs an **identity-based allow** in Account A unless the resource policy alone is sufficient for anonymous/public access (rare in exam answers).

### Pattern 3 — IAM Identity Center permission sets
```text
User signs in to Identity Center
        ↓
Permission set creates temporary role in target account
        ↓
User receives STS credentials for that account role
```

Best for human access across many accounts. Not the primary pattern for unattended CI/CD — use OIDC or a dedicated pipeline role instead.

## OIDC federation for external CI/CD
Use when GitHub Actions, GitLab CI, or another OIDC provider must deploy to AWS **without long-lived access keys**.

Setup:
1. Create an **IAM OIDC identity provider** for the external issuer URL.
2. Create a **deployment role** with least-privilege permissions.
3. Trust policy allows `sts:AssumeRoleWithWebIdentity` for the provider subject/audience claims.
4. CI workflow requests a short-lived token from the provider and calls STS.

Example trust condition (conceptual):
```json
"Condition": {
  "StringEquals": {
    "token.actions.githubusercontent.com:aud": "sts.amazonaws.com"
  },
  "StringLike": {
    "token.actions.githubusercontent.com:sub": "repo:my-org/my-repo:ref:refs/heads/main"
  }
}
```

**Exam tip**: OIDC/web identity replaces access keys for modern pipeline-to-AWS authentication.

## SAML federation
Enterprises federate Active Directory or another SAML 2.0 IdP to AWS:
- Users authenticate with corporate credentials
- AWS returns temporary credentials mapped to IAM roles
- Often implemented through **IAM Identity Center** rather than legacy IAM SAML providers

Use SAML/Identity Center for **people**. Use OIDC or `AssumeRole` for **automation**.

## Service-linked roles
- Created and managed by AWS for a specific service
- Have predefined trust and permissions for that service
- **SCPs do not apply** to service-linked roles
- Examples: AWS Config, GuardDuty, Organizations, many security and management services

Do not delete service-linked roles while the service still needs them.

## Permissions boundaries
A permissions boundary sets the **maximum** permissions an IAM user or role can have, even if attached policies would grant more.

```text
Effective permissions =
  intersection of (identity policies) AND (permissions boundary)
  minus explicit denies and SCP limits
```

Use cases:
- Delegate IAM administration safely — admin can create users/roles but not exceed the boundary
- Sandbox developer roles in shared tooling accounts
- Prevent privilege escalation through policy attachment

**Exam trap**: A permissions boundary **does not grant** access by itself. The identity still needs allow policies within that boundary.

## Session policies
Passed during `AssumeRole` to further restrict a single session.

Use when:
- A broad role exists but one pipeline stage needs narrower access
- Vendor access should be limited to one resource for one session

Session policy limits are combined with the role's permission policies and any permissions boundary.

## `sts:ExternalId`
Optional condition in cross-account trust policies when a third party assumes a role in your account.

- Mitigates **confused deputy** problems
- The external party must provide the matching ExternalId when assuming the role
- Common in SaaS integrations and partner access models

## Confused deputy problem
```text
Attacker tricks Service A into using its authority
to access Victim's resources in your account
```

Mitigations:
- `aws:SourceAccount` and `aws:SourceArn` conditions
- `sts:ExternalId`
- Restrict resource policies to known principals
- Avoid overly broad `Principal: "*"` without tight conditions

## EC2 instance profiles
An **instance profile** is a container for an IAM role attached to an EC2 instance.

- Applications retrieve temporary credentials from **instance metadata**
- Use one role per application tier or workload class
- SSM Session Manager access requires `AmazonSSMManagedInstanceCore` (or equivalent custom policy)

Build instances (CodeBuild in VPC, Image Builder, etc.) use instance profiles/roles the same way.

## CloudTrail session visibility
When a role is assumed, CloudTrail records:
- `userIdentity.type = AssumedRole`
- `userIdentity.arn` = role ARN with session name
- `userIdentity.sessionContext` includes issuer and MFA status where applicable

Use distinct **role session names** in automation (`CodePipeline-${ExecutionId}`) to simplify audit trails.

## Cross-account DevOps reference architecture
```text
Shared-services account
├── CodePipeline service role
├── CodeBuild service role
├── Artifact bucket (encrypted, private)
└── OIDC provider + GitHub deploy role
        │
        │ sts:AssumeRole
        ▼
Dev account / Prod account
├── CloudFormation execution role
├── CodeDeploy service role
├── Lambda execution roles
└── Resource policies (S3/KMS/ECR) as needed
```

Centralize tooling; deploy into workload accounts with scoped assume-role permissions.
