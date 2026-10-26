# States Language, patterns, and service integrations

## Amazon States Language (ASL)
State machines are JSON documents:

```json
{
  "Comment": "Example",
  "StartAt": "FirstTask",
  "States": {
    "FirstTask": {
      "Type": "Task",
      "Resource": "arn:aws:states:::lambda:invoke",
      "Parameters": {
        "FunctionName": "MyFunction",
        "Payload.$": "$"
      },
      "Next": "Done"
    },
    "Done": { "Type": "Succeed" }
  }
}
```

Key fields: `Type`, `Resource`, `Parameters`, `ResultPath`, `ResultSelector`, `Next`, `End`, `Retry`, `Catch`, `TimeoutSeconds`.

## Task states and integration patterns
| Integration | Pattern | Behavior |
| --- | --- | --- |
| **Lambda** | `arn:aws:states:::lambda:invoke` | Invoke function; wait for response |
| **AWS SDK service** | `arn:aws:states:::aws-sdk:s3:getObject` | Direct API call from workflow |
| **Optimized integrations** | `arn:aws:states:::sqs:sendMessage.waitForTaskToken` | Service-specific ARNs |
| **Run a Job (.sync)** | e.g. CodeBuild, ECS, Batch, Glue | Start job and **wait until complete** |
| **Request Response** | Default for many integrations | Call and continue with result |
| **Wait for callback** | `.waitForTaskToken` | Pause until `SendTaskSuccess` / `SendTaskFailure` |

**Exam tip**: "Start CodeBuild and wait for build to finish before deploy step" → **Task** with CodeBuild **`.sync`** integration (or poll pattern in Standard).

## Choice state
Branch on **JSONPath** conditions (`Variable`, `StringEquals`, `NumericGreaterThan`, etc.).

```text
ScanResult
    ↓
Choice: severity == CRITICAL?
    ├── Yes → DisableKey → Notify
    └── No  → LogOnly → Succeed
```

Use for environment routing (dev vs prod actions) and compliance gates.

## Parallel state
Runs **branches** concurrently; workflow waits for **all** branches to complete (or fail according to Catch).

Use when steps are **independent** (notify team + create ticket + run Lambda scan at same time).

## Map state
Process **each item** in an array.

| Mode | Use |
| --- | --- |
| **Inline Map** | Up to **40** concurrent iterations (configurable); items in state input |
| **Distributed Map** | Large-scale — reads from **S3** CSV/JSON manifest; high concurrency |

**Exam tip**: "Process each S3 object key in a list with controlled concurrency" → **Map** (distributed for huge sets).

## Wait state
- **Seconds** — fixed delay (rate limiting, backoff spacing)
- **Timestamp** — wait until specific time
- **SecondsPath** — dynamic from input

## Pass state
Transform JSON without invoking services — reshape data between steps.

## Retry and Catch (error handling)
**Retry** — transient errors (Lambda service exceptions, throttling):
```json
"Retry": [{
  "ErrorEquals": ["States.TaskFailed", "Lambda.ServiceException"],
  "IntervalSeconds": 2,
  "MaxAttempts": 3,
  "BackoffRate": 2.0
}]
```

**Catch** — route to fallback state on error (`States.ALL` or specific error names):
```json
"Catch": [{
  "ErrorEquals": ["States.ALL"],
  "Next": "NotifyFailure",
  "ResultPath": "$.error"
}]
```

**Exam tip**: "On failure, notify and continue audit trail" → **Catch** to recovery branch, not failing entire account without handling.

## Wait for task token (human approval / external systems)
Task includes `TaskToken` in payload to Lambda/SNS/activity. Workflow **pauses** until:
- `SendTaskSuccess` with token, or
- `SendTaskFailure`, or
- timeout

Patterns:
- **Manual approval** via custom app or SSM Automation callback
- **External system** completes long job and signals Step Functions

Different from CodePipeline **Manual approval** (pipeline-native) — Step Functions token pattern is for **custom orchestration**.

## Service integrations (DevOps-relevant)
| Service | Typical workflow use |
| --- | --- |
| **Lambda** | Custom logic, API calls, small transforms |
| **CodeBuild** | Start build, wait for completion (sync) |
| **CodePipeline** | Start pipeline execution |
| **ECS / EKS** | Run task, sync |
| **SNS / SQS** | Notify, queue work; SQS + task token for workers |
| **DynamoDB** | GetItem/PutItem/UpdateItem in workflow |
| **EventBridge** | PutEvents |
| **SSM** | StartAutomationExecution |
| **CloudFormation** | CreateStack / delete / detect drift workflows |
| **Glue / Batch** | ETL job orchestration |
| **Nested Step Functions** | `StartExecution` on child state machine |

## Nested state machines
A **Task** can start another state machine — modular runbooks (e.g. `AccountSetup` calls `EnableLogging`, `EnableGuardDuty`).

Control Tower **AFC** and **CfCT** use Step Functions for multi-step provisioning.

## Activities (legacy awareness)
**Activities** require **workers** polling for tasks — exam favors **Lambda** or **service integrations** over activities unless question mentions external on-prem workers.

## Standard workflow durability
- State output persisted between steps — replay from last successful state on transient failures (with idempotent tasks).
- **Exactly-once** semantics for the **workflow execution** — design Task handlers to be **idempotent** where external side effects occur.

Express: optimize for speed/volume; assume **at-least-once** and idempotent tasks.

## Input and output processing
| Field | Effect |
| --- | --- |
| `InputPath` | Select portion of input |
| `Parameters` | Static + JSONPath dynamic params to Task |
| `ResultSelector` | Shape Task output |
| `ResultPath` | Merge result into state (`$`, `null`, or path) |
| `OutputPath` | What passes to next state |

**Exam trap**: Wrong `ResultPath` overwriting input — classic debugging scenario.

## Workflow patterns (exam narratives)

### Saga / compensation
On downstream failure, run **compensating tasks** (delete partial resources) via Catch branches.

### Sequential pipeline glue
```text
ValidateInput → StartBuild (sync) → DeployStaging → Approval (task token) → DeployProd
```

### Fan-out / fan-in
```text
GetItemList → Map(process each) → AggregateResults → Succeed
```

### Event-driven remediation
```text
EventBridge input → ParseFinding → Choice severity → Remediate → SNS → Succeed
```

## ASL exam scenarios
| Scenario | Construct |
| --- | --- |
| Branch on alarm severity | **Choice** |
| Run three unrelated actions at once | **Parallel** |
| Process each record in array | **Map** |
| Retry Lambda on throttle | **Retry** with backoff |
| Fallback on any error | **Catch** → `States.ALL` |
| Human clicks Approve in portal | **waitForTaskToken** |
| Wait 30 minutes before retry | **Wait** |
| Long CodeBuild then deploy | **Task** + CodeBuild **sync** |
