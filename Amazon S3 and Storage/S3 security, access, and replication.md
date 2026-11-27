# S3 security, access, and replication

S3 access is evaluated like any IAM decision: an explicit **Deny** anywhere wins, and cross-account access needs an **Allow on both sides** (the caller's IAM policy and the bucket policy). Encryption keys and key policies are covered in the `AWS KMS` notes—this note focuses on S3-specific controls.

## Access control mechanisms
| Mechanism | Attached to | Use for |
| --- | --- | --- |
| **IAM policy** | User, role, group | Same-account access; caller side of cross-account access |
| **Bucket policy** | Bucket (resource policy) | Cross-account access, enforce TLS/encryption, restrict by VPC endpoint or org |
| **ACLs** | Bucket / object | Legacy—avoid; disabled by default on new buckets |
| **Access point policy** | Access point | Per-application or per-team access to a shared bucket |
| **VPC endpoint policy** | Gateway/interface endpoint | Limit which buckets can be reached from a VPC |
| **SCP / RCP** | AWS Organizations | Guardrails across accounts |

- **Object Ownership – Bucket owner enforced** (default for new buckets) disables ACLs; the bucket owner owns every object, even those uploaded by other accounts. Fixes the classic "cross-account upload, bucket owner cannot read the object" problem.
- Other settings: **Bucket owner preferred** (owner takes ownership if uploader sets `bucket-owner-full-control`) and **Object writer** (legacy).
- **Block Public Access** — four settings at **account** and **bucket** level, on by default for new buckets. The account-level setting overrides any bucket policy or ACL that grants public access.

**Exam tip**: "Ensure no bucket in any account can ever become public" → account-level Block Public Access, enforced with an **SCP** denying `s3:PutAccountPublicAccessBlock` changes.

## Useful bucket policy conditions
| Condition | Purpose |
| --- | --- |
| `aws:SecureTransport` = false → Deny | Enforce HTTPS |
| `s3:x-amz-server-side-encryption` | Require a specific encryption type on upload |
| `aws:SourceVpce` | Allow only via a specific VPC endpoint |
| `aws:SourceVpc` | Allow only from a specific VPC (through an endpoint) |
| `aws:PrincipalOrgID` | Allow any principal in your AWS Organization—no account list maintenance |
| `aws:ResourceOrgID` (in endpoint policy) | Allow VPC access only to buckets owned by your org (data-exfiltration guard) |
| `aws:SourceIp` | Public IP ranges—does **not** work for traffic through VPC endpoints (private IPs) |

## Encryption options
| Option | Key managed by | Notes |
| --- | --- | --- |
| **SSE-S3** | S3 (AES-256) | Default for all new objects; no cost, no key control |
| **SSE-KMS** | KMS (AWS managed or customer managed key) | Audit in CloudTrail, key policy control; subject to KMS request quotas and cost |
| **DSSE-KMS** | KMS | Dual-layer server-side encryption for compliance that mandates two independent layers |
| **SSE-C** | Customer supplies key on every request | HTTPS required; S3 does not store the key; you manage key loss risk |
| **Client-side** | Customer (optionally KMS) | Data encrypted before it leaves the client; S3 never sees plaintext |

- **S3 Bucket Keys** — S3 generates a short-lived bucket-level data key from KMS, cutting KMS requests (and cost) by up to **99%**. Enable for high-volume SSE-KMS buckets or when hitting KMS throttling.
- Changing default encryption affects **new objects only**—re-encrypt existing objects with **Batch Operations** copy.

**Exam tip**: "SSE-KMS bucket, high request rate, KMS `ThrottlingException`/high KMS bill" → **S3 Bucket Keys**. "Encryption keys must never be stored in AWS" → **SSE-C** or client-side.

## Presigned URLs
- Grant time-limited access to one object (`GET` or `PUT`) using the **signer's permissions**—if the signer loses access, the URL stops working.
- Max **7 days** with IAM user long-term credentials (SigV4); URLs signed with temporary credentials expire when the session expires.
- Typical pattern: app backend generates presigned `PUT` so browsers upload directly to S3 without proxying data.

## Access points and Multi-Region Access Points
- **Access points** — named endpoints with their own policy, mapped to one bucket. Delegate access control from one huge bucket policy to per-application access points.
- **VPC-only access points** — network origin set to a VPC; requests from anywhere else are rejected.
- **Multi-Region Access Points (MRAP)** — one global endpoint over buckets in multiple Regions; routes requests over the AWS global network to the lowest-latency bucket. Pair with **bidirectional CRR** to keep data in sync; **failover controls** support active-passive routing.
- **S3 Object Lambda** — Lambda transforms data on `GET` (redact PII, resize images, convert formats) via an Object Lambda access point. AWS has announced it is closing to new customers—treat as legacy for new designs.

## VPC endpoints for S3
| | Gateway endpoint | Interface endpoint (PrivateLink) |
| --- | --- | --- |
| Cost | **Free** | Hourly per AZ + per GB |
| How | Route table entry (prefix list) | ENI with private IPs in your subnets |
| Reachable from on-premises (DX/VPN) | No | **Yes** |
| Reachable from peered VPC / Transit Gateway | No | Yes |
| DNS | Public S3 DNS names | Endpoint-specific or private DNS names |

**Exam tip**: EC2 in a private subnet → **gateway endpoint** (cheapest, removes NAT gateway data charges). On-premises over Direct Connect to S3 privately → **interface endpoint** (or public VIF).

## Object Lock and Glacier Vault Lock
**Object Lock** gives WORM protection per object version; requires **versioning**.

| | Governance mode | Compliance mode | Legal hold |
| --- | --- | --- | --- |
| Can be removed early | Yes, with `s3:BypassGovernanceRetention` | **No one**, including root | Yes, with `s3:PutObjectLegalHold` |
| Expiry | Retention period | Retention period (can extend, not shorten) | No expiry—until removed |
| Use | Protect against most users, allow admin override, test settings | Regulatory WORM (for example SEC 17a-4) | Litigation, investigation |

- A bucket-level **default retention** applies to new objects automatically.
- **Glacier Vault Lock** applies to legacy Glacier **vaults** (not S3 buckets): initiate a lock policy, test for **24 hours**, then complete—the policy becomes immutable.

## Replication
| | Cross-Region Replication (CRR) | Same-Region Replication (SRR) |
| --- | --- | --- |
| Use | DR, latency, compliance copies in another Region | Log aggregation, prod → test copies, account separation |

- Requires **versioning on source and destination** and an IAM role for S3. Works across accounts (optionally change replica owner to destination account).
- Replicates **new objects only** after the rule is enabled—use **S3 Batch Replication** for existing objects or previously failed replications.
- **Delete markers** replication is optional; **permanent deletes of versions are never replicated** (protects against malicious deletes).
- **No chaining**: A → B → C does not copy A's objects to C; configure A → C directly.
- Can replicate into a different **storage class** (for example Glacier Deep Archive in the DR Region).
- SSE-KMS objects must be explicitly opted in and the role needs KMS permissions in both Regions (or use multi-Region keys).
- **Replication Time Control (RTC)** — SLA-backed **99.99% of objects within 15 minutes**, plus replication metrics and events. Choose when a question states a replication time RPO.

## Requester Pays and CloudFront OAC
- **Requester Pays** — requester pays request and data transfer costs; bucket owner pays storage. Requesters must be authenticated and send `x-amz-request-payer`.
- **CloudFront Origin Access Control (OAC)** — replaces legacy OAI. Bucket stays private; bucket policy allows `cloudfront.amazonaws.com` with `AWS:SourceArn` of the distribution. Supports SSE-KMS and all Regions. OAC works with the S3 **REST** endpoint, not the static website endpoint.

## Choose the right approach
| Requirement | Answer |
| --- | --- |
| Allow all accounts in the org to read a bucket | Bucket policy with `aws:PrincipalOrgID` |
| Bucket reachable only from one VPC | Bucket policy deny unless `aws:SourceVpce` / VPC-only access point |
| Cross-account uploads readable by bucket owner | Object Ownership **bucket owner enforced** |
| WORM retention nobody can bypass | Object Lock **compliance mode** |
| Hold objects indefinitely for litigation | **Legal hold** |
| Replicate with 15-minute guarantee | CRR with **RTC** |
| Copy objects that existed before replication | **Batch Replication** |
| Private S3 content via CloudFront | **OAC** + bucket policy |
| Partners download big datasets at their cost | **Requester Pays** |
| Single global endpoint, active-active buckets | **Multi-Region Access Point** + bidirectional CRR |
