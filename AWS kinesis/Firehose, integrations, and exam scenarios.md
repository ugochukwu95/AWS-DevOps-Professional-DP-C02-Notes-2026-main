# Kinesis Data Firehose, integrations, and exam scenarios

## What Firehose provides
**Fully managed** ingestion and delivery — you do not manage shards or consumer applications. Firehose **buffers**, optionally **transforms**, and **delivers** records to a destination.

```text
Producers / sources
        ↓
Firehose delivery stream (buffer + optional Lambda transform)
        ↓
Destination: S3 | Amazon OpenSearch | Redshift | Splunk | HTTP | Datadog, etc.
```

Best when the goal is **"get streaming data into storage or a partner tool"** rather than custom stream processing.

## Firehose sources
| Source | Use |
| --- | --- |
| **Direct PUT** (`PutRecord`, `PutRecordBatch`) | Apps, agents, custom producers |
| **Kinesis Data Streams** | Firehose reads from a stream and delivers elsewhere |
| **CloudWatch Logs subscription filter** | Near-real-time log streaming |
| **CloudWatch Metric Streams** | Continuous metric export |
| **Third-party integrations** | e.g. WAF logging configuration |

## Destinations (exam-relevant)
| Destination | Typical use |
| --- | --- |
| **Amazon S3** | Data lake, archive, compliance, Athena queries |
| **Amazon OpenSearch Service** | Log search and dashboards |
| **Amazon Redshift** | Warehouse loading (via S3 staging) |
| **Splunk** | SIEM / operational analytics |
| **HTTP endpoint** | Datadog, New Relic, custom API |
| **Amazon OpenSearch Serverless** | Managed search ingestion |

## Buffering, compression, and format
Firehose buffers before delivery:
| Setting | S3 example behavior |
| --- | --- |
| **Buffer size** | Deliver when batch reaches size threshold (e.g. 128 MB) |
| **Buffer interval** | Deliver when time threshold reached (e.g. 60–900 s) — **whichever comes first** |

Optional features:
- **Compression** — GZIP, ZIP, Snappy (destination-dependent)
- **Encryption** — SSE-S3, SSE-KMS on S3; CMK on stream
- **Dynamic partitioning** — S3 prefixes from record content (e.g. by date or `errorCode`)
- **Data format conversion** — JSON → **Parquet** or ORC for analytics
- **Lambda transform** — enrich, filter, or redact records before delivery

**Exam tip**: "Optimize S3 storage for Athena queries" → Firehose with **Parquet conversion** and **dynamic partitioning**.

## Lambda processing in Firehose
Firehose can invoke **Lambda synchronously** for each batch:
- Transform log format, strip PII, add metadata
- Must return transformed records in required format
- Failures retry; persistent failures go to **S3 backup bucket** (if configured)

Different from **Lambda consuming Data Streams** — here Lambda is a **transformation step**, not the final consumer.

## Failure handling and backup
Configure for delivery failures:
- **S3 backup bucket** for failed records or failed processing
- Retry duration and CloudWatch metrics (`DeliveryToS3.Success`, `ExecuteProcessing.Success`, etc.)
- Monitor **`ThrottledRecords`** and destination permissions

Common failure causes:
- S3 bucket policy or KMS key policy blocks Firehose role
- OpenSearch cluster capacity or permissions
- Lambda transform timeout or malformed output

## CloudWatch integrations (high exam value)

### Logs → Firehose → S3
```text
Application logs → CloudWatch Logs
        ↓
Subscription filter (pattern or all)
        ↓
Firehose delivery stream
        ↓
S3 bucket (long-term archive)
```

Use when question asks for **near-real-time**, **continuous** log archive — not a one-time export.

Compare:
| Method | Real-time? | Destination |
| --- | --- | --- |
| **Export task** | No (batch job) | S3 only |
| **Subscription filter → Firehose** | Yes | S3, OpenSearch, Lambda, etc. |
| **Subscription filter → Data Streams** | Yes | Custom consumers |

### Metric Streams → Firehose
```text
CloudWatch metrics (filtered or all)
        ↓
Metric Stream
        ↓
Firehose
        ↓
S3 or third-party HTTP endpoint
```

Use for **continuous metric export** to observability partners or S3 — not for threshold alerting (use **alarms**).

## AWS WAF + Firehose
WAF can send logs to a Firehose delivery stream (HTTPS endpoint). Exam scenarios stress:
- Correct **Firehose throughput/capacity** for request volume
- Destination configuration (often S3 or OpenSearch for analysis)

## IAM and cross-service permissions
Firehose uses a **service role** to:
- Write to S3, OpenSearch, Redshift, Splunk
- Invoke Lambda transform
- Read from source Data Streams
- Decrypt KMS-encrypted sources/destinations

**Exam trap**: Delivery fails even when Firehose exists — check **destination bucket policy**, **KMS key policy**, and **Firehose role permissions**.

## Managed Service for Apache Flink (stream analytics)
Formerly **Kinesis Data Analytics**. Runs **Apache Flink** applications for:
- Real-time aggregations, windowing, joins
- Complex event processing on Data Streams or MSK sources

| Need | Service |
| --- | --- |
| SQL/Flink stateful processing on streams | **Managed Service for Apache Flink** |
| Simple record-by-record handling | **Lambda** |
| Load data to S3/OpenSearch | **Firehose** |

## Kinesis Video Streams (awareness only)
Ingests and stores video for playback, ML, and archival. Rarely central to DevOps CO2 — know it exists as a distractor when the workload is **video**, not logs/metrics.

## Service selection cheat sheet
| Scenario | Best answer |
| --- | --- |
| Stream application logs continuously to S3 | **CloudWatch subscription → Firehose → S3** |
| One-time export of last week's logs | **CloudWatch export task** (not Firehose) |
| Process each record with custom code at scale | **Data Streams + Lambda/KCL** |
| Deliver to OpenSearch with minimal consumer code | **Firehose → OpenSearch** |
| Export all metrics to Datadog/S3 continuously | **Metric Streams → Firehose** |
| Preserve order per device ID | **Data Streams** with device ID partition key |
| Convert JSON logs to Parquet in S3 | **Firehose** format conversion |
| Redact PII before S3 storage | **Firehose Lambda transform** |
| Multiple teams consume same stream at full rate | **Data Streams enhanced fan-out** |
| Existing Kafka consumers/producers | **MSK**, not Kinesis |
| Route EC2 state change to Lambda | **EventBridge**, not Kinesis |

## High-value exam scenarios
| Scenario | Correct approach |
| --- | --- |
| Near-real-time centralized log archive in S3 | Subscription filter → **Firehose** → S3 |
| Alert when ERROR appears in logs | **Metric filter** → alarm (not Kinesis) |
| Real-time fraud detection with custom app | **Data Streams** + consumer |
| Lambda falls behind on stream volume | Increase shards, **parallelization factor**, optimize function |
| Third-party SIEM needs HTTP ingestion | **Firehose → HTTP endpoint** |
| Analytics team queries archived logs cheaply | Firehose → S3 **Parquet** → **Athena** |
| WAF logs not appearing in destination | Check Firehose capacity, role, destination config |
| Replay stream after consumer bug | **Data Streams** retention + reset iterator/checkpoint |

## Exam traps
- **Firehose is not a database or queue** — it delivers; processing is limited to Lambda transform.
- **Subscription filter limit** per log group — may need Firehose or Data Streams fan-out for many consumers.
- **Firehose vs Data Streams**: Firehose = managed delivery; Data Streams = custom consumption + replay.
- **Export task vs subscription filter** — export is batch/historical; subscription is streaming.
- **IteratorAge** applies to **stream consumers**, not Firehose delivery latency (use Firehose delivery metrics instead).
- **Ordering** is only guaranteed per **partition key** in Data Streams, not globally across the stream.
- **SQS** does not replace Kinesis for high-volume ordered replayable streaming scenarios.

## Troubleshooting quick reference
| Symptom | Check |
| --- | --- |
| Firehose not delivering to S3 | IAM role, bucket policy, KMS, buffer settings, destination errors |
| Lambda stream iterator age high | Batch size, function duration, shard count, parallelization |
| Throttled producer writes | Shard count, hot partition keys, on-demand vs provisioned |
| Duplicate processing | Expected at-least-once semantics — design idempotent consumers |
| Missing WAF logs | Firehose records/sec capacity vs WAF request rate |

## Review checklist
- [ ] Data Streams vs Firehose decision tree
- [ ] Shards, partition keys, hot shards, retention
- [ ] Lambda event source mapping options
- [ ] Enhanced fan-out when to use
- [ ] Firehose buffering, Parquet, Lambda transform, dynamic partitioning
- [ ] CloudWatch Logs subscription vs export task
- [ ] Metric Streams → Firehose
- [ ] WAF → Firehose pattern
- [ ] Kinesis vs SQS / SNS / EventBridge
