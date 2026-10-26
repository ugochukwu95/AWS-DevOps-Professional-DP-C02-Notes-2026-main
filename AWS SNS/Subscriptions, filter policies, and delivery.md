# Subscriptions, filter policies, and delivery

## Subscription lifecycle
1. Create subscription (topic + protocol + endpoint).
2. **Confirm** subscription (email/SMS/HTTP)—unless same-account SQS or Lambda.
3. SNS delivers each published message to confirmed subscribers.

Unconfirmed subscriptions do not receive messages.

## Raw message delivery
By default, SQS/Lambda/HTTP subscribers receive an SNS **envelope** (metadata + nested `Message` field).

Enable **raw message delivery** on the subscription when the subscriber expects only the original payload (common for SQS workers parsing application JSON).

## Filter policies
Subscribers can attach a **filter policy** so they receive **only matching messages**—without creating separate topics.

Filter on:
- **Message attributes** (recommended—typed, filterable)
- **Message body** (JSON filtering for structured payloads)

Example—only critical alerts:
```json
{
  "severity": ["CRITICAL", "HIGH"]
}
```

Publisher must include matching **message attributes** when publishing.

**Exam tip**: **One topic, many teams, different alert levels** → single SNS topic + **per-subscription filter policies**. Do not create a topic per team unless isolation is required.

## Fan-out patterns
### SNS → multiple SQS queues (classic)
```text
Publisher → SNS topic → SQS queue A (billing team)
                     → SQS queue B (ops team)
                     → Lambda (auto-remediation)
                     → Email (on-call)
```

Benefits:
- Decoupled, parallel processing
- Each queue buffers independently
- Failed processing in one queue does not block others

SQS queue policy must allow SNS to `sqs:SendMessage`.

### SNS → Lambda
- Lambda receives SNS event wrapper (unless raw delivery).
- Use for lightweight transforms, notifications, or triggering downstream APIs.
- Configure **DLQ** on Lambda for failed invocations.

### SNS → HTTP/HTTPS
- SNS POSTs to your endpoint with retries and exponential backoff.
- Endpoint must respond quickly (timeout); process async in app.
- Enable **delivery status logging** to CloudWatch Logs/S3 for troubleshooting.

## Retries and dead-letter queues
| Protocol | Retry behavior | DLQ support |
| --- | --- | --- |
| HTTP/S | Exponential backoff over ~24 hours | Redrive to SQS DLQ (subscription-level) |
| Lambda | Lambda service retry + async DLQ | Lambda DLQ |
| SQS | SNS retries until SQS accepts | SQS visibility timeout handles consumer failures |
| Email/SMS | Limited retries | No DLQ |

For HTTP/S subscriptions, configure a **dead-letter queue** (SQS) to capture messages that fail delivery after retries.

## Message size and attributes
- Max message size: **256 KB**
- Large payloads: store in S3, publish a reference link in the SNS message
- **Message attributes**: metadata for filtering (String, String.Array, Number, Binary)
- FIFO: deduplication ID + message group ID required

## SMS considerations (exam awareness)
- SMS messages have length limits and **per-account spending limits**.
- Some regions require opt-in/out compliance.
- Prefer SMS for critical paging; use email/Chatbot for detailed context.

## Amazon Q / Chatbot integration
SNS topics commonly feed **AWS Chatbot** (Slack/Microsoft Teams) for operational alerts from CloudWatch, CodePipeline, and GuardDuty—exam scenario: "notify DevOps channel in Slack" → SNS + Chatbot.
