# What is Amazon EventBridge?

Amazon EventBridge is a **serverless event bus** that routes events from AWS services, custom applications, and SaaS partners to targets such as Lambda, SQS, SNS, and Step Functions. It is the evolution of **CloudWatch Events**—same API namespace (`events`), with broader integrations.

EventBridge answers: **"When X happens, run Y"**—with pattern matching, scheduling, filtering, and multi-target routing.

## Core components
| Component | Purpose |
| --- | --- |
| **Event bus** | Receives events; rules on the bus decide routing |
| **Rule** | Matches events (pattern or schedule) and sends to targets |
| **Event** | JSON document describing what happened (`source`, `detail-type`, `detail`, etc.) |
| **Target** | Destination that receives matched events (Lambda, Step Functions, SQS, etc.) |
| **Archive / replay** | Store matched events and replay them for testing or recovery |

## Event bus types
| Bus | Receives events from |
| --- | --- |
| **Default bus** | AWS services in your account (EC2, S3 via EventBridge, CodePipeline, etc.) |
| **Custom bus** | Your applications (`PutEvents`) and cross-account publishers |
| **Partner bus** | Authorized SaaS partners (Datadog, PagerDuty, Auth0, etc.) |

## EventBridge vs related services
| Requirement | Service |
| --- | --- |
| Route/filter events and trigger workflows | **EventBridge** |
| Metric threshold alerting | **CloudWatch alarm** (can also emit events to EventBridge) |
| Simple pub/sub topic fan-out | **SNS** |
| Durable queue, consumer pulls messages | **SQS** |
| Orchestrate multi-step workflows | **Step Functions** (often triggered by EventBridge) |
| Audit API calls | **CloudTrail** (can integrate with EventBridge) |
| Scheduled Lambda every N days | **EventBridge schedule rule** or **EventBridge Scheduler** |

**Exam tip**: Use **EventBridge** when the question needs **event pattern matching**, **multiple targets**, **cross-account routing**, **SaaS integration**, or **replacing CodePipeline polling** with event-driven triggers. Use a **CloudWatch alarm** when the trigger is a **metric threshold**.

## Typical event structure
```json
{
  "version": "0",
  "id": "event-id",
  "detail-type": "EC2 Instance State-change Notification",
  "source": "aws.ec2",
  "account": "111122223333",
  "time": "2026-09-16T10:00:00Z",
  "region": "us-east-1",
  "resources": ["arn:aws:ec2:us-east-1:111122223333:instance/i-abc"],
  "detail": { }
}
```

Rules match on fields like `source`, `detail-type`, and nested `detail` content.

## EventBridge product family (exam awareness)
| Feature | Purpose |
| --- | --- |
| **EventBridge Rules** | Pattern or schedule → one or more targets |
| **EventBridge Pipes** | Point-to-point: single source → single target with filter/enrich/transform |
| **EventBridge Scheduler** | Large-scale one-time and recurring schedules (millions of schedules) |
| **Schema registry** | Discover, version, and validate event schemas |
| **API destinations** | Invoke external HTTPS endpoints with retries and auth |
| **Global endpoints** | Failover event ingestion across Regions for disaster recovery |

Most DP-C02 questions focus on **rules**, **buses**, and **DevOps integrations**—not every advanced feature.
