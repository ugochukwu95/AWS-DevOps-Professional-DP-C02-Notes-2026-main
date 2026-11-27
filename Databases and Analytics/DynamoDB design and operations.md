# DynamoDB design and operations

Amazon DynamoDB is a serverless **key-value and document** database with single-digit millisecond latency at any scale. Design starts from **access patterns**, not entities—there are no joins, and queries must use a key. Maximum **item size is 400 KB**; store larger objects in S3 and keep a pointer in the item.

## Keys
- **Partition key** (hash): determines the physical partition. Needs **high cardinality** and even access.
- **Partition key + sort key** (composite): items sharing a partition key form an **item collection**, sorted by sort key—enables `Query` with range conditions (`begins_with`, `between`).
- `Query` reads one partition key efficiently; `Scan` reads the whole table (expensive—avoid in hot paths; **parallel scan** only for bulk jobs).

## LSI vs GSI
| | Local secondary index (LSI) | Global secondary index (GSI) |
| --- | --- | --- |
| Keys | **Same partition key**, different sort key | Any partition and sort key |
| When created | **Only at table creation** | Any time |
| Consistency | Strong or eventual | **Eventual only** |
| Capacity | Shares table capacity | **Own** capacity (provisioned mode) |
| Limit | 5 per table | 20 per table (default quota) |
| Size constraint | 10 GB per partition key value (item collection) | None |

**Exam tip**: An under-provisioned GSI **throttles writes to the base table**. "Writes throttled though table has spare WCU" → check GSI capacity.

## Capacity modes
| | On-demand | Provisioned (+ auto scaling) |
| --- | --- | --- |
| Billing | Per request | Per RCU/WCU-hour provisioned |
| Best for | Unknown, spiky, new, or idle-most-of-the-time workloads | Predictable, steady traffic |
| Scaling | Instant, no planning (optional max throughput cap) | Auto scaling via target utilisation; reacts in minutes |
| Discount | None | **Reserved capacity** (1 or 3 years, Standard table class) |

Switching between modes is allowed but rate-limited, so do not design around frequent flips.

## RCU / WCU math
- **1 RCU** = 1 **strongly consistent** read/s of up to **4 KB**, or **2 eventually consistent** reads/s. Transactional read = 2 RCUs.
- **1 WCU** = 1 write/s of up to **1 KB**. Transactional write = 2 WCUs.
- Always **round item size up** to the next 4 KB (reads) or 1 KB (writes).

Worked example: 80 reads/s of 6 KB items and 40 writes/s of 2.5 KB items.
```text
Reads:  6 KB -> 2 units of 4 KB  x 80/s = 160 RCU (strong)
                                         = 80 RCU (eventual, /2)
Writes: 2.5 KB -> 3 units of 1 KB x 40/s = 120 WCU
        transactional writes             = 240 WCU
```

## Hot partitions, write sharding, adaptive capacity
- Each partition supports up to **3,000 RCU and 1,000 WCU** and about **10 GB**.
- A low-cardinality key (e.g. `status`, today's date) concentrates traffic → throttling even when table capacity is fine.
- **Write sharding**: append a random or calculated suffix (`2026-11-24#7`) to spread writes; readers query all suffixes and merge.
- **Adaptive capacity** (automatic): redistributes throughput to hot partitions and can split partitions for hot items. **Burst capacity** retains up to 5 minutes of unused capacity. Neither fixes a single item exceeding per-partition limits.

## DAX vs ElastiCache
| | DAX | ElastiCache |
| --- | --- | --- |
| Works with | DynamoDB only | Any data source |
| Code change | **Minimal**—swap SDK client; same DynamoDB API | Application implements caching logic |
| Latency | Microseconds for cached reads | Sub-millisecond |
| Write behaviour | Write-through | App-defined (lazy loading, write-through) |
| Consistency | Eventually consistent reads cached; strong reads pass through | App-defined |

**Exam tip**: "Read-heavy DynamoDB, microsecond latency, **minimal code changes**" → **DAX**. Caching computed results or aggregates from multiple sources → ElastiCache.

## Change data capture
| | DynamoDB Streams | Kinesis Data Streams for DynamoDB |
| --- | --- | --- |
| Retention | 24 hours | Up to 365 days (KDS setting) |
| Ordering / duplicates | Ordered per item, no duplicates | Ordering not guaranteed, duplicates possible (dedupe with timestamps) |
| Consumers | Lambda, KCL adapter; few concurrent readers per shard | Many consumers, enhanced fan-out, Firehose, Flink |
| Use | Triggers, simple fan-out, global tables | Analytics pipelines, long retention, many consumers |

## TTL
- Set an attribute containing an **epoch-seconds** timestamp; expired items are deleted in the background (typically within a few days, not immediately).
- Deletes **consume no WCU**. Expired-but-not-deleted items can still be read—filter them in queries.
- TTL deletes appear in Streams (as service deletions) → archive to S3 via Lambda/Firehose.

## Transactions
`TransactWriteItems` / `TransactGetItems`: ACID across up to **100 items** in one or more tables in the same account and Region (4 MB aggregate). Cost 2× capacity. Use for "all-or-nothing" business operations (order + inventory decrement); use **conditional writes** for optimistic locking on a single item.

## Backup, restore, and S3 integration
- **PITR**: restore to any second in the recovery window (up to **35 days**) into a **new table**.
- **On-demand backups**: full backups, no performance impact, kept until deleted. Use **AWS Backup** for schedules, cross-Region/cross-account copies, and Vault Lock.
- **Export to S3**: requires PITR; **consumes no RCU**; full or incremental exports (DynamoDB JSON or Ion) → query with Athena.
- **Import from S3**: bulk-load CSV/DynamoDB JSON/Ion into a **new** table without consuming WCU.

## Global tables
- **Multi-active**: read and write in every replica Region; asynchronous replication typically within a second; **last writer wins** conflict resolution.
- A **multi-Region strong consistency** mode is now available for specific Region sets—use only when the question explicitly needs zero RPO across Regions.
- Requires Streams (managed for you). Ideal for global low-latency apps and Region-level DR with near-zero RTO.

## Security and networking
- **Fine-grained access control**: IAM condition `dynamodb:LeadingKeys` restricts users to items whose partition key equals their identity (e.g. `${cognito-identity.amazonaws.com:sub}`); `dynamodb:Attributes` restricts visible attributes.
- Encryption at rest always on (AWS owned, AWS managed, or customer managed KMS key).
- **VPC gateway endpoint**: free, private access from the VPC via route tables. **Interface endpoint** (PrivateLink) when on-premises or other VPCs need private access over DX/VPN.

## Single-table design and table classes
- **Single-table design**: store multiple entity types in one table with generic keys (`PK=CUSTOMER#123`, `SK=ORDER#2026-11-24`) and overloaded GSIs—fetch related items in one `Query`. Efficient but harder to evolve; know the concept, not the details.
- **Standard-IA table class**: much lower storage price, higher per-request price. Choose when **storage dominates cost** (old/rarely accessed data such as order history).

## Common exam scenarios
- **Throttling on one key despite low table utilisation** → hot partition; redesign key or **write sharding**.
- **Users must only access their own items via Cognito** → `dynamodb:LeadingKeys` condition.
- **Analytics on DynamoDB data without affecting production** → **export to S3** + Athena, or **zero-ETL to Redshift/OpenSearch**.
- **Accidentally deleted items yesterday** → **PITR** restore to new table, copy items back.
- **Lambda in private subnet cannot reach DynamoDB, no NAT** → **gateway endpoint**.
- **Session data must expire automatically** → **TTL**.
