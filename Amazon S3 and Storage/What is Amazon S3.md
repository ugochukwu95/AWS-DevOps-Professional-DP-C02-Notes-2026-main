# What is Amazon S3?

Amazon Simple Storage Service (S3) is **object storage** with 11 nines (99.999999999%) of designed durability. Buckets are created in a **Region**; object keys are flat strings (the `/` "folders" are just key prefixes). Single objects can be up to **5 TB**; a single `PUT` is limited to **5 GB**, so larger uploads must use **multipart upload**.

SAP-C03 questions rarely ask "what is S3"—they ask which **storage class**, **lifecycle rule**, or **performance feature** is the most cost-effective or lowest-overhead choice. Learn the minimums and retrieval behaviour below; they are the discriminators.

## Consistency model
- **Strong read-after-write consistency** for all `PUT`, overwrite, and `DELETE` operations, and for `LIST` after a write—no extra cost, all Regions.
- **Bucket configuration** changes (for example enabling versioning, bucket policies) can take a short time to propagate.
- No object locking between concurrent writers—**last writer wins**. Use Object Lock or application-level coordination if you need more.

**Exam tip**: Old answer options that add DynamoDB tables "to track S3 consistency" (EMRFS consistent view, S3Guard) are obsolete distractors.

## Storage classes
| Class | Min storage duration | Min billable object size | Retrieval fee | AZs | Use case |
| --- | --- | --- | --- | --- | --- |
| **S3 Standard** | None | None | None | ≥3 | Frequently accessed data |
| **S3 Intelligent-Tiering** | None | None (objects < 128 KB are not auto-tiered, always billed at Frequent tier) | None (small per-object monitoring fee) | ≥3 | Unknown or changing access patterns |
| **S3 Standard-IA** | 30 days | 128 KB | Per GB | ≥3 | Infrequent access, millisecond retrieval |
| **S3 One Zone-IA** | 30 days | 128 KB | Per GB | 1 | Re-creatable infrequent data, secondary copies |
| **S3 Glacier Instant Retrieval** | 90 days | 128 KB | Per GB (higher than IA) | ≥3 | Accessed about once a quarter, needs milliseconds |
| **S3 Glacier Flexible Retrieval** | 90 days | 40 KB metadata overhead per object | Per GB (Bulk free) | ≥3 | Archives, minutes-to-hours retrieval |
| **S3 Glacier Deep Archive** | 180 days | 40 KB metadata overhead per object | Per GB | ≥3 | Long-term compliance archives, rarely read |
| **S3 Express One Zone** | None | None | None (request pricing includes data size) | 1 (you choose the AZ) | Single-digit ms latency, very high request rates, co-located compute |

- Deleting, overwriting, or transitioning an object before its minimum duration incurs a **pro-rated charge** for the remaining days.
- **Intelligent-Tiering** moves objects automatically: Frequent → Infrequent (30 days no access) → Archive Instant Access (90 days). Optional opt-in **Archive Access** and **Deep Archive Access** tiers behave like Glacier Flexible/Deep Archive (asynchronous restore).
- **Express One Zone** uses **directory buckets** (a different bucket type), session-based auth (`CreateSession`), and is designed for hundreds of thousands of requests per second. It is not part of the lifecycle transition waterfall.

**Exam tip**: "Unpredictable access pattern, minimise cost, no operational overhead" → **Intelligent-Tiering**. "Data can be regenerated" and "infrequent" → **One Zone-IA**. "Must survive AZ loss" rules out One Zone-IA and Express One Zone.

## Glacier retrieval tiers
| Tier | Glacier Flexible Retrieval | Glacier Deep Archive |
| --- | --- | --- |
| **Expedited** | 1–5 minutes (buy **provisioned capacity** to guarantee availability) | Not available |
| **Standard** | 3–5 hours | Within 12 hours |
| **Bulk** | 5–12 hours (free retrieval) | Within 48 hours |

- Glacier Flexible/Deep Archive objects need a **restore** (`RestoreObject`) that creates a temporary copy for N days; Glacier Instant Retrieval objects are read directly.
- Restore completion can trigger an **S3 event notification** (`s3:ObjectRestore:Completed`).

## Lifecycle rules
Lifecycle rules act on a bucket, prefix, tags, or object size filter.

```text
Standard → Intelligent-Tiering / Standard-IA / One Zone-IA → Glacier IR → Glacier Flexible → Deep Archive
(transitions only flow "down"; lifecycle cannot move objects back to Standard)
```

- **Transitions** — objects must be in Standard at least **30 days** before lifecycle moves them to Standard-IA or One Zone-IA.
- By default lifecycle **does not transition objects smaller than 128 KB** (add a size filter to override). Transitioning many tiny objects to Glacier is usually a cost trap—per-request transition fees and per-object overhead.
- **Expiration** — delete current versions after N days (on versioned buckets this adds a delete marker).
- **Noncurrent versions** — transition or expire noncurrent versions after N days, optionally keeping the newest N noncurrent versions.
- **Expired object delete markers** — clean up delete markers with no remaining versions.
- **Abort incomplete multipart uploads** after N days—orphaned parts are billed but invisible in normal listings.

## Versioning
- States: **unversioned** → **enabled** → **suspended** (can never return to unversioned).
- A `DELETE` without a version ID adds a **delete marker**; deleting the marker "undeletes" the object.
- Prerequisite for **replication** and **Object Lock**.
- **MFA Delete** — only the **root user** can enable it (CLI/API); requires MFA to permanently delete versions or change versioning state.

## Performance
- **3,500 `PUT`/`COPY`/`POST`/`DELETE`** and **5,500 `GET`/`HEAD`** requests per second **per partitioned prefix**; no limit on number of prefixes. Spread hot keys across prefixes to scale linearly. S3 scales partitions gradually—sudden spikes can return `503 Slow Down` briefly.
- **Multipart upload** — recommended above ~100 MB, required above 5 GB; parallel parts (up to 10,000), retry single parts.
- **Byte-range fetches** — parallel `GET` of ranges for faster downloads, or read only a header of a large file.
- **Transfer Acceleration** — uploads go to the nearest **CloudFront edge location** then over the AWS backbone; distant clients uploading to one bucket. You pay only when it is faster.
- **SSE-KMS** objects count against **KMS request quotas**—use **S3 Bucket Keys** (see security note) at high request rates.
- **S3 Express One Zone** for the lowest latency, highest-TPS workloads (ML training, analytics scratch) in one AZ.

## S3 Select
SQL `SELECT` filtering of a single CSV/JSON/Parquet object server-side to return a subset. AWS **closed S3 Select to new customers in 2024**—for new designs prefer **Athena** (multi-object SQL) or byte-range reads.

## Event notifications vs EventBridge
| | S3 Event Notifications | Amazon EventBridge |
| --- | --- | --- |
| Destinations | SNS, SQS (standard, not FIFO), Lambda | 20+ target types, multiple rules per event |
| Filtering | Prefix and suffix only | Rich content filtering (metadata, size, key patterns) |
| Extras | Simple, no extra config | Archive and replay, cross-account event buses |
| Setup | Per-bucket notification config | Enable "send to EventBridge" on bucket, then rules |

**Exam tip**: Multiple consumers of the same event, advanced filtering, or replay → **EventBridge** (or SNS fan-out). Overlapping prefixes for the same event type are not allowed in classic notifications.

## Visibility and bulk operations
- **S3 Storage Lens** — organization-wide dashboards of usage and activity across accounts and Regions; free metrics (14-day history) and paid **advanced metrics** (15-month history, prefix-level, recommendations). Use to find buckets without lifecycle rules, incomplete multipart uploads, or unencrypted data.
- **S3 Inventory** — scheduled (daily/weekly) CSV, ORC, or Parquet listing of objects and metadata (encryption, replication status, storage class). Cheaper and faster than `LIST` on billions of objects; query with Athena.
- **S3 Batch Operations** — run one operation on billions of objects from an Inventory report or CSV manifest: copy, invoke Lambda, replace tags/ACLs, restore from Glacier, set Object Lock retention, **Batch Replication**. Managed retries and a completion report.

**Exam tip**: "Encrypt/re-tag/copy all existing objects with least operational overhead" → **S3 Inventory + Batch Operations**, not a custom script listing the bucket.
