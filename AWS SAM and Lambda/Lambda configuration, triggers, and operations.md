# Lambda configuration, triggers, and operations

## Function configuration (high-yield)
| Setting | Exam notes |
| --- | --- |
| **Memory** | 128 MB–10 GB; **CPU scales with memory** |
| **Timeout** | Max **15 minutes** (900 s) |
| **Ephemeral storage (`/tmp`)** | Configurable (512 MB–10 GB) |
| **Runtime** | Managed runtimes or **container image** (same invoke model) |
| **Handler** | `file.function` for zip deployments |
| **Execution role** | Required; grants AWS API access and **CloudWatch Logs** |
| **Environment variables** | Optional **KMS encryption**; avoid secrets in plain env vars |
| **Layers** | Shared libraries; max **5 layers**; order matters |
| **VPC** | Attach subnets + security groups to reach private RDS/ElastiCache |

## Invocation types
| Type | Examples | Caller behavior |
| --- | --- | --- |
| **Synchronous** | API Gateway, ALB, Lambda URL, direct invoke | Waits for response; errors returned to caller |
| **Asynchronous** | S3, SNS, EventBridge (default) | Lambda queues event; retries on failure |
| **Poll-based** | SQS, DynamoDB streams, Kinesis | Lambda service polls source |

## Error handling
| Feature | Use |
| --- | --- |
| **Retry** | Async invocations retry (with backoff) on failure |
| **Dead-letter queue (DLQ)** | SQS or SNS for **failed async** events after retries |
| **On-failure destination** | Route failed events to SQS, SNS, Lambda, or EventBridge |
| **Destination (success/failure)** | General event routing for async invokes |

**Exam tip**: "Don't lose failed S3-triggered events" → configure **DLQ** or **on-failure destination** on the function.

## Concurrency
| Concept | Meaning |
| --- | --- |
| **Account concurrency limit** | Regional cap (can request increase) |
| **Reserved concurrency** | Guaranteed cap **for this function**; also **limits max** concurrent runs |
| **Provisioned concurrency** | Pre-warmed execution environments—reduces cold start for steady load |
| **Throttling** | `429` when concurrency exhausted |

**Exam tip**: "Prevent one Lambda from consuming entire account concurrency" → **reserved concurrency** on that function. "Eliminate cold starts for prod API" → **provisioned concurrency** on alias.

## Versions and aliases
| | `$LATEST` | **Version** | **Alias** |
| --- | --- | --- | --- |
| Mutable | Yes | No (immutable snapshot) | Points to version(s) |
| Use in prod | Avoid for traffic shifting | Publish after test | **PROD**, **LIVE**, etc. |

Aliases support **weighted routing** (e.g. 90% v5, 10% v6) for canary/blue-green with **CodeDeploy**.

## VPC networking
```text
Lambda in VPC → ENIs in subnets → private RDS
```

Requirements:
- **Subnets** (often private) + **security group**
- **IAM**: `AWSLambdaVPCAccessExecutionRole` (or equivalent)
- Outbound access to AWS APIs: **NAT gateway** or **VPC endpoints** (S3, DynamoDB, Logs, etc.)

Trade-off: **cold starts** can increase when ENIs are created.

## Security
- **Execution role**: least privilege per function
- **Resource-based policies**: allow API Gateway, S3, SNS to invoke function
- **KMS**: encrypt env vars and optionally **async payloads**
- **Code signing** (optional): only signed deployment packages deploy
- **CloudTrail** logs control-plane API calls; **CloudWatch Logs** for function output

## Observability
- Automatic log group `/aws/lambda/<function-name>`
- **CloudWatch metrics**: Invocations, Errors, Duration, Throttles, ConcurrentExecutions, IteratorAge (streams)
- **Lambda Insights** / **X-Ray** for traces and enhanced metrics
- **Alarms** on Errors, Duration, Throttles → SNS/EventBridge

## Lambda vs Lambda@Edge / CloudFront Functions
| | **Lambda (Regional)** | **Lambda@Edge** | **CloudFront Functions** |
| --- | --- | --- | --- |
| Use | APIs, backends, data processing | CDN request/response manipulation | Lightweight viewer requests |
| Runtime | Full runtimes | Restricted Node/Python at edge | JS subset, sub-ms |

DP-C02 focus is **Regional Lambda** + deployment patterns; edge is niche unless question mentions CloudFront.

## Package types
| | **Zip** | **Container image** |
| --- | --- | --- |
| Deploy | Upload to S3 / inline in SAM build | Push to **ECR** |
| Size limit | 250 MB unzipped (50 MB direct upload) | Up to **10 GB** image |
| CI/CD | `sam build`, CodeBuild zip | CodeBuild → ECR → update function image URI |
