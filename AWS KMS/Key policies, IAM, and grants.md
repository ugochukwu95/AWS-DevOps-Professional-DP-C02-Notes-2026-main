# Key policies, IAM, and grants

Access to a customer managed key requires **both**:
1. A **key policy** on the KMS key, and
2. An **IAM policy** on the caller (user, role, or service)

If either denies or fails to allow, access is denied. Key policies are the primary access-control mechanism for KMS—unlike most AWS resources where IAM alone is enough.

## Default key policy
When you create a CMK without a custom policy, the default allows the **account root** full access. Individual IAM users/roles still need their own IAM permissions—the root allowance does not automatically grant everyone in the account.

## Cross-account access pattern
```text
Account A (key owner)                    Account B (consumer)
─────────────────────                    ──────────────────────
CMK key policy allows                    IAM role policy allows
Account B role/user:                     role to use key in Account A:
  kms:Decrypt, kms:GenerateDataKey         kms:Decrypt, kms:DescribeKey
        ↓                                          ↓
              Both must allow → decrypt succeeds
```

Common cross-account uses:
- Encrypted S3 objects shared via bucket policy
- Encrypted AMIs or EBS snapshots shared to another account
- CodePipeline/CodeBuild artifacts in a central account
- Secrets Manager or Parameter Store cross-account access

**Exam tip**: Cross-account decrypt failures are almost always **key policy on the CMK** missing the consumer principal, or the consumer **IAM role** missing `kms:Decrypt`/`kms:GenerateDataKey`.

## Key policy vs IAM policy vs SCP
| Control | Scope | Effect |
| --- | --- | --- |
| **Key policy** | One KMS key | Allow/deny principals for that key |
| **IAM policy** | Principal (user/role) | Allow/deny KMS actions on key ARNs |
| **SCP** | Organization/account/OU | Guardrail on maximum permissions; cannot grant what SCP denies |

## Grants
Temporary delegations that let AWS **services** use your key on your behalf.

| Use grants when | Prefer key policy/IAM when |
| --- | --- |
| AWS service needs key access for a specific resource (legacy patterns) | Standard role-based access for apps and CI/CD |
| Cross-account attachment scenarios with grant-for-aws-resource | Clear, auditable static policies |

Grants can include **grant constraints** (for example, encryption context must match). Most modern exam answers favor **key policy + IAM role** over grants unless the question mentions grants explicitly.

## Least-privilege KMS actions (exam-relevant)
| Action | Purpose |
| --- | --- |
| `kms:Encrypt` | Encrypt small data (< 4 KB) directly with CMK |
| `kms:Decrypt` | Decrypt ciphertext |
| `kms:GenerateDataKey` | Envelope encryption—returns plaintext DEK + encrypted DEK |
| `kms:GenerateDataKeyWithoutPlaintext` | Encrypted DEK only (caller never sees plaintext DEK) |
| `kms:ReEncrypt*` | Re-encrypt with same or different CMK |
| `kms:CreateGrant` | Delegate usage to a service |
| `kms:DescribeKey` | Metadata lookup (often required alongside decrypt) |
| `kms:ViaService` | Condition—allow use only when called through a specific AWS service endpoint |

Use **`kms:ViaService`** in key policies to restrict decryption to calls made through `s3.eu-west-1.amazonaws.com`, `ec2.us-east-1.amazonaws.com`, etc.

## Encryption context
Optional key-value pairs passed with `Encrypt`/`Decrypt`/`GenerateDataKey`. AWS services often set context automatically (for example S3 bucket name and object key).

- Must be **identical** on decrypt or the operation fails.
- Appears in **CloudTrail** logs—use for audit and policy conditions.
- Key policy/IAM can require specific context values with `kms:EncryptionContext:key`.

**Exam tip**: "Ensure only Lambda function X can decrypt" → key policy with `kms:EncryptionContext:aws:lambda:function-name` condition.

## CloudTrail auditing
All KMS API calls (`Decrypt`, `GenerateDataKey`, `CreateKey`, etc.) are logged to CloudTrail. Use this to answer "who decrypted this data?" or "audit key usage across accounts."
