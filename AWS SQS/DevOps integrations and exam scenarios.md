# DevOps integrations and exam scenarios

## AWS service integrations
| Service | SQS role |
| --- | --- |
| **Lambda** | **Event source mapping** polls queue; invokes function with batch of records |
| **ECS / EKS / EC2** | Application workers poll queues (long polling); auto scaling on queue **depth** or **age** |
| **SNS** | **Subscribe SQS to SNS topic** — classic **fan-out** with durable buffers per service |
| **EventBridge** | Target **SQS** for routed events; **Pipes** can **Enrich/Filter** from SQS/Kinesis/etc. |
| **Step Functions** | **Wait for task token** patterns sometimes pair with external callbacks; **DLQ** on state machines for failed executions |
| **CodePipeline / CodeBuild** | Custom actions or workers can use queues for async handoffs (less common than SNS/EventBridge notifications) |
| **CloudWatch** | **Alarms** on queue metrics (depth, age) → scaling or paging |

## Lambda + SQS (high-frequency pattern)
```text
SQS queue → Lambda event source mapping → function(batch) → partial successes → delete successes
```

Key behaviors:
- **Batch size** and **maximumBatchingWindow** tune throughput vs latency.
- **Reserved concurrency** on the function avoids starving other Lambdas when one queue floods.
- **Partial batch failure** (report failed item identifiers) so only failures retry — **reduces duplicate work** when supported and configured.

**Exam tip**: “Lambda times out processing some records” → increase **function timeout**, **visibility timeout** (related: visibility should cover Lambda max duration), or **reduce batch size**.

## SNS → SQS fan-out (classic)
**Question**: “Each microservice needs its own copy of an event and processes at different speeds.”

**Answer**: **SNS topic** with **one SQS queue per subscriber** (each queue subscribed to the topic). Workers poll their queue.

Why SQS here?
- **Durability**, **backpressure**, **per-service DLQ** and scaling.

## Choosing visibility timeout with Lambda
AWS documents the relationship between queue visibility timeout and Lambda: visibility should be **at least six times** the function **timeout**, plus **batching window** buffer (exact formula in **AWS Lambda + SQS** docs — memorize the **“long enough for Lambda to finish + buffer”** idea for the exam).

If visibility is **too short**, Lambda may still be processing while the message becomes visible again → **duplicate processing**.

## Auto scaling on queues
| Signal | Meaning |
| --- | --- |
| **ApproximateNumberOfMessagesVisible** | Backlog waiting to be consumed |
| **ApproximateAgeOfOldestMessage** | How “stale” the oldest message is — great for **SLA / latency** alarms |

**Exam tip**: “Scale workers when jobs pile up” → target tracking or step scaling on **queue depth** or **oldest message age**.

## EventBridge Pipes (SQS as source)
- Pipe **source**: SQS queue.
- Optional **filtering**, **enrichment** (Lambda/API), **target**: many AWS services.
- Useful when you want **point-to-point** queue semantics but **declarative routing** to targets.

## Step Functions and DLQ
- Express vs Standard workflows have different characteristics; **DLQ** on state machine catches **failed executions** (configured on the state machine).
- Distinction: **SQS DLQ** = failed **queue messages**; **Step Functions DLQ** = failed **workflow executions** — do not confuse them in scenario questions.

## Choose the right approach
| Requirement | Answer |
| --- | --- |
| Buffer async jobs between services | **SQS** |
| Fan-out with per-consumer buffers | **SNS → multiple SQS** |
| Schedule + cross-service event patterns | **EventBridge** (SQS is not a scheduler) |
| Strict order per user | **SQS FIFO** + **message group ID** = user |
| Poison messages without blocking healthy traffic | **DLQ** + **maxReceiveCount** |
| Reprocess failed messages after fix | **DLQ redrive** to source queue |
| Real-time stream analytics, replay by time | **Kinesis** (not primary SQS use case) |

## Common exam scenarios
- **Duplicate Lambda invocations for same message** → at-least-once semantics; **idempotent** processing or **dedup** keys.
- **Messages reprocessed forever** → bug prevents `DeleteMessage`; or **visibility too short** vs processing time.
- **Queue grows unbounded** → insufficient consumers; scale out; check **errors** in consumers or **DLQ** spike.
- **FIFO throughput bottleneck** → split work across **multiple message groups** (loses global order but increases parallelism).
- **Cross-account consumer** → **resource-based queue policy** allows `ReceiveMessage` / `DeleteMessage` from principal; producers need `SendMessage`.
- **Encrypt sensitive job payloads** → **SSE-KMS** on queue; consumers need **kms:Decrypt**; producers **kms:GenerateDataKey** (as applicable).
- **Private-only traffic from VPC** → **interface VPC endpoint** for SQS; no internet egress.

## Troubleshooting checklist
1. Is **visibility timeout** appropriate for **worst-case** processing (especially Lambda)?
2. Are consumers calling **DeleteMessage** only **after** success?
3. Is **DLQ** configured and is **maxReceiveCount** sensible?
4. Check **ApproximateAgeOfOldestMessage** and **ApproximateNumberOfMessagesVisible**.
5. For FIFO: are **message group IDs** chosen to avoid accidental **single-thread** bottlenecks?
6. For cross-account/VPC: **queue policy** and **endpoint** / routing correct?
