# Step Functions DevOps integrations, security, and exam scenarios

## EventBridge → Step Functions (most common exam trigger)
```text
AWS service event (Config, GuardDuty, CodeCommit, CloudWatch Alarm, CodePipeline, …)
        ↓
EventBridge rule (pattern match)
        ↓
Target: Step Functions StartExecution
        ↓
Standard state machine runs remediation / workflow
```

EventBridge needs an **IAM role** allowing `states:StartExecution` on the state machine ARN.

**Why not Lambda only?** Multiple steps, retries, branching, and visual audit in **Standard** history — Lambda would reimplement orchestration.

## Classic exam workflow: exposed credentials
```text
CodeCommit repository state change (or Git push event)
        ↓
EventBridge rule (detect credential pattern or security tool finding)
        ↓
Step Functions Standard workflow
        ├── Task: Lambda — disable IAM access key / rotate secret
        ├── Task: SNS — notify security team
        └── Task: SSM / ticket integration (optional)
        ↓
Succeed
```

Related notes in your repo: **EventBridge DevOps integrations**, **5.Incident and event response.md**.

**Exam trap**: **AWS Config** records compliance — it does **not** real-time block API calls. **EventBridge + Step Functions** for **immediate** response.

## CloudWatch alarms
Alarm actions can go to SNS/Lambda directly.

For **multi-step** runbooks (create ticket + run Lambda + update DynamoDB audit table):
```text
CloudWatch Alarm State Change
        ↓
EventBridge (recommended) or alarm → EventBridge integration
        ↓
Step Functions
```

**Exam tip**: "Alarm fires → SNS **and** run remediation Lambda **and** log incident" → **Step Functions**, not SNS alone.

## AWS Config and compliance
| Approach | Use |
| --- | --- |
| **Config remediation** | Single SSM Automation runbook on NON_COMPLIANT |
| **EventBridge + Step Functions** | Approval branch, multiple services, enrichment |

From Config notes: use native remediation for direct runbook; Step Functions when workflow needs **approvals, branching, or multiple services**.

## CodePipeline integration
- CodePipeline **Invoke** can trigger Lambda; **Step Functions** often started by **EventBridge** on pipeline events (failed stage, approval needed).
- **Notification rules** → SNS only — for Step Functions on pipeline failure, use **EventBridge** on `aws.codepipeline` events.

Pattern:
```text
Pipeline FAILED (prod stage)
        ↓
EventBridge
        ↓
Step Functions → rollback CloudFormation / notify / open change
```

## SSM Automation vs Step Functions
| | **SSM Automation** | **Step Functions** |
| --- | --- | --- |
| Focus | Operational runbooks on AWS resources | General orchestration |
| Config remediation | Native integration | Via Task calling StartAutomationExecution |
| Cross-service logic | Limited compared to SFN | Lambda + many SDK integrations |

**Exam tip**: Config rule auto-remediate with one runbook → **SSM Automation**. Complex incident flow → **Step Functions**.

## IAM security
| Role | Purpose |
| --- | --- |
| **State machine execution role** | Permissions for **service integrations** (Lambda invoke, SNS publish, CodeBuild start, etc.) |
| **EventBridge target role** | `states:StartExecution` |
| **Lambda task role** | Separate from SFN — Lambda's own role for AWS API calls inside function |

Least privilege:
- Scope `lambda:InvokeFunction` to specific ARNs
- Scope `sns:Publish` to specific topics
- Avoid `*` on `iam:*` in execution role unless runbook requires it (credential revocation does)

CloudTrail logs `StartExecution`, `StartSyncExecution`, and API calls made via integrations.

## Logging and debugging
- Enable **ALL** or **ERROR** level logging to CloudWatch Logs
- **Standard** execution history — inspect failed state input/output
- **Express** — rely on CloudWatch Logs metrics
- **X-Ray** for tracing service integration latency

## Express vs Standard selection (decision table)
| Signal | Choose |
| --- | --- |
| Need full execution history in console | **Standard** |
| Workflow > 5 minutes | **Standard** |
| Human task token over hours | **Standard** |
| Millions of short workflows/day | **Express** |
| Synchronous API needs immediate JSON result | **Express** sync |
| Exactly-once execution audit for compliance | **Standard** |

## Step Functions vs SQS + Lambda
| SQS + Lambda | Step Functions |
| --- | --- |
| Simple queue consumer | Defined graph with explicit order |
| Hard to express branching visually | **Choice**, **Parallel**, **Map** native |
| Manual retry/DLQ config | Built-in **Retry/Catch** |

**Exam tip**: "Orchestrate" or "workflow" or "multiple steps with branching" → **Step Functions**.

## High-value exam scenarios
| Scenario | Correct approach |
| --- | --- |
| Disable leaked IAM key + notify security | **EventBridge** → **Step Functions** → Lambda + SNS |
| Multi-step fix after CloudWatch alarm | EventBridge → **Step Functions** |
| Wait for CodeBuild then deploy | Step Functions **Task** CodeBuild **sync** |
| Process 10,000 S3 keys in parallel batches | **Distributed Map** |
| Approve prod deploy from custom portal | **waitForTaskToken** |
| High-volume IoT events < 5 min each | **Express** workflow |
| Audit every state transition for compliance | **Standard** workflow |
| Config NON_COMPLIANT → one SSM runbook | **Config remediation** (not SFN unless multi-step) |
| Route Git push to complex runbook | **EventBridge** → Step Functions |
| Retry throttled downstream calls | **Retry** with backoff in ASL |

## Exam traps
- **Lambda alone** is wrong when question requires **orchestration**, **parallel branches**, or **visual audit trail** (Standard).
- **Express** for long-running or human approval over hours — wrong (**Standard**).
- **CodePipeline manual approval** ≠ Step Functions — different products; both can appear in same enterprise story.
- **Step Functions does not replace CodePipeline** for canonical build/test/deploy pipeline UX.
- **At-least-once** on Express — tasks must be **idempotent**.
- **EventBridge** starts execution; Step Functions does not replace event **routing** — bus/rule still needed.
- **SWF** — legacy; modern answer is **Step Functions**.

## Integration map (quick reference)
```text
EventBridge ──► Step Functions ──► Lambda
                         ├── SNS / SQS
                         ├── CodeBuild / CodePipeline
                         ├── SSM Automation
                         ├── DynamoDB (audit)
                         └── Nested state machine
```

## Review checklist
- [ ] Standard vs Express (duration, semantics, history)
- [ ] Task, Choice, Parallel, Map, Wait, Pass
- [ ] Retry vs Catch
- [ ] waitForTaskToken pattern
- [ ] .sync integrations (wait for job)
- [ ] EventBridge as trigger + IAM roles
- [ ] Credential exposure workflow
- [ ] Config remediation vs Step Functions
- [ ] vs Lambda-only vs SQS
- [ ] Idempotency for Express and retried Tasks
