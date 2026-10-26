# DevOps integrations and exam scenarios

## CI/CD integrations
| Source | Event / pattern | Common action |
| --- | --- | --- |
| **CodePipeline** | Stage/action execution state change | Notify SNS; block deploy on failure |
| **CodePipeline** | Manual approval needed | Custom rule on approval `STARTED` → SNS to approvers |
| **CodeCommit** | Repository state change | Trigger pipeline (replace polling) |
| **CodeBuild** | Build state change | Notify team; trigger downstream pipeline |
| **ECR** | Image scan completed | Block deploy if critical findings |
| **Image Builder** | Image pipeline state change | Trigger compliance scan or promotion |

CodePipeline **notification rules** = managed EventBridge rules → SNS only. For Lambda, Step Functions, or granular patterns, create your own rule on `aws.codepipeline`.

Replace **`pollForSourceChanges: true`** with EventBridge-triggered pipeline starts when the question emphasizes **real-time, event-driven** CI/CD.

## Security and compliance
| Scenario | EventBridge pattern |
| --- | --- |
| Exposed credentials in CodeCommit | Rule on commit → Step Functions → disable keys + SNS |
| GuardDuty finding | `aws.guardduty` Finding → Lambda remediation or Security Hub workflow |
| AWS Config compliance change | Config rule NON_COMPLIANT → SSM Automation or Step Functions |
| CloudTrail API activity | Event data in CloudTrail; integrate with EventBridge for real-time response (e.g., unauthorized SG change) |
| Security Hub findings | Central account aggregation → EventBridge → ticketing |

**Credential exposure workflow (classic exam)**:
```text
CodeCommit push event → EventBridge rule → Step Functions
  → Lambda disables access key → SNS alerts security team
```

## Operations and monitoring
| Scenario | Solution |
| --- | --- |
| CloudWatch alarm → multi-step fix | Alarm state change event → EventBridge → Step Functions |
| EC2 instance state change | `aws.ec2` state-change → notify or auto-tag |
| Auto Scaling lifecycle | Launch/terminate events → custom action via Lambda |
| RDS failover | RDS event → SNS/on-call via EventBridge |
| AWS Health event | `aws.health` → notify ops of upcoming maintenance |
| Inspector recurring scan | Schedule rule → Lambda → `StartAssessmentRun` |

## Choose the right approach
| Requirement | Answer |
| --- | --- |
| Run Lambda every 7 days | EventBridge **schedule rule** |
| Trigger pipeline when object uploaded to S3 | S3 EventBridge integration → rule → CodePipeline |
| Notify on any pipeline failure | EventBridge rule on CodePipeline FAILED (or notification rule → SNS) |
| Multi-step incident response | EventBridge → **Step Functions** |
| Route events from 10 workload accounts to security account | **Custom event bus** + cross-account policy in security account |
| Filter events before Lambda without polling SQS | **EventBridge Pipes** (SQS/Kinesis source) |
| Simple email when alarm fires | CloudWatch alarm → **SNS** (EventBridge optional) |
| Audit who changed a security group | **CloudTrail** (not EventBridge alone) |
| Reprocess events after fixing a rule | EventBridge **archive and replay** |

## EventBridge vs CloudWatch alarm actions
| CloudWatch alarm action | EventBridge |
| --- | --- |
| SNS, Lambda, EC2 action, Auto Scaling | Any supported target + pattern across event sources |
| Fires on metric state transition only | Reacts to any event on the bus |
| Single action per transition (unless composite) | Multiple targets; input transformation |

Use **both**: alarm detects the problem; EventBridge orchestrates the response across services and accounts.

## Common exam scenarios
- **Stop polling CodePipeline for Git changes** → EventBridge rule on source provider event triggers pipeline.
- **Approval required before prod deploy** → manual approval action in pipeline; EventBridge notifies approvers on approval `STARTED`.
- **Auto-disable leaked IAM key** → EventBridge + Step Functions + Lambda (not Config—Config records, does not block API calls in real time).
- **Weekly vulnerability scan** → schedule rule → Lambda → Inspector API.
- **Config NON_COMPLIANT encrypted volume** → Config sends compliance change → EventBridge → SSM Automation remediation (or native Config remediation for simpler cases).
- **Multiple teams need different reactions to same S3 upload** → S3 → EventBridge with separate rules per team pattern.
- **Cross-account pipeline monitoring** → workload account forwards events or central account receives via bus policy.
- **Failed EventBridge target delivery** → configure **DLQ** (SQS) and CloudWatch metrics on invocations/failures.
- **CloudWatch alarm should open ticket and run runbook** → route alarm event to Step Functions, not alarm → Lambda only when branching needed.

## Troubleshooting checklist
1. Is the event reaching the **correct bus** (default vs custom)?
2. Does the **event pattern** match the actual event JSON (`source`, `detail-type`, `detail`)?
3. Is the rule **enabled**?
4. Does the **target execution role** trust `events.amazonaws.com` and allow the invoke action?
5. For cross-account: does the **bus resource policy** allow the publisher?
6. Check **CloudWatch metrics** for `FailedInvocations` and inspect **DLQ** messages.

## IAM quick reference
EventBridge assumes an IAM role to invoke targets. Example trust:
```json
{
  "Effect": "Allow",
  "Principal": { "Service": "events.amazonaws.com" },
  "Action": "sts:AssumeRole"
}
```

Publisher needs `events:PutEvents` on the bus ARN. Cross-account publishers need an explicit allow on the **destination bus policy**.
