# Incident response — services, patterns, and orchestration

## EventBridge — central nervous system
EventBridge connects **AWS service events**, **custom applications**, and **schedules** to **targets** (Lambda, Step Functions, SNS, SQS, Automation, CodePipeline, etc.).

```text
Event (GuardDuty, Config, CodeCommit, CloudWatch Alarm, Health, …)
        ↓
Rule on default or custom event bus (event pattern)
        ↓
Target(s) with IAM execution role
        ↓
Optional: input transformer, dead-letter queue (SQS)
```

**Exam tips**:
- **Replace CodePipeline source polling** → EventBridge on repository push.
- **Cross-account** response → **custom event bus** + resource policy in receiving account.
- **Failed target invocations** → **DLQ** + `FailedInvocations` metric.

## Step Functions — multi-step runbooks
Use **Standard** workflows when you need **audit trail**, **retries**, **branching**, and **long-running** incident flows.

Classic steps in one state machine:
1. Lambda — disable IAM access key / isolate resource
2. SNS — notify security
3. DynamoDB — write audit record
4. SSM `StartAutomationExecution` — remediate EC2/EBS
5. Optional — `.waitForTaskToken` for human approval

**When Lambda alone is enough**: single action, no branching — e.g. one Lambda disables a key.

**When SNS alone is enough**: notify only, no automated remediation.

## SSM Automation vs Step Functions
| | **SSM Automation** | **Step Functions** |
| --- | --- | --- |
| **Best for** | AWS resource ops runbooks (patch, attach volume, detach SG) | Cross-service orchestration, approvals, Lambda glue |
| **Config integration** | **Native Config remediation** target | Call Automation as one Task state |
| **Scope** | SSM-centric documents | General AWS SDK integrations |

**Exam tip**: Config NON_COMPLIANT → **one** SSM runbook → **Config remediation**. Needs **approval + ticket + multiple services** → **EventBridge → Step Functions**.

## AWS Config remediation
```text
Config rule evaluates resource → NON_COMPLIANT
        ↓
Remediation configuration (automatic or manual)
        ↓
SSM Automation document (parameters include resource ID)
        ↓
Re-evaluation → COMPLIANT (if fix succeeded)
```

Good for: encrypted volumes, restricted SG rules, required tags — **not** for sub-second credential revocation (use EventBridge + Lambda on API/commit events).

## CloudWatch — detect and trigger
| Feature | Incident use |
| --- | --- |
| **Alarms** | Metric threshold → SNS/Lambda/Auto Scaling action |
| **Alarm → EventBridge** | Richer orchestration than single alarm action |
| **Logs / Logs Insights** | Query errors during outage |
| **Anomaly detection** | Unusual metric behavior |
| **Canaries** | Synthetic failure before users report |
| **Composite alarms** | AND/OR of child alarms for paging policy |

**Exam trap**: Alarm → **multiple** coordinated actions (ticket + Lambda + SNS) → route **alarm state change** through **EventBridge → Step Functions**.

## GuardDuty, Security Hub, Inspector
| Service | Role in IR |
| --- | --- |
| **GuardDuty** | Threat detection findings → EventBridge |
| **Security Hub** | Aggregate findings; central response in security account |
| **Inspector** | Vulnerability findings (EC2, ECR, code repos) — often **scheduled** scan + EventBridge |

Pattern: `detail-type: GuardDuty Finding` with severity filter → Lambda quarantine / SNS page.

## CloudTrail — investigation (and some real-time patterns)
- **Who** called `AuthorizeSecurityGroupIngress`? → CloudTrail **LookupEvents** / Athena on trail S3.
- **Real-time** response to API activity → **CloudTrail → EventBridge** (management events) for rules like “root login” or “DeleteTrail”.

CloudTrail is the **audit** backbone; pair with **automated** targets for response.

## SNS and notifications
- **SNS topic** for on-call email/SMS/lambda/chat (AWS Chatbot subscribes to SNS).
- **Filter policies** on subscriptions — route severity-specific topics.
- SNS is **fan-out notify**; not a workflow engine.

## Systems Manager operational tools
| Feature | IR use |
| --- | --- |
| **Run Command** | Ad hoc or scripted fleet action (collect logs, stop service) |
| **Automation** | Repeatable remediation documents |
| **Session Manager** | Break-glass access without SSH/bastion |
| **Incident Manager** | **Response plans**, escalation contacts, chat channels, runbook links |
| **OpsCenter** | OpsItems from CloudWatch/EventBridge — operational issue tracking |

**Exam awareness**: “Coordinated on-call escalation with runbooks” may point to **SSM Incident Manager** response plans — not just raw SNS email.

## Exposed credentials (classic exam workflow)
```text
CodeCommit / Git push (or security scanner event)
        ↓
EventBridge rule
        ↓
Step Functions Standard
        ├── Lambda: DeleteAccessKey / DeactivateUser
        ├── SNS: security team
        └── Optional: Secrets Manager rotation trigger
        ↓
CloudTrail logs API calls for audit
```

**Wrong answers**: Config rule only; CloudWatch metric; Config remediation on IAM user (too slow/wrong tool for “immediate”).

## Deployment and pipeline incidents
```text
CodePipeline stage FAILED
        ↓
EventBridge on aws.codepipeline
        ↓
Step Functions: notify + rollback CloudFormation stack / revert Lambda alias
```

**CodeDeploy** automatic rollback when **CloudWatch alarm** on ELB 5xx or custom metric — ties **monitoring** to **recovery**.

## WAF and Shield (availability / abuse)
- **WAF** rate-based rule block during HTTP flood — attach to CloudFront/ALB/API Gateway.
- **Shield Advanced** + DRT for large DDoS; **Firewall Manager** enforces WAF baseline org-wide.

Use when scenario is **attack traffic**, not misconfigured IAM.

## EventBridge archive and replay
After fixing a broken rule or permission, **replay** archived events to reprocess missed incidents — exam niche but valid “recovery of automation.”

## IAM for response automation
| Role | Trust | Purpose |
| --- | --- | --- |
| **EventBridge target role** | `events.amazonaws.com` | Invoke Lambda/SFN/SNS |
| **Step Functions execution role** | `states.amazonaws.com` | Call integrated services |
| **Lambda execution role** | `lambda.amazonaws.com` | Narrow IAM API for containment |
| **SSM Automation role** | `ssm.amazonaws.com` | Runbooks on resources |

**Least privilege**: credential-revocation Lambda needs specific `iam:UpdateAccessKey`; avoid `iam:*` unless question demands it.

## Choosing a pattern (quick table)
| Scenario | Primary design |
| --- | --- |
| Single Lambda disable key | EventBridge → **Lambda** |
| Disable key + notify + audit table | EventBridge → **Step Functions** |
| Fix noncompliant S3 encryption | **Config remediation** → SSM |
| Weekly Inspector scan | **EventBridge schedule** → Lambda |
| Alarm → page only | Alarm → **SNS** |
| Alarm → page + remediate + ticket | Alarm → **EventBridge** → **Step Functions** |
| Investigate API caller | **CloudTrail** |
| Synthetic prod outage detection | **CloudWatch Synthetics canary** |

See **DOP-C02 exam scenarios and traps.md** for more stems.
