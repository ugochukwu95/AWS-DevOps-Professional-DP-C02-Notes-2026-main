# Multi-Region keys, rotation, and exam scenarios

## Automatic key rotation (symmetric CMK)
- Enable on a **customer managed symmetric key**—KMS rotates **backing key material** annually.
- **Same key ID and ARN**—applications and aliases do not change.
- Old backing material is retained so data encrypted before rotation still decrypts.
- Does **not** re-encrypt existing ciphertext automatically.

| Key type | Automatic rotation |
| --- | --- |
| Customer managed symmetric CMK | Supported (opt-in) |
| AWS managed key | AWS rotates automatically |
| Asymmetric CMK | Manual rotation only |
| Imported key material | Manual rotation only—import new material |

**Manual rotation**: create a new CMK, re-encrypt data, update aliases/apps to new key, retire old key.

## Multi-Region keys (MRK)
One logical key with the **same key ID** replicated across Regions you choose.

```text
Primary MRK (us-east-1)  ←→  Replica MRK (eu-west-1)
Same Key ID, same key material, independent replica policies
```

Use cases:
- Disaster recovery—decrypt in DR Region without re-architecting key IDs
- Global apps encrypting/decrypting locally in each Region
- Reduce cross-Region KMS latency

Rules:
- Create a **primary** multi-Region key, then add **replicas** in other Regions.
- Replicas have their own key policy (can differ per Region).
- **Cannot** convert an existing single-Region key to MRK—you create MRK from the start.
- Deleting primary affects replicas—understand waiting period and replica deletion states.

**Exam tip**: "Encrypted data must be decryptable in us-east-1 and eu-west-1 with the same key identifier" → **multi-Region key** with replica.

## Imported key material (BYOK)
- You generate and import key material into a CMK.
- You are responsible for **manual rotation** and secure storage of source material.
- Can delete imported material while retaining the CMK shell (key becomes unusable).
- Useful for regulatory requirements to control key generation outside AWS.

## Custom key store (CloudHSM)
- CMK backed by keys in **your** CloudHSM cluster—not AWS shared infrastructure.
- FIPS 140-2 **Level 3** validation on CloudHSM.
- Higher availability and ops burden—you manage HSM cluster capacity and patching.
- Choose when compliance mandates dedicated HSM, not for routine S3/EBS encryption.

## KMS vs CloudHSM quick comparison
| | KMS (standard) | CloudHSM / custom key store |
| --- | --- | --- |
| Tenancy | AWS managed multi-tenant | Dedicated HSM |
| FIPS level | Level 2 (some Level 3 claims for KMS HSMs) | Level 3 |
| Integration | Native to all AWS services | Via KMS custom key store or direct HSM APIs |
| Ops overhead | Low | High |

## Choose the right approach
| Requirement | Answer |
| --- | --- |
| Encrypt S3 bucket with key you control and audit | SSE-KMS with **CMK** |
| Simplest S3 encryption, no key management | SSE-S3 |
| Cross-account read of encrypted S3 objects | CMK key policy + consumer IAM + bucket policy |
| Share encrypted AMI to another account | **Customer managed CMK** (not AWS managed `aws/ebs`) |
| DR decrypt in second Region, same key ID | **Multi-Region key** + replica |
| Annual rotation without app changes | Enable **automatic rotation** on symmetric CMK |
| Compliance requires keys in your HSM | **CloudHSM** custom key store |
| Store API key with automatic rotation | **Secrets Manager** + CMK |
| Store config password encrypted | **Parameter Store SecureString** + CMK |
| Audit every decrypt operation | **CloudTrail** on KMS API |
| Restrict decrypt to specific S3 bucket | Key policy + **`kms:EncryptionContext`** or `kms:ViaService` |
| Lambda cannot read encrypted env var | Add `kms:Decrypt` to Lambda role **and** key policy allow |

## Common exam scenarios
- **Build succeeds but encrypted AMI copy fails** → destination CMK key policy missing Image Builder/distribution role or destination account.
- **Lambda reads KMS-encrypted S3 object—access denied** → missing `kms:Decrypt` on role or key policy does not trust Lambda role.
- **Enable encryption on existing unencrypted EBS volume** → create encrypted snapshot/copy; cannot toggle encryption in place on attached volume without migration.
- **Org requires all RDS instances encrypted** → Config rule + default CMK; new instances use CMK at creation.
- **Prevent key deletion** → IAM deny on `kms:ScheduleKeyDeletion`; use key aliases for operational stability.
- **Compliance wants key usage limited to EC2 in us-east-1** → key policy condition `kms:ViaService`: `ec2.us-east-1.amazonaws.com`.
- **Developer needs encrypt-only, not decrypt** → IAM allow `kms:Encrypt`, `kms:GenerateDataKey`; deny `kms:Decrypt`.
- **Rotate compromised CMK for new data only** → enable rotation or new CMK for new encrypts; old data still uses old backing material until re-encrypted.

## Key deletion workflow
1. `ScheduleKeyDeletion` — waiting period **7–30 days**
2. During waiting period: `CancelKeyDeletion` to restore
3. After period: key and all aliases deleted permanently; **all data encrypted under that key is unrecoverable**

**Exam tip**: Never schedule deletion on a CMK still protecting production data unless data was re-encrypted with a new key.
