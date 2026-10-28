# What is incident and event response on AWS?

On **DOP-C02**, “incident response” is mostly **automated event-driven operations**: detect an unwanted or risky condition, **notify**, **contain**, **remediate**, **audit**, and **recover** — using the right service for each step.

```text
Detect (logs, metrics, findings, compliance events)
        ↓
Decide (EventBridge pattern, alarm state, severity filter)
        ↓
Respond (Lambda, SSM Automation, Step Functions, rollback)
        ↓
Notify (SNS, chat, on-call)
        ↓
Learn (CloudTrail, Config history, Step Functions execution history)
```

**Exam mantra**: **Detective** tools record; **response** tools **act**. Do not pick **Config** when the question requires **immediate** API action (disable key, revoke access).

## Incident vs operational event
| Type | Examples | Typical trigger |
| --- | --- | --- |
| **Security incident** | Leaked access key, GuardDuty finding, unauthorized SG change | EventBridge, Security Hub, GuardDuty |
| **Reliability incident** | 5xx spike, queue backlog, RDS failover | CloudWatch alarms, Health events |
| **Compliance drift** | Unencrypted volume, public S3 ACL | **AWS Config** NON_COMPLIANT |
| **Deployment failure** | Pipeline failed, bad CloudFormation change | CodePipeline/CodeDeploy/CloudFormation events |

Same building blocks; different **source event** and **runbook**.

## Phases (map to AWS services)
| Phase | Goal | AWS tools (exam) |
| --- | --- | --- |
| **Prepare** | Runbooks, IAM roles, buses, DLQs | EventBridge, Step Functions, SSM documents, SNS topics |
| **Detect** | Know something went wrong | CloudWatch, GuardDuty, Config, CloudTrail, Security Hub, Canaries |
| **Analyze** | Scope and root cause | CloudWatch Logs Insights, X-Ray, Config timeline, CloudTrail Lookup |
| **Contain** | Limit blast radius | SG rules, WAF block, disable IAM key, isolate instance (SG/quarantine) |
| **Eradicate / remediate** | Fix cause | SSM Automation, Lambda, patch, redeploy good artifact |
| **Recover** | Restore service | Auto Scaling, Route 53 failover, rollback stack/alias |
| **Post-incident** | Audit and improve | CloudTrail, Config history, Well-Architected review |

You rarely need memorized NIST wording — match **scenario wording** to **service capability**.

## Real-time response vs after-the-fact audit
| Need | Service |
| --- | --- |
| “What changed on this SG yesterday?” | **CloudTrail** + **Config** history |
| “Block this attack pattern now” | **WAF** + automation (not Config alone) |
| “Auto-fix unencrypted EBS when detected” | **Config remediation** (SSM Automation) or EventBridge → Automation |
| “Disable exposed access key within seconds” | **EventBridge** → **Step Functions** / **Lambda** |

**Exam trap**: **Config** evaluates configuration **after** change; it does **not** substitute for **preventive** SCPs, **WAF**, or **real-time** credential revocation workflows.

## Human in the loop
| Pattern | When |
| --- | --- |
| **SNS / email / chat** | Notify on-call; human decides |
| **Manual approval** in CodePipeline | Prevent prod deploy during incident |
| **Step Functions `.waitForTaskToken`** | Approval before destructive remediation |
| **SSM Change Manager** | Approved change window for fleet commands |

**Exam tip**: “Notify **and** run remediation **and** log to DynamoDB” → **Step Functions**, not SNS-only.

## Multi-account security operations
```text
Member accounts (GuardDuty, Config, CloudTrail)
        ↓ aggregate
Security / audit account (Security Hub, central logging bucket, SIEM)
        ↓
EventBridge custom bus + rules
        ↓
Central runbooks (Step Functions, Lambda) with cross-account roles
```

**Delegated administrator** (Organizations) for GuardDuty, Security Hub, Config aggregators — see **Organizations** and **Config multi-account** notes.

## Rollback as incident recovery
| Stack | Rollback mechanism |
| --- | --- |
| **CloudFormation** | Stack **rollback** on failure; redeploy previous template version |
| **CodeDeploy** | Automatic rollback on **CloudWatch alarm** (EC2, ECS, Lambda) |
| **Lambda** | Move **alias** to previous **version** |
| **Elastic Beanstalk** | Redeploy previous **application version** |

Deployment incidents are fair game on DOP-C02 — not only “security” incidents.

## Related notes in this repo
- **EventBridge** — rules, buses, DevOps integrations
- **Step Functions** — multi-step runbooks
- **Systems Manager** — Automation, Run Command, Incident Manager (below)
- **AWS Config** — remediation, conformance packs
- **Amazon CloudWatch** — alarms, logs, canaries
- **AWS WAF / Shield** — attack response

Deeper patterns: **Services, patterns, and orchestration.md** and **DOP-C02 exam scenarios and traps.md**.
