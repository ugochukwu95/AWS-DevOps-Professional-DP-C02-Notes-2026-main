# What is Amazon Kinesis?

Amazon Kinesis is a family of services for **ingesting, processing, and analyzing real-time streaming data** at scale. Common sources include application logs, clickstreams, IoT telemetry, metrics, and security events.

Kinesis answers: **"How do we capture high-volume streaming data and route it to processing or storage with low latency?"**

## Kinesis product family
| Service | Purpose | You manage |
| --- | --- | --- |
| **Kinesis Data Streams** | Durable, real-time data stream with custom consumers | Shards/capacity, consumer apps |
| **Kinesis Data Firehose** | Fully managed delivery stream to AWS/partner destinations | Destination config, optional transforms |
| **Managed Service for Apache Flink** (formerly Kinesis Data Analytics) | Real-time stream processing with SQL/Flink | Flink application logic |
| **Kinesis Video Streams** | Ingest/store/play back video | Video pipelines (rare on DevOps exam) |

**Exam tip**: Most DevOps CO2 questions focus on **Data Streams** vs **Data Firehose** and integrations with **CloudWatch**, **Lambda**, and **S3**.

## Data Streams vs Firehose — core distinction
| Requirement | Use |
| --- | --- |
| Build custom real-time processing with your own consumers | **Kinesis Data Streams** |
| Near-real-time delivery to S3, OpenSearch, Redshift, Splunk, HTTP | **Kinesis Data Firehose** |
| Multiple independent consumers at scale on same stream | **Data Streams** (+ enhanced fan-out if needed) |
| Minimal operational overhead for ingest → storage | **Data Firehose** |
| Strict ordering per key with replayable retention | **Data Streams** |
| Transform/enrich records with Lambda before delivery | **Either** — Firehose has built-in Lambda transform; Streams consumers can invoke Lambda |

```text
Producers                         Consumers / destinations
─────────                         ────────────────────────
Apps, agents, IoT                 Custom apps (KCL/Kafka API)
CloudWatch subscription filter    Lambda (event source mapping)
API Gateway                       Firehose → S3 / OpenSearch / etc.
Kinesis Agent                     Managed Flink analytics
PutRecords API
        ↓
Kinesis Data Streams  ──optional──→  Firehose (can use stream as source)
```

## Kinesis vs related services
| Requirement | Service |
| --- | --- |
| Real-time streaming with replay and custom consumers | **Kinesis Data Streams** |
| Managed streaming delivery to S3/OpenSearch | **Kinesis Data Firehose** |
| Decouple services with pull-based workers | **SQS** |
| Pub/sub fan-out to many subscribers (push) | **SNS** |
| Route events by pattern to targets | **EventBridge** |
| Batch ETL on stored data | **AWS Glue** |
| SQL on data already in S3 | **Athena** |

**Exam traps**:
- **SQS** is message queuing, not a streaming replay platform.
- **EventBridge** is event routing, not high-throughput log/metrics ingestion.
- **Firehose** is not for arbitrary long-running custom consumption — use **Data Streams** for that.

## Common DevOps integration points
| Source | Typical Kinesis path |
| --- | --- |
| **CloudWatch Logs subscription filter** | → Data Streams, Lambda, or **Firehose → S3** |
| **CloudWatch Metric Streams** | → **Firehose** → S3 or third-party observability |
| **AWS WAF logs** | → **Firehose** delivery stream |
| **Application telemetry** | → Data Streams → Lambda / Flink |
| **Cross-service analytics archive** | → Firehose → S3 (Parquet conversion optional) |

## Capacity and cost awareness (exam level)
| Service | Billing drivers |
| --- | --- |
| **Data Streams** | Shard hours, PUT payload units, extended retention, enhanced fan-out |
| **Firehose** | Data ingested, optional format conversion, destinations (S3, etc.) |
| **Managed Flink** | KPU hours, running application time |

Firehose is often the **lower-ops** answer when the goal is **archive or forward**, not custom stream processing.

## Encryption and security
- Encrypt at rest with **AWS managed KMS** or **customer managed CMK**.
- In-transit uses TLS for producers and consumers.
- IAM policies control `kinesis:*`, `firehose:*`, and cross-service access (S3 bucket policies for Firehose delivery, etc.).
- Firehose needs permission to write to the destination (S3, OpenSearch, Lambda transform, etc.).

## High-level architecture patterns

### Pattern 1 — Real-time processing
```text
Producers → Data Streams → Lambda / Flink → DynamoDB, SNS, custom action
```

### Pattern 2 — Continuous archive (common exam answer)
```text
CloudWatch Logs → subscription filter → Firehose → S3
                                              ↓
                                    optional Lambda transform
                                              ↓
                                    optional Parquet + partitioning
```

### Pattern 3 — Metrics to third party
```text
CloudWatch Metric Streams → Firehose → HTTP endpoint (Datadog/Splunk) or S3
```

## Terminology
| Term | Meaning |
| --- | --- |
| **Stream** | Data Streams resource that holds records |
| **Shard** | Unit of throughput and ordering in Data Streams |
| **Partition key** | Routes record to a shard; ordering is per key |
| **Delivery stream** | Firehose resource that delivers to a destination |
| **Record** | Data blob (up to 1 MB per Firehose record; 1 MB per Data Streams record) |
| **Retention** | How long Data Streams keeps data (default 24 h; up to 365 days) |
| **Iterator / checkpoint** | Consumer position in a shard |

## When Kinesis appears on DevOps CO2
Expect scenario questions about:
- Streaming logs/metrics to **S3** with minimal management
- **Lambda** triggered from a stream
- **CloudWatch** export vs subscription vs metric streams
- Choosing **Firehose** vs **Data Streams**
- Buffering, compression, and failure handling for delivery
- Consumer lag and scaling shards

See `Data Streams, producers, and consumers.md` and `Firehose, integrations, and exam scenarios.md` for details.
