# What is Amazon SNS?

Amazon Simple Notification Service (SNS) is a **managed pub/sub messaging** service. Publishers send messages to a **topic**; SNS delivers copies to all **subscribed endpoints** (email, SMS, Lambda, SQS, HTTP/S, etc.).

SNS is **push-based**—SNS initiates delivery to subscribers. It does **not** persist messages long-term like SQS. If no subscriber can receive the message, it is lost unless you use a durable subscriber (SQS) or configure retries/DLQ for supported protocols.

## Core concepts
| Concept | Meaning |
| --- | --- |
| **Topic** | Named channel publishers send messages to |
| **Publisher** | Produces messages (`Publish` API or AWS service integration) |
| **Subscriber** | Endpoint registered on the topic to receive messages |
| **Subscription** | Link between topic and endpoint; must be **confirmed** (except SQS/Lambda in same account) |
| **Message** | Payload (up to 256 KB) plus optional **message attributes** |

## Standard vs FIFO topics
| | Standard topic | FIFO topic |
| --- | --- | --- |
| Throughput | High | 300 msg/s (3,000 with batching) |
| Ordering | Best-effort | Strict order **per message group ID** |
| Delivery | At-least-once | Exactly-once (with deduplication) |
| Name suffix | None | Must end with `.fifo` |
| Use case | Alerts, fan-out, general notifications | Ordered workflows, finance, inventory |

FIFO requirements:
- Enable **content-based deduplication** or provide a **deduplication ID** per message.
- Provide a **message group ID** for ordering scope.

**Exam tip**: Need **fan-out alerts to many teams** → standard topic. Need **strict ordering and no duplicates** → FIFO topic.

## SNS vs related services
| Requirement | Service |
| --- | --- |
| Broadcast notification to many subscribers | **SNS** |
| Durable queue, consumer polls | **SQS** |
| Route/filter events from many AWS sources | **EventBridge** |
| Simple alarm email/page | CloudWatch alarm → **SNS** |
| Fan-out with persistence and independent processing | **SNS → SQS** (classic pattern) |
| Multi-step remediation workflow | **EventBridge → Step Functions** (not SNS alone) |

## Common delivery protocols
| Protocol | Typical use |
| --- | --- |
| **Email / Email-JSON** | Human alerts; JSON includes metadata |
| **SMS** | On-call paging (cost and opt-in limits apply) |
| **SQS** | Durable fan-out; workers process at their own pace |
| **Lambda** | Serverless processing of notifications |
| **HTTP/HTTPS** | Webhooks to external systems |
| **Firehose** | Stream notifications to S3/OpenSearch |
| **Mobile push** | iOS/Android via platform applications |

**Exam tip**: **Email subscriptions require confirmation** (click link). SQS/Lambda subscriptions in the same account are auto-confirmed.
