# What is Amazon SQS?

Amazon Simple Queue Service (SQS) is a **managed message queue**. Producers **send** messages to a queue; consumers **poll** (pull) messages, process them, and **delete** them when work succeeds. It decouples components, **buffers spikes**, and lets workers scale independently.

SQS is **pull-based** and **durable** (messages persist until consumed, deleted, or they expire). Delivery is **at-least-once**: design consumers to be **idempotent** (duplicate processing can happen after visibility timeout expiry or retries).

## Core concepts
| Concept | Meaning |
| --- | --- |
| **Queue** | Named buffer for messages (Standard or FIFO) |
| **Message** | Body (up to **256 KB** per message; larger payloads often use **S3 + pointer** or **Extended Client Library**) |
| **Producer** | Calls `SendMessage` / `SendMessageBatch` |
| **Consumer** | Calls `ReceiveMessage`, processes, then `DeleteMessage` |
| **Visibility timeout** | After a consumer receives a message, it is **hidden** from other consumers for this duration; if not deleted in time, it **reappears** for retry |
| **Dead-letter queue (DLQ)** | A **separate queue** (or FIFO queue) that receives messages that failed processing after **maxReceiveCount** threshold |
| **Message retention** | **1 minute to 14 days** (default often **4 days** — confirm in console/docs) |

```text
Producer → SQS queue ← Consumer (poll ReceiveMessage → process → DeleteMessage)
                         ↓ failures / poison messages
                    Dead-letter queue
```

## Standard vs FIFO queues
| | **Standard** | **FIFO** |
| --- | --- | --- |
| Ordering | **Best-effort** ordering | **Strict FIFO** order **per message group ID** |
| Throughput | Nearly unlimited (high scale) | **300 TPS** per queue (**3,000** with batching/high throughput mode — verify current limits) |
| Duplicates | **At-least-once** | **Exactly-once processing** semantics with **deduplication** |
| Name | Any | Must end with **`.fifo`** |
| Use case | General workloads, fan-out workers | Order-sensitive workflows (e.g. state transitions per entity) |

FIFO requirements:
- **Message group ID**: scopes ordering (same group = strict order).
- **Deduplication**: **content-based** (hash body) or explicit **deduplication ID** (5-minute dedup window).

**Exam tip**: “Strict order per customer ID” → **FIFO** + **message group ID** = customer ID. “Maximum throughput, order does not matter” → **Standard**.

## Polling: short vs long
| Mode | Behavior |
| --- | --- |
| **Short polling** | Returns immediately (possibly empty); more API calls |
| **Long polling** | `WaitTimeSeconds` up to **20**; reduces empty receives and cost |

**Exam tip**: Prefer **long polling** for worker efficiency unless you have a special reason for short polling.

## Visibility timeout (exam-critical)
- While a message is **in flight**, it is invisible to other consumers.
- If processing takes **longer than visibility timeout**, another consumer may receive the **same message** → duplicates.
- If timeout is **too large**, failed or crashed workers **delay** retry.

**Operational balance**: Set visibility timeout **slightly above** worst-case processing time; tune with metrics (`ApproximateNumberOfMessagesNotVisible`).

## Message lifecycle (happy path)
1. `SendMessage` → message stored.
2. Consumer `ReceiveMessage` → gets **receipt handle** (needed for delete/change visibility).
3. Process work.
4. `DeleteMessage` with receipt handle → removed from queue.
5. On failure: do not delete; message returns after visibility timeout, or route to **DLQ** after **maxReceiveCount**.

## Dead-letter queues
- Configure **redrive policy** on **source queue**: point to **DLQ** ARN + **maxReceiveCount** (e.g. 5).
- **DLQ must be same type** as source (FIFO → FIFO DLQ).
- Use **DLQ redrive** (console/API) to send messages back to source after fixing consumers.

**Exam tip**: “Poison messages block the queue” → **DLQ** + fix worker + **redrive** or inspect messages.

## Batching
- `SendMessageBatch` / `ReceiveMessageBatch` / `DeleteMessageBatch` reduce API calls.
- Lambda event source mapping can pass **batches** to a single invocation.

## SQS vs related services (one-line)
| Need | Service |
| --- | --- |
| Durable queue, competing consumers | **SQS** |
| Pub/sub fan-out to many subscribers | **SNS** (often **SNS → SQS** per consumer) |
| Event routing, schedules, SaaS sources | **EventBridge** |
| High-throughput stream, shards, replay window | **Kinesis Data Streams** |

## Quick limits (verify in AWS docs)
- Message body **256 KB** (service limit for the message itself).
- **FIFO** throughput lower than Standard; use multiple **message groups** for parallelism **without** global ordering.

These notes are for study; confirm quotas and defaults in current AWS documentation before exams or production.
