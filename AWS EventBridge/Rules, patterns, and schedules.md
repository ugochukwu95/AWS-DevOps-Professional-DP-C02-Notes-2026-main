# Rules, event patterns, and schedules

## Rule types
| Type | Trigger | Example |
| --- | --- | --- |
| **Event pattern rule** | Matching event arrives on a bus | CodePipeline execution failed |
| **Schedule rule** | Time-based (`rate` or `cron`) | Run Inspector assessment weekly |

One rule can have **multiple targets** (for example Lambda + SNS + SQS in parallel).

## Event pattern matching
Rules use **content-based filtering** on the event JSON—not on message body strings like SNS filter policies on arbitrary payloads (though conceptually similar).

Common pattern techniques:
| Technique | Example use |
| --- | --- |
| Exact match | `"source": ["aws.codepipeline"]` |
| Prefix | `"source": [{"prefix": "aws."}]` |
| Anything-but | Exclude specific event types |
| Numeric range | `"detail": { "responseElements": { "status": [400, 499] } }` |
| Exists | Require a field to be present |
| Wildcard / suffix | Match nested detail fields |

Example—trigger on failed CodePipeline action:
```json
{
  "source": ["aws.codepipeline"],
  "detail-type": ["CodePipeline Action Execution State Change"],
  "detail": {
    "state": ["FAILED"]
  }
}
```

**Exam tip**: For granular CodePipeline filtering (approval started, specific stage failed), create a **custom EventBridge rule**—CodePipeline **notification rules** are a managed wrapper with limited event types.

## Schedule expressions
| Expression | Meaning |
| --- | --- |
| `rate(5 minutes)` | Every 5 minutes |
| `rate(1 hour)` | Every hour |
| `rate(7 days)` | Every 7 days |
| `cron(0 9 ? * MON-FRI *)` | 09:00 UTC weekdays |

Schedule rules invoke targets directly—they do **not** require an incoming event.

Common exam uses:
- Recurring **Inspector** assessments via Lambda calling `StartAssessmentRun`
- Periodic **Config** or compliance reports
- Nightly backup or cleanup jobs
- **Image Builder** pipeline schedules (native schedule on pipeline; EventBridge for reactions to results)

### Schedule rule vs EventBridge Scheduler
| | Schedule rule | EventBridge Scheduler |
| --- | --- | --- |
| Scale | Fine for dozens/hundreds of schedules | Millions of schedules |
| Flexibility | One rule, one schedule expression | Per-schedule config, flexible time windows, dead-letter |
| Exam default | **Schedule rule** for "run Lambda every 7 days" | When question mentions massive scale or one-time schedules at volume |

## Input to targets
| Option | Effect |
| --- | --- |
| **Matched event** (default) | Full event JSON sent to target |
| **Constant (JSON)** | Static payload |
| **Input transformer** | Map event fields to custom template using `InputPath` and `InputTemplate` |
| **Input path** | Pass only part of the event |

Use **input transformer** when Lambda/Step Functions needs a simplified payload (for example just pipeline name and execution ID).

## Reliability
| Feature | Purpose |
| --- | --- |
| **Retry policy** | Retry failed target delivery (default varies by target) |
| **Dead-letter queue (DLQ)** | SQS queue for events that could not be delivered after retries |
| **Target execution role** | IAM role EventBridge assumes to invoke Lambda, Step Functions, etc. |

Always configure a **DLQ** for production remediation workflows.

## Archive and replay
- **Archive** events on a bus (optionally filtered by pattern) for audit or reprocessing.
- **Replay** archived events back through the bus to test rule changes or recover from misconfiguration.

Useful when a rule was wrong and you need to reprocess historical events—exam niche but good differentiator from SNS.

## Schema registry
- Automatically discovers schemas from events on a bus.
- Helps teams agree on event structure for custom `PutEvents` applications.
- Lower priority for exam unless question mentions schema validation or code generation from events.
