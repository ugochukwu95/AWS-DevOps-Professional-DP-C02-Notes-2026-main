# Event buses, targets, and cross-account routing

## Supported targets (exam-relevant)
| Target | Typical DevOps use |
| --- | --- |
| **Lambda** | Remediation, notifications, start builds |
| **Step Functions** | Multi-step incident response, credential revocation |
| **SNS** | Fan-out alerts to email, chat, paging |
| **SQS** | Buffer events for async workers |
| **CodePipeline** | Start pipeline execution |
| **CodeBuild** | Start build project |
| **Systems Manager** | Start Automation document |
| **ECS task** | Run one-off container task |
| **Event bus (another account/Region)** | Central security/ops account routing |
| **API destination** | Call external HTTPS webhook |
| **Kinesis stream** | Stream analytics pipeline |
| **CloudWatch log group** | Audit matched events |

Each target needs an **IAM role** that allows EventBridge to invoke it (except SNS/SQS in same account with proper resource policies).

## Default bus vs custom bus
| | Default bus | Custom bus |
| --- | --- | --- |
| AWS service events | Yes (automatically) | No—unless forwarded |
| Custom app events (`PutEvents`) | Yes | Preferred for app boundaries |
| Cross-account receive | Via resource policy | Via resource policy |
| Naming | Always `default` | Your name (for example `security-events`) |

Publish custom events:
```bash
aws events put-events --entries '[{
  "Source": "com.mycompany.orders",
  "DetailType": "OrderCreated",
  "Detail": "{\"orderId\":\"123\"}",
  "EventBusName": "orders-bus"
}]'
```

## Cross-account event routing
```text
Account A (publisher)              Account B (central ops)
─────────────────────              ───────────────────────
App or AWS service                 Custom event bus
PutEvents / service event    →     Resource policy allows Account A
                                   Rule matches event
                                   Target: Lambda / Step Functions / SNS
```

Requirements:
1. **Resource policy on destination bus** allows `events:PutEvents` from source account.
2. **Rule** on destination bus matches and routes event.
3. **Target role** in destination account can invoke the target.

Organization-wide patterns:
- Central **security account** receives GuardDuty, Config, CloudTrail-derived events
- Central **CI/CD account** receives pipeline events from workload accounts

**Exam tip**: Cross-account event delivery fails when the **destination bus policy** omits the source account—not when only IAM on the publisher is wrong.

## S3 and EventBridge
S3 can send events to EventBridge (enable on bucket). Benefits over legacy S3 notifications:
- Single event stream for many consumers (rules with different patterns)
- Route to Step Functions, not just Lambda/SNS/SQS
- Filter by object key prefix, tags, etc. through event pattern

| Approach | When to use |
| --- | --- |
| S3 → Lambda (notification) | Simple single consumer |
| S3 → EventBridge | Multiple consumers, complex routing, integration with org bus |
| S3 → SNS | Fan-out alerts |

## CloudWatch alarms and EventBridge
CloudWatch alarms can publish **Alarm State Change** events to EventBridge (in addition to direct SNS/Lambda actions).

Use EventBridge when remediation needs:
- Branching logic (Step Functions)
- Multiple downstream systems
- Cross-account routing
- Correlation with other event sources

## EventBridge Pipes (vs rules)
| | Rule | Pipe |
| --- | --- | --- |
| Model | One bus, many rules, many targets | **One source → one target** pipeline |
| Sources | Event bus events | SQS, Kinesis, DynamoDB streams, MSK |
| Features | Pattern match | Built-in filtering, enrichment (Lambda), input transformation |
| Exam cue | "Route AWS service events" | "Poll-free stream/queue to Lambda with enrichment" |

**Exam tip**: **Pipes** connect a **streaming/queue source** directly to a target. **Rules** react to **events on a bus**.

## Security and permissions
| Permission | Purpose |
| --- | --- |
| `events:PutEvents` | Publish to a bus |
| `events:PutRule`, `events:PutTargets` | Create/update rules |
| Resource policy on bus | Allow cross-account `PutEvents` |
| Target execution role | Let EventBridge invoke Lambda, SFN, etc. |

Use **least privilege** on execution roles—remediation Lambdas often need narrow permissions (disable key, not `*`).

## EventBridge vs SNS vs SQS
| | EventBridge | SNS | SQS |
| --- | --- | --- | --- |
| Model | Event router with patterns | Pub/sub topic | Queue |
| Filtering | Rich content-based patterns | Subscription filter policies | Consumer-side processing |
| Schedule | Built-in | No | No |
| Multiple consumers | Multiple rules/targets | Multiple subscriptions | Typically one consumer group per queue |
| Best for | Event-driven automation | Broadcast notifications | Decouple and buffer work |
