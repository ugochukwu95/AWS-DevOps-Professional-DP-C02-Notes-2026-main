# Security, encryption, and access control

## Access control model
SNS uses **IAM policies** and **topic policies** (resource-based).

| Policy type | Controls |
| --- | --- |
| **Topic policy** | Who can `Publish`, `Subscribe`, `Receive`, manage the topic |
| **IAM policy** | What principals can do on which topic ARNs |
| **Subscription** | Confirmed endpoint receives messages |

Both topic policy **and** IAM must allow the action unless policy evaluation grants access through explicit allow on one side with no deny.

## Common topic policy patterns
| Scenario | Policy element |
| --- | --- |
| Allow CloudWatch alarms to publish | `Principal: Service: cloudwatch.amazonaws.com` |
| Allow EventBridge to publish | `Principal: Service: events.amazonaws.com` |
| Cross-account publish | Allow external account root/role `sns:Publish` |
| Restrict publish to one role | `aws:SourceArn` or `aws:PrincipalArn` condition |

**Exam tip**: Alarm cannot notify SNS → check **topic policy** allows CloudWatch service and **alarm action** references correct topic ARN.

## Encryption at rest (SSE)
| Option | Detail |
| --- | --- |
| AWS managed key (`alias/aws/sns`) | Default SSE; AWS manages rotation |
| Customer managed KMS key (CMK) | You control key policy, rotation, cross-account |

When using a CMK:
- Publishers need `kms:GenerateDataKey` and `kms:Decrypt`
- Subscribers (Lambda, SQS with encryption) need decrypt permissions on the same CMK
- Cross-account encrypted SNS → coordinate **topic CMK key policy** with subscriber accounts

## Encryption in transit
HTTPS endpoints for HTTP/S subscriptions; TLS for API calls.

## Cross-account access
```text
Account A (publisher)          Account B (subscriber)
─────────────────────          ──────────────────────
Topic policy allows            SQS policy allows SNS from Account A
Account B to subscribe    +    IAM allows Account B app to read queue
```

Cross-account **SNS → SQS** requires:
1. Topic policy allows Account B to subscribe (or subscription created from B with permission)
2. SQS queue policy allows SNS service to `SendMessage`
3. If encrypted: KMS key policies on both sides

## Least-privilege IAM actions
| Action | Purpose |
| --- | --- |
| `sns:Publish` | Send messages |
| `sns:Subscribe` | Create subscription |
| `sns:Receive` | Receive (some protocols) |
| `sns:SetTopicAttributes` | Configure topic |
| `sns:CreateTopic`, `sns:DeleteTopic` | Admin |

Prefer scoping policies to specific topic ARNs, not `*`.

## Monitoring and audit
| Tool | Use |
| --- | --- |
| **CloudWatch metrics** | `NumberOfMessagesPublished`, `NumberOfNotificationsFailed`, `NumberOfNotificationsDelivered` |
| **CloudWatch Logs** | Delivery status logging for HTTP/S, Lambda, SQS, etc. |
| **CloudTrail** | API audit (`Publish`, `Subscribe`, policy changes) |
| **X-Ray** | Trace message flows (when integrated) |

Create alarms on **`NumberOfNotificationsFailed`** for production alert topics.

## Message data protection
- Do not put secrets in SNS messages—use references to Secrets Manager or encrypted S3 objects.
- Use **message attributes** for routing metadata, not sensitive payloads.
- Combine with **TLS** webhooks and verify SNS signature on HTTP endpoints (SignatureVersion, SigningCertURL validation).
