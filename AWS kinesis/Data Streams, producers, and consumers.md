# Kinesis Data Streams — producers and consumers

## What Data Streams provides
A **durable, ordered, replayable** stream divided into **shards**. Producers write records; consumers read and process them at their own pace (within retention limits).

Use when you need:
- Custom processing logic
- Multiple consumers on the same data
- Replay of recent data after failure
- Ordering guarantees **within a partition key**

## Shards and throughput
Each shard supports fixed write/read limits (exam-level numbers):
- **Write**: up to **1 MB/s** or **1,000 records/s** per shard
- **Read**: up to **2 MB/s** per shard (shared across classic consumers)

| Mode | How capacity works |
| --- | --- |
| **Provisioned** | You set shard count; split/merge/scale manually or with auto scaling |
| **On-demand** | AWS scales automatically; pay for throughput consumed |

**Hot shard problem**: Skewed **partition keys** overload one shard while others are idle. Fix with better key distribution (e.g. add random suffix), more shards, or on-demand mode.

## Partition keys and ordering
- Every record includes a **partition key**.
- Same partition key → same shard → **strict order** within that key.
- Different keys may land on different shards and process in parallel.

**Exam tip**: "Preserve order for each user session" → use **user/session ID as partition key**. "Maximize parallelism" → use high-cardinality keys.

## Retention
- Default: **24 hours**
- Extended: up to **365 days** (additional cost)
- Consumers can re-read data within the retention window after failures or redeployments

Firehose retention is different — it buffers and delivers; it is not a replayable analytics stream in the same sense.

## Producers
| Producer | Notes |
| --- | --- |
| **AWS SDK `PutRecord` / `PutRecords`** | Basic API; batch with `PutRecords` for efficiency |
| **Kinesis Producer Library (KPL)** | Batching, aggregation, retry logic for high throughput |
| **Amazon Kinesis Agent** | Ship log files from EC2 to Data Streams |
| **CloudWatch Logs subscription filter** | Stream matching log events to Data Streams |
| **AWS IoT, API Gateway, other services** | Various integration patterns |

Producer best practices:
- Handle **ProvisionedThroughputExceededException** with backoff and retry.
- Use **`PutRecords`** for batch efficiency.
- Choose partition keys to avoid hot shards.

## Consumers

### Shared throughput (classic) consumer
- Each shard's **2 MB/s read throughput is shared** across all consumers reading that shard.
- Adding more consumers reduces per-consumer share.

### Enhanced fan-out (EFO)
- Each consumer gets **2 MB/s per shard dedicated** pipeline via a **consumer registration**.
- Lower latency (~70 ms vs ~200 ms typical).
- Extra cost per consumer-shard pair.

**Exam tip**: "Many independent teams/apps consume the same stream at full speed" → **enhanced fan-out**.

### Common consumer types
| Consumer | Pattern |
| --- | --- |
| **AWS Lambda** (event source mapping) | Polls stream; invokes function with batch of records |
| **Kinesis Client Library (KCL)** | Managed checkpoints, load balancing across workers |
| **Custom app with SDK** | Manual shard iteration and checkpointing |
| **Firehose** | Can use Data Streams as a **source** for managed delivery elsewhere |
| **Managed Flink** | Stateful stream processing |

## Lambda as a Data Streams consumer
Event source mapping settings (exam-relevant):
| Setting | Purpose |
| --- | --- |
| **Batch size** | Records per invocation |
| **Batch window** | Wait up to N seconds to fill a batch |
| **Parallelization factor** | Up to **10** concurrent batches **per shard** |
| **Bisect batch on error** | Split failing batch to isolate bad records |
| **On-failure destination** | Send failed batches to S3/SQS/SNS |
| **Maximum retry attempts** | Limit retries before on-failure routing |
| **Starting position** | `LATEST` (new only) or `TRIM_HORIZON` / timestamp (replay) |

Lambda polls on your behalf — you do not write polling code.

**IteratorAge** (CloudWatch metric): time lag between record arrival and processing. High iterator age → consumer cannot keep up → add shards, optimize Lambda, or increase parallelism.

## Checkpointing and failure handling
Consumers track a **checkpoint** (sequence number) per shard:
- On success, advance checkpoint.
- On failure, replay from last checkpoint within retention.
- KCL and Lambda event source mappings handle this automatically.

Without checkpointing, restarts may reprocess or skip data incorrectly.

## Scaling Data Streams
| Signal | Action |
| --- | --- |
| **`WriteProvisionedThroughputExceeded`** | Add shards, fix hot keys, or use on-demand |
| **High IteratorAge / consumer lag** | Scale consumers, add shards, tune batch size, use EFO |
| **Underutilized shards** | Merge shards (provisioned mode) |

Auto Scaling (provisioned mode) can adjust shard count based on throughput metrics.

## Data Streams vs MSK / Kafka (exam distractor)
| | **Kinesis Data Streams** | **Amazon MSK** |
| --- | --- | --- |
| API | Kinesis API | Kafka API |
| Ecosystem | AWS-native integrations | Kafka clients, Connect, ecosystem |
| Exam default for CloudWatch → S3/Lambda | **Often Kinesis/Firehose** | When question says "existing Kafka clients" |

## Data Streams exam scenarios
| Scenario | Answer |
| --- | --- |
| Custom app processes clickstream in real time | **Data Streams** + KCL/custom consumer |
| Lambda processes stream events | **Data Streams** + event source mapping |
| Replay last 24 h after bug fix | **Data Streams** retention + reset checkpoint/`TRIM_HORIZON` |
| Many consumers need full shard throughput each | **Enhanced fan-out** |
| Order preserved per customer | **Partition key = customer ID** |
| Hot shard from same partition key | Redesign keys or reshard |
| Deliver logs to S3 with least management | **Firehose**, not raw Data Streams alone |
