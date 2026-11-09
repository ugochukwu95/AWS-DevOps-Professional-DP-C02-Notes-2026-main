# Security, encryption, and access control

## Encryption at rest
| Mode | Description |
| --- | --- |
| **SSE-SQS** | **Amazon SQS-managed keys** (default encrypted queues); simple operational model |
| **SSE-KMS** | **Customer-managed or AWS-managed KMS keys**; centralized key policies, rotation, audit via CloudTrail |

With **SSE-KMS**:
- Producers need permission to **encrypt** (e.g. `kms:GenerateDataKey`, `kms:Decrypt` depending on API path).
- Consumers need **decrypt** permissions for the CMK.
- Cross-account use requires both **queue policy** and **KMS key policy** trust.

**Exam tip**: “Central security team controls keys with full CloudTrail” → **SSE-KMS** with **CMK** and explicit key policies.

## Encryption in transit
- Use **HTTPS/TLS** for all API calls (`https://sqs.<region>.amazonaws.com`).
- **VPC interface endpoints** for SQS use AWS PrivateLink; traffic stays within the AWS network from your VPC.

## Access control (IAM + queue policies)
| Mechanism | Use |
| --- | --- |
| **IAM identity policies** | Users/roles in your account: `sqs:SendMessage`, `sqs:ReceiveMessage`, `sqs:DeleteMessage`, `sqs:GetQueueAttributes`, etc. |
| **Queue policy (resource-based)** | **Cross-account** access, **SNS → SQS**, **EventBridge → SQS**, **Lambda** service principals |

Classic **SNS to SQS**:
- Queue policy must allow **SNS topic** principal **`sqs:SendMessage`** (often scoped to topic ARN).
- SNS topic policy must allow **publish** to subscribed SQS.

**Least privilege**: Scope actions to specific queue ARNs; avoid `Resource: "*"`.

## VPC and network isolation
- **Interface VPC endpoint** (`com.amazonaws.region.sqs`) for private subnets without internet.
- Queue policy can **restrict** by **aws:SourceVpce** or **IP** conditions for defense in depth (not a substitute for auth).

**Exam tip**: “Subnets have no NAT; workers need SQS” → **VPC endpoint** + IAM; ensure **security groups** and **endpoint policies** allow required principals.

## Compliance and auditing
- **CloudTrail** logs API calls (management and data events if enabled for data plane as needed for your audit story).
- **KMS** key usage appears in CloudTrail for CMKs.

## Dead-letter queues and least privilege
- DLQ is a normal queue: apply **same encryption** and **access** policies as sensitivity requires.
- Restrict who can **read DLQ** (often security/operations only) since it may contain **failed sensitive payloads**.

## What exam questions often test
- **Cross-account SQS**: **queue policy** on destination + identity policy on sender.
- **Encrypted SNS → encrypted SQS**: both sides’ KMS policies + topic/queue policies aligned.
- **Private connectivity**: **VPC endpoint**, not “open security group to public internet.”

Confirm exact IAM action names and condition keys in current AWS documentation when implementing in production.
