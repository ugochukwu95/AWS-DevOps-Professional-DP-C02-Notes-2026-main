# Incident response — DOP-C02 exam scenarios and traps

## High-value scenarios
| Scenario | Best answer |
| --- | --- |
| Access key committed to CodeCommit | **EventBridge** on repository event → **Step Functions** → Lambda **disable key** + **SNS** |
| GuardDuty HIGH severity finding | **EventBridge** rule on finding → Lambda containment / **Security Hub** workflow |
| Unauthorized security group change | **CloudTrail** (investigate) + **EventBridge** on API event for auto-revert (advanced) |
| S3 bucket became public | **Config** rule NON_COMPLIANT → **SSM Automation** or Config remediation |
| Need encrypted EBS on all volumes | **Config** rule + **automatic remediation** runbook |
| CloudWatch alarm: 5xx + runbook + PagerDuty-style notify | Alarm state → **EventBridge** → **Step Functions** (multi-step) |
| Alarm fires, email ops only | Alarm → **SNS** |
| Stop polling pipeline for Git changes | **EventBridge** → start CodePipeline |
| Failed pipeline prod deploy | EventBridge on pipeline → notify + **rollback stack** / previous artifact |
| CodeDeploy bad release | **CloudWatch alarm** triggers **CodeDeploy rollback** |
| Lambda bad version in prod | Move **alias** to prior **version** or rollback stack |
| DDoS on public API | **Shield** / **WAF** rate rules; not Config |
| Ops needs SSH-less break-glass to EC2 | **Session Manager** |
| Repeatable “detach IGW from public subnet” fix | **SSM Automation** document |
| Central security account collects member findings | **Security Hub** + **GuardDuty** delegation + **EventBridge** cross-account |
| Event target keeps failing silently | **DLQ** on rule + CloudWatch **FailedInvocations** |
| Reprocess events after fixing automation | EventBridge **archive & replay** |
| On-call escalation plan with runbook links | **Systems Manager Incident Manager** response plan |
| Prove who deleted production database | **CloudTrail** logs (and RDS events) |

## Wrong-answer distractors (traps)
| Trap | Why wrong |
| --- | --- |
| **AWS Config** to **instantly block** API calls | Config is **detective**; use **SCP/IAM/WAF** or **Lambda** for immediate action |
| **Config** for **real-time** credential revocation on git push | Too slow/indirect — use **EventBridge + Lambda/Step Functions** |
| **SNS only** when question lists **three** automated steps | Need **Step Functions** (or chained Lambda with orchestration gap) |
| **Lambda only** when question needs **approval branch** + multiple retries/audit | **Step Functions Standard** |
| **CloudWatch alarm** alone to **query** root cause | Use **Logs Insights**, **X-Ray**, **CloudTrail** |
| **EventBridge** instead of **CloudTrail** for “who made the API call” | CloudTrail is **audit**; EventBridge **reacts** to events |
| **Step Functions** for simple Config auto-remediate one runbook | **Config remediation** → **SSM Automation** is native |
| **OpsWorks** / manual cron on EC2 for scheduled security scan | **EventBridge schedule** → Lambda/Inspector |
| **Security Group** change compliance | **Config** detects; **remediation** fixes — not **Kinesis** |

## Severity and filtering
Exam scenarios often require **only HIGH/CRITICAL** actions:
- EventBridge pattern on `severity` field (GuardDuty, Security Hub)
- SNS **filter policy** on message body for tier-1 pages

## Idempotency and safety
Runbooks should tolerate **duplicate events** (EventBridge at-least-once delivery):
- Check if key already disabled before API call
- Use **conditional** updates (DynamoDB `ConditionExpression`)
- **Lifecycle hooks** / **canary** remediation on one resource before fleet-wide Automation

## Compliance vs incident timing
| Time horizon | Tool |
| --- | --- |
| Seconds (credential leak) | EventBridge + Lambda/SFN |
| Minutes (fleet patch, SG fix) | SSM Automation, Run Command with concurrency limits |
| Continuous governance | Config rules, conformance packs, **Firewall Manager** |

## Cross-domain links (other folders)
- **AWS Scaling** — incident symptom vs wrong scaling metric
- **CodeDeploy / CloudFormation** — rollback paths
- **AWS IAM** — compromise response, cross-account roles
- **AWS WAF** — edge incident containment

## Quick review checklist
- [ ] Config = detect/remediate **configuration**; not real-time API block
- [ ] EventBridge hub for service events and schedules
- [ ] Step Functions = multi-step IR with audit history
- [ ] SSM Automation = Config remediation & resource runbooks
- [ ] Exposed credentials = EventBridge → SFN/Lambda
- [ ] CloudTrail = who did what (investigation)
- [ ] Alarm notify only → SNS; alarm + runbook → EventBridge → SFN
- [ ] CodeDeploy rollback tied to CloudWatch alarm
- [ ] DLQ + FailedInvocations for automation reliability
- [ ] Incident Manager for escalation/response plans (awareness)
