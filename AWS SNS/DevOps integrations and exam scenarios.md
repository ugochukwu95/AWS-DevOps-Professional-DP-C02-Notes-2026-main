# DevOps integrations and exam scenarios

## AWS service integrations
| Service | SNS role |
| --- | --- |
| **CloudWatch alarms** | Direct alarm action → SNS → email/SMS/Lambda |
| **CloudWatch Logs** | Optional metric/alarm path; logs use subscription filters separately |
| **EventBridge** | Target for routed events (more flexible than alarm → SNS alone) |
| **CodePipeline** | Manual approval notifications; notification rules → SNS |
| **CodeBuild / Image Builder** | Build/pipeline status notifications |
| **AWS Config** | Delivery channel SNS notification on snapshot delivery |
| **RDS** | DB event notifications (failover, low storage, maintenance) |
| **ElastiCache** | Node replacement, failover, maintenance events |
| **Auto Scaling** | Lifecycle and capacity notifications |
| **GuardDuty / Security Hub** | Findings forwarded to SNS for paging |
| **Budgets / Billing** | Cost threshold alerts |

## CodePipeline approval pattern
Manual approval action options:
- **Publish approval notification** to SNS topic
- Include review URL and comments in the message
- Approvers use console/CLI to approve or reject

For richer filtering (only prod approvals), use **EventBridge rule** on CodePipeline events instead of basic notification rules.

## CloudWatch alarm → SNS (classic)
```text
Metric breach → Alarm ALARM state → SNS topic → email + SMS + Lambda
```

Requirements:
- Alarm configured with SNS action on transition
- Topic policy trusts CloudWatch
- Email subscriptions confirmed

Use **EventBridge instead** when the same alarm must trigger Step Functions, cross-account routing, or multi-service orchestration.

## SNS + SQS fan-out (high-frequency exam pattern)
**Question**: "Multiple microservices must process the same order event independently with buffering."

**Answer**: Publish to **SNS topic** → subscribe **one SQS queue per service** → workers poll their queue.

Why not SNS → Lambda only?
- SQS provides **durability**, **backpressure**, and **independent retry/DLQ** per consumer.

Why not one SQS queue?
- One queue = competing consumers; each service would not get every message. SNS fan-out gives **every subscriber a copy**.

## Choose the right approach
| Requirement | Answer |
| --- | --- |
| Email on-call when CPU > 80% | CloudWatch alarm → **SNS** |
| Notify Slack channel | SNS → **AWS Chatbot** |
| Fan-out to 5 services with durable queues | **SNS → multiple SQS** |
| Filter alerts by severity per team | SNS **filter policies** on subscriptions |
| Ordered financial transactions | **SNS FIFO** topic |
| Route many AWS event sources with patterns | **EventBridge** (not SNS alone) |
| Decouple producer/consumer, single worker pool | **SQS** (no SNS) |
| Cross-account alert delivery | SNS topic policy + subscriber confirmation/queue policy |
| Encrypt notifications at rest with CMK | SNS SSE-KMS + subscriber KMS permissions |
| Pipeline approval email to managers | CodePipeline approval → **SNS** |
| Retry failed webhook delivery | HTTP subscription retries + **DLQ** |

## SNS vs EventBridge vs SQS
| | SNS | EventBridge | SQS |
| --- | --- | --- | --- |
| Pattern | Pub/sub push | Event routing | Queue pull |
| Persistence | No (unless subscriber is SQS) | Optional archive | Yes |
| Filtering | Per-subscription filter policy | Rule event pattern | Consumer-side |
| Schedule | No | Yes | No |
| Fan-out | Native | Multiple targets per rule | Multiple consumers need SNS or fan-out |

## Common exam scenarios
- **Alarm sends email but not SMS** → SMS subscription unconfirmed or SMS spending limit.
- **SNS message not reaching SQS** → queue policy missing `sqs:SendMessage` for SNS; or KMS permission missing on encrypted queue.
- **Only security team should get CRITICAL alerts** → filter policy on security team's SQS/email subscription.
- **Microservices need same event, process at own speed** → SNS fan-out to per-service SQS queues.
- **Strict order, no duplicates in billing pipeline** → FIFO SNS (or FIFO SQS downstream).
- **Config snapshot delivered—notify ops** → Config delivery channel **SNS** topic.
- **RDS Multi-AZ failover page on-call** → RDS event subscription → SNS.
- **HTTP webhook misses messages under load** → add **SQS buffer** (SNS → SQS → worker) instead of SNS → HTTP only.
- **Cross-account monitoring account receives alerts** → central SNS topic with cross-account publish/subscribe policies.
- **Lambda invoked twice for same alert** → expected at-least-once; design idempotent handlers.

## Troubleshooting checklist
1. Are subscriptions **confirmed**?
2. Does **topic policy** allow the publisher (CloudWatch, EventBridge, account)?
3. For SQS: does **queue policy** allow SNS `SendMessage`?
4. For KMS-encrypted topics/queues: do all parties have **kms:Decrypt/GenerateDataKey**?
5. Check **`NumberOfNotificationsFailed`** metric and delivery status logs.
6. For filter policies: are **message attributes** present and matching?
