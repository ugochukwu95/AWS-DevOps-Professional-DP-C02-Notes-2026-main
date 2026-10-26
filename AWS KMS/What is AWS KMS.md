# What is AWS KMS?

AWS Key Management Service (KMS) creates and controls **encryption keys** used to protect AWS data and your applications. KMS is a **regional** service—keys exist in one Region unless you use **multi-Region keys (MRK)**.

KMS is for **cryptographic keys**, not application secrets. Store database passwords in **Secrets Manager** or **Parameter Store `SecureString`**—both use KMS under the hood to encrypt the secret value.

## Key types
| Type | Alias prefix | Who manages | Typical use |
| --- | --- | --- | --- |
| **AWS owned key** | `aws/*` | AWS | Default encryption for many services; free; not visible in your account |
| **AWS managed key** | `aws/<service>` | AWS | Service-specific key in your account (for example `aws/s3`, `aws/ebs`) |
| **Customer managed key (CMK)** | Your alias | You | Full control—policies, rotation, grants, cross-account sharing |
| **Key in custom key store** | CMK backed by CloudHSM | You (HSM cluster) | FIPS 140-2 Level 3 or keys must live in dedicated HSM |

**Exam tip**: Choose a **customer managed key** when the question needs cross-account access, key policy control, automatic rotation you manage, or organizational separation. **AWS managed keys** cannot be shared cross-account the same way and offer less control.

## Symmetric vs asymmetric keys
| | Symmetric CMK | Asymmetric CMK |
| --- | --- | --- |
| Operations | `Encrypt`, `Decrypt`, `GenerateDataKey`, `ReEncrypt` | `Sign`/`Verify` or `Encrypt`/`Decrypt` with key pair |
| Used by | S3, EBS, RDS, most AWS service encryption | TLS certs, code signing, token verification |
| Automatic rotation | Supported (annual) | Not supported for automatic rotation |

Most DP-C02 scenarios involve **symmetric CMKs** and **envelope encryption**.

## Key identifiers
- **Key ID** — unique within the account and Region
- **ARN** — full resource identifier for policies
- **Alias** — friendly pointer (for example `alias/prod-app-data`); rotate underlying key without changing alias references

## Key states
| State | Meaning |
| --- | --- |
| Enabled | Key can be used |
| Disabled | Key cannot be used for new crypto operations |
| Pending deletion | Scheduled for deletion after waiting period (7–30 days) |
| Pending import | Waiting for imported key material |
| Pending replica deletion | MRK replica scheduled for deletion |

Deleted keys cannot be recovered. Data encrypted under them becomes undecryptable unless you retained a backup of key material (imported keys only).

## KMS vs related services
| Requirement | Service |
| --- | --- |
| Create/manage encryption keys | **KMS** |
| Store and rotate database credentials | **Secrets Manager** (encrypted with KMS) |
| Store config values encrypted at rest | **SSM Parameter Store `SecureString`** (encrypted with KMS) |
| Dedicated HSM, single-tenant, FIPS Level 3 | **CloudHSM** (optionally exposed to KMS as custom key store) |
| Detect PII in S3 | **Macie** (not KMS) |
| Audit who used a key | **CloudTrail** logs all KMS API calls |

**Exam tip**: KMS **does not rotate secrets**—it rotates **key backing material**. Secret rotation is Secrets Manager.
