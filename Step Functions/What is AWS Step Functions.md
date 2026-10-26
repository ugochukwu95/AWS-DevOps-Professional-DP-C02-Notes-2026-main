# What is AWS Step Functions?

AWS Step Functions is a **serverless workflow orchestration** service. You define **state machines** in **Amazon States Language (ASL)** JSON; Step Functions coordinates **Lambda**, **AWS SDK service integrations**, and **human/callback** steps with built-in **retries, branching, and error handling**.

Step Functions answers: **"How do we run a multi-step process with clear order, failure handling, and visibility without writing orchestration code in one giant Lambda?"**

## Standard vs Express workflows (exam-critical)

| | **Standard** | **Express** |
| --- | --- | --- |
| **Duration** | Up to **1 year** per execution | Up to **5 minutes** |
| **Execution semantics** | **Exactly-once** workflow execution (durable) | **At-least-once** — suited for high volume |
| **History** | Full execution history in console/API | CloudWatch Logs only (no full history in console) |
| **Use case** | Approvals, ETL orchestration, incident response, long jobs | High-throughput streaming, IoT, short integrations |
| **Pricing model** | Per **state transition** | Per **execution**, duration, and memory |

**Exam tip**: "Orchestrate credential revocation with audit trail and multiple steps over minutes" → **Standard**. "Process millions of short events per day" → **Express**.

Express can run **synchronously** (StartSyncExecution — return result to caller) or **asynchronously**.

## Core concepts

| Concept | Purpose |
| --- | --- |
| **State machine** | Workflow definition (ASL) |
| **Execution** | One run of the state machine with input JSON |
| **State** | Single step (Task, Choice, Parallel, …) |
| **Transition** | Next state after success/failure |
| **Execution role** | IAM role Step Functions assumes to invoke services |

```text
EventBridge / API / CodePipeline
        ↓
StartExecution
        ↓
State machine (Standard or Express)
        ↓
Task → Choice → Parallel → Task → Succeed/Fail
```

## State types (overview)

| State | Purpose |
| --- | --- |
| **Task** | Do work — invoke Lambda, AWS service, activity |
| **Choice** | Branch on input/variables |
| **Parallel** | Run branches concurrently; wait for all |
| **Map** | Iterate over array (inline or **distributed** for large scale) |
| **Wait** | Delay until time or duration |
| **Pass** | Inject/transform JSON without calling a service |
| **Succeed / Fail** | Terminal states |
| **Wait for callback** | Task with `.waitForTaskToken` — human or external system completes |

Details in `States Language, patterns, and service integrations.md`.

## Step Functions vs related services

| Requirement | Service |
| --- | --- |
| Multi-step workflow with retries and branching | **Step Functions** |
| Single short function on event | **Lambda** alone |
| Decouple producer/consumer, no orchestration graph | **SQS** |
| Fan-out notifications | **SNS** |
| Route events to targets | **EventBridge** (often **starts** Step Functions) |
| Run SSM document on instance | **SSM Automation** (Step Functions can invoke it) |
| Visual CI/CD release pipeline | **CodePipeline** (different domain) |
| Long-running human approval in CFN | **CloudFormation wait conditions** (legacy pattern) |

**Exam tip**: **EventBridge** detects the event; **Step Functions** orchestrates **multiple** downstream actions with error handling.

## Common DevOps use cases

- **Incident response**: Config NON_COMPLIANT → remediate → notify → ticket
- **Exposed credentials**: CodeCommit push → disable keys → SNS security team
- **CloudWatch alarm** → EventBridge → Step Functions runbook
- **Data processing**: Map over S3 objects; invoke Lambda per item
- **CI/CD glue**: Start CodeBuild, wait, deploy via CodeDeploy/CloudFormation with gates
- **Account Factory Customization (AFC)**: Step Functions + Lambda after account vending

## Observability

- **Standard**: Execution history per state (input/output, retries, errors)
- **CloudWatch Logs** — optional logging for Express and Standard
- **CloudWatch Metrics** — executions started/succeeded/failed/timed out
- **X-Ray** tracing (when enabled) for service integration calls

## Pricing awareness (exam level)

- **Standard**: charged per **state transition** (each state entered counts)
- **Express**: per execution + duration/memory
- Optimize with **Pass** states judiciously; use **Express** for high-volume short flows

## Security

- **Execution role** — least privilege for only APIs the workflow needs
- Input/output may contain sensitive data — restrict CloudWatch Logs access
- **AWS KMS** can encrypt execution history and logs (where configured)

See `States Language, patterns, and service integrations.md` and `DevOps integrations, security, and exam scenarios.md`.
