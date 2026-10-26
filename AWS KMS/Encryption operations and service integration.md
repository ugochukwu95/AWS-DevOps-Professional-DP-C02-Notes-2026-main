# Encryption operations and service integration

## Envelope encryption
Large data is not encrypted directly with the CMK for every byte. KMS uses **envelope encryption**:

```text
1. App calls GenerateDataKey on CMK
2. KMS returns:
     - Plaintext data encryption key (DEK)  ← use locally, then discard from memory
     - Encrypted DEK (wrapped by CMK)
3. App encrypts data with plaintext DEK (AES locally)
4. Store: encrypted data + encrypted DEK
5. To decrypt: call KMS Decrypt on encrypted DEK → plaintext DEK → decrypt data locally
```

Benefits:
- Reduces KMS API calls and cost
- Keeps bulk crypto local; CMK never leaves KMS/HSM
- Same pattern used by S3 SSE-KMS, EBS, RDS, etc.

| API | When to use |
| --- | --- |
| `GenerateDataKey` | App/service needs plaintext DEK for local encryption |
| `GenerateDataKeyWithoutPlaintext` | Only encrypted DEK should exist outside KMS (some AWS services) |
| `Encrypt` / `Decrypt` | Small payloads (< 4 KB) or encrypted DEK handling |
| `ReEncrypt` | Change CMK on existing ciphertext without decrypting data locally |

## SSE options for S3 (exam favorite)
| Mode | Key | Who manages key | Cross-account nuance |
| --- | --- | --- | --- |
| SSE-S3 | S3-managed | AWS | Simplest; no KMS policy |
| SSE-KMS | CMK or AWS managed | You or AWS | Requires KMS permissions to read/write |
| SSE-C | Customer-provided | You (outside KMS) | You supply key bytes per request |

For SSE-KMS objects, readers need **`s3:GetObject`** and **`kms:Decrypt`** on the CMK.

## Common AWS service integrations
| Service | Encryption pattern |
| --- | --- |
| **EBS / RDS / DynamoDB** | Encrypted at rest with CMK; snapshot/copy needs key access in target account/Region |
| **S3** | SSE-KMS on bucket or object; bucket policy + KMS key policy for cross-account |
| **Secrets Manager** | Secret encrypted with CMK; rotation Lambda needs `kms:Decrypt`/`Encrypt` |
| **SSM Parameter Store** | `SecureString` uses CMK; standard/advanced parameters |
| **Lambda** | Env vars and `/aws/lambda` logs can use CMK; execution role needs KMS access |
| **CloudWatch Logs** | Log group KMS encryption; writers need `kms:Encrypt`/`GenerateDataKey` |
| **SNS / SQS** | Server-side encryption with CMK; publishers/consumers need key use permissions |
| **ECR** | Images encrypted at rest; replication requires matching encryption type and key access |
| **CodeBuild / CodePipeline** | Artifacts and logs encrypted with CMK; service roles need key policy allow |
| **CloudTrail** | Log file encryption with CMK; Trail needs key policy for CloudTrail service |
| **AWS Backup** | Backup vault encrypted with CMK |
| **Kinesis / Firehose** | Stream/delivery encryption with CMK |

## DevOps pipeline scenarios
| Scenario | KMS requirement |
| --- | --- |
| CodeBuild writes encrypted artifacts to S3 | CodeBuild role: `kms:GenerateDataKey`; key policy trusts role |
| CodePipeline cross-account artifact bucket | CMK key policy allows consuming account roles |
| Encrypted AMI shared to launch account | Destination account role/user needs `kms:CreateGrant`, `Decrypt`, `DescribeKey` on CMK; **AWS managed EBS key cannot be shared**—use CMK |
| Terraform remote state in encrypted S3 | State bucket SSE-KMS; CI role needs decrypt/encrypt on state key |
| Lambda reads SecureString at runtime | Lambda role: `ssm:GetParameter` + `kms:Decrypt` on parameter CMK |

## Re-encrypting existing data
Changing the CMK on already-encrypted data requires **re-encryption**, not just creating a new key:
- **S3**: copy object to itself with new SSE-KMS key, or batch operations
- **EBS/RDS**: create encrypted copy/snapshot with new key
- **KMS API**: `ReEncrypt` for ciphertext under your control

**Exam tip**: "Rotate to a new CMK for compliance" on existing S3/EBS data → **re-encrypt data**, not only enable automatic key rotation on the old CMK.

## Performance and cost
- Prefer **envelope encryption** and data keys for high-volume crypto—avoid calling `Encrypt`/`Decrypt` on the CMK for every record.
- KMS API has request quotas; use **data key caching** in SDKs where appropriate.
- **`GenerateDataKey`** counts as a KMS request; local AES with the DEK does not.
