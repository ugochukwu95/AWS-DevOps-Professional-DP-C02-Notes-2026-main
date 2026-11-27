# Event-driven and workflow architectures

SAP-C03 skills 1.1.1–1.1.5 and 3.1.2.

SAP-C03 rarely asks "what is SQS?"—the service basics are in the **AWS SQS**, **AWS SNS**, **AWS EventBridge**, **AWS kinesis**, **Step Functions** and **AWS SAM and Lambda** folders. Instead, questions give you a business requirement (strict ordering, no duplicate charges, fan-out across accounts, run for days, lowest cost) and expect you to pick the **messaging guarantee** and **orchestration engine** that just meets it. Assume **at-least-once delivery everywhere** and design consumers to be idempotent.

## Messaging guarantees
| Service | Ordering | Delivery | Deduplication | Scaling unit |
| --- | --- | --- | --- | --- |
| **SQS standard** | Best effort | At-least-once | None—consumer must dedupe | Near-unlimited throughput |
| **SQS FIFO** | Strict per **MessageGroupId** | Exactly-once processing | 5-minute window (`MessageDeduplicationId` or content-based) | Throughput per queue; high-throughput mode spreads across groups |
| **SNS standard** | None | At-least-once fan-out | None | Many subscriber types (SQS, Lambda, HTTP, email) |
| **SNS FIFO** | Strict per message group | Exactly-once to SQS subscribers | 5-minute window | Fan-out to SQS queues only |
| **EventBridge** | None | At-least-once, retries with backoff (default up to 24 hours), target DLQ | None | Content-based rules, many targets; archive and replay |
| **Kinesis Data Streams** | Strict per **shard** (partition key hashes to shard) | At-least-once (producer retries can duplicate) | None—embed a unique record ID | Shards (provisioned or on-demand) |
| **MSK (Kafka)** | Strict per **partition** (key → partition) | At-least-once by default; idempotent producer/transactions inside Kafka | Kafka idempotent producer | Partitions/brokers |

- Ordering is always **scoped to a key** (message group, shard, partition)—never global at scale. Choose a key with **high cardinality** (orderId, customerId) so one hot key does not cap throughput.
- **SQS FIFO + SNS FIFO** = ordered fan-out. **EventBridge** = routing and filtering but **no ordering**.
- Kinesis/MSK allow **replay** by multiple independent consumers; SQS deletes on consume.

**Exam tip**: "Process each customer's transactions in order, scale across customers" → SQS FIFO with `MessageGroupId = customerId` (or Kinesis partition key = customerId). "Global ordering" is a trap—it means one group/shard and a throughput ceiling.

## Idempotency design
Exactly-once delivery end to end is not offered by any service once a consumer has side effects, so make the **operation** idempotent:

- **Idempotency key**: client or producer generates a unique ID (order ID, request UUID, `Idempotency-Key` header); every retry carries the same key.
- **DynamoDB conditional write**: `PutItem` with `attribute_not_exists(pk)` on the idempotency key—the second attempt fails the condition and is skipped. Use a **TTL** to expire old keys.
- **Powertools for AWS Lambda idempotency utility**: decorator that hashes the payload (or a JMESPath-selected key), stores status (`INPROGRESS`/`COMPLETED`) and the cached response in DynamoDB, returns the stored result on replay.
- **Natural idempotency**: `PUT` overwrites, upserts, setting absolute values rather than incrementing.
- **Step Functions Standard** start with the same execution name is idempotent while the execution exists.

## Stateless compute with externalized state
| State type | Store | Why |
| --- | --- | --- |
| Session/user state, idempotency keys, workflow status | **DynamoDB** (TTL, conditional writes, global tables) | Durable, serverless, multi-Region |
| Hot cache, rate counters, leaderboards, session cache | **ElastiCache** (Valkey/Redis OSS) or **MemoryDB** for durable in-memory | Sub-millisecond; see **Amazon ElastiCache** folder |
| Large payloads, files, checkpoints | **S3** (claim-check pattern: put object, pass S3 key in message) | Messages have size limits; S3 is cheap and durable |

- Stateless instances/tasks/functions can be **replaced or scaled at any time** (Auto Scaling, Spot, Fargate Spot) without sticky sessions.
- Avoid local disk and in-memory sessions; avoid ALB stickiness as a design crutch.

## Cross-account and cross-Region event routing
```text
Workload accounts (rules) --PutEvents--> Central bus (Ops/Security account, us-east-1)
                                              |-- rule --> SQS / Lambda / Step Functions
                                              |-- rule --> event bus in eu-west-1 (DR / data residency copy)
```
- **Bus-to-bus**: target a bus in another account/Region by ARN; the **receiving bus resource policy** allows the sender account or `aws:PrincipalOrgID`. New cross-account bus targets require an **IAM role** on the rule.
- **Direct cross-account targets** (2025): a rule can deliver straight to SQS, Lambda, Kinesis Data Streams, SNS or API Gateway in another account if the target's resource policy allows it—no intermediate bus needed.
- **One hop only**: events received from another account are not forwarded again to a third account by a rule; design hub-and-spoke, not chains.
- Sending account pays for cross-account events; use **archive and replay** for recovery, and **global endpoints** for Regional failover of ingestion.

## Serverless data pipeline
```text
Producers --> Kinesis Data Streams --> Lambda (enrich/validate) --> Firehose --> S3 (Parquet, partitioned)
                     \--> Firehose (direct, transform via Lambda) --/          |
                                                              Glue crawler / Data Catalog --> Athena
```
- **KDS** for ordered, replayable, multi-consumer ingest; **Firehose** for zero-admin buffered delivery and format conversion to Parquet/ORC.
- **Glue** catalogs and ETLs; **Athena** queries in place (pay per data scanned—partition and use columnar formats to cut cost).
- Lambda on KDS: tune batch size/window, **parallelization factor**, **bisect batch on error**, on-failure destination to stop a poison record blocking a shard.

## Durable execution: Standard vs Express vs Lambda durable functions
| | Step Functions **Standard** | Step Functions **Express** | **Lambda durable functions** |
| --- | --- | --- | --- |
| Max duration | Up to 1 year | 5 minutes | Up to 1 year (async invoke; sync invoke up to 30 min) |
| Semantics | **Exactly-once** per step | Async: at-least-once; Sync: at-most-once | Checkpoint and **replay**; completed steps are skipped |
| Definition | Amazon States Language / visual designer | Same | Ordinary code with the durable execution SDK (steps, waits, callbacks) |
| Pricing | Per **state transition** | Per execution + duration + memory | Lambda compute + per durable operation + data written/retained; **waits not billed for compute** |
| History | 90 days in console/API | CloudWatch Logs only | Durable execution APIs, configurable retention |
| Callbacks / `.sync` | Supported (task token, job-run) | **Not supported** | `waitForCallback` with callback ID |
| Best for | Long-running, auditable, non-idempotent business processes, human approval, 220+ service integrations | High-volume, short, idempotent event processing | Lambda-centric app logic, sagas and AI workflows written as code |

- Durable functions must be enabled **when the function is created**; code must be **deterministic** because it replays from the start.
- Hybrid is common: Step Functions coordinates cross-service processes, durable functions hold application logic.

**Exam tip**: Express is far cheaper for **millions of short executions**; Standard is cheaper and required for **long waits** (you pay per transition, not for wall-clock time). A workflow that waits days for approval in Express is impossible (5-minute cap).

## Choose the right approach
| Requirement | Answer |
| --- | --- |
| Ordered processing per entity, decoupled | **SQS FIFO** with MessageGroupId |
| Ordered fan-out to several consumers | **SNS FIFO → SQS FIFO** queues |
| Route events by content to many targets/accounts | **EventBridge** rules (bus-to-bus or direct cross-account target) |
| Replayable high-throughput stream, multiple consumers | **Kinesis Data Streams** (or MSK for Kafka compatibility) |
| Prevent double charge on retry | Idempotency key + **DynamoDB conditional write** / Powertools |
| Payload larger than message limit | **Claim-check** via S3 |
| Order workflow with human approval over days | **Step Functions Standard** (task token) or durable function `waitForCallback` |
| 100k short transformations/second, lowest cost | **Step Functions Express** |
| Developers want workflow logic in code inside Lambda | **Lambda durable functions** |

## Common exam scenarios
- **Duplicate orders appear after consumer timeouts on SQS standard** → visibility timeout shorter than processing, plus no idempotency; raise visibility timeout and add a DynamoDB idempotency table.
- **One slow partition key stalls a Kinesis consumer** → poison record; enable bisect-on-error, max retry attempts and an on-failure destination.
- **Central operations account must react to custom application events from every account and Region** → per-Region rules forwarding to a central bus whose resource policy allows `aws:PrincipalOrgID`.
- **Express workflow fails with "unsupported integration" for an EMR `.sync` job** → Express does not support job-run or callback patterns; use Standard.
