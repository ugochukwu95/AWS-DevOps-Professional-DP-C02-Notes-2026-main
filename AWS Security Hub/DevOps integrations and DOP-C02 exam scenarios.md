# Security Hub — DevOps integrations and DOP-C02 exam scenarios

## EventBridge integration
Security Hub sends findings to **Amazon EventBridge** (default event bus).

Typical pattern:
```text
Security Hub Finding (or GuardDuty via Hub)
        ↓
EventBridge rule: severity CRITICAL/HIGH, ProductName, Type
        ↓
Targets: SNS (page), Lambda (contain), Step Functions (runbook)
```

Also react to **Security Hub** compliance change events when scenarios mention **standards** status updates.

**Exam tip**: Filter on **severity** and **ProductArn** so GuardDuty CRITICAL pages but LOW goes to ticket only.

Compare **GuardDuty Finding** events directly vs routing via Hub — both appear in exam materials; **central org design** favors Hub aggregation + one EventBridge pattern in the **admin account**.

## SNS and on-call
- **SNS topic** subscribed by email, SMS, Lambda, or **AWS Chatbot**.
- **Filter policies** on subscriptions for `Severity` in message body (when JSON forwarded).

SNS **notifies**; multi-step containment still needs **Lambda/Step Functions**.

## SIEM and logging
- Export or forward findings to **S3**, **Kinesis Data Firehose**, or partner SIEM (high-level exam awareness).
- **CloudTrail** logs Security Hub API calls for audit — not a replacement for findings storage.

## CI/CD and IaC
- Enable Security Hub and standards via **CloudFormation**, **Terraform**, **Control Tower**, or **StackSets** for consistent org baseline.
- **Do not** disable Config recorder in pipeline account — breaks control evaluations.

Pipeline **failure** on Security Hub is less common than **Inspector/ECR scan** gates; exam more often asks **org-wide enablement** and **incident routing** than CodeBuild blocking deploy on Hub score.

## Inspector + ECR + Hub (container path)
```text
ECR image pushed
        ↓
Inspector scan (or enhanced scanning)
        ↓
Findings → Security Hub
        ↓
EventBridge: CRITICAL CVE → block promotion Lambda / SNS
```

Pair with **ECR** lifecycle and **CodePipeline** approval — see **ECR** notes.

## High-value exam scenarios
| Scenario | Best answer |
| --- | --- |
| Single pane for GuardDuty + Inspector + Config issues | **Security Hub** |
| Org-wide CIS/FSBP compliance score | **Security Hub** standards (org config from admin account) |
| Central team account views all member findings | **Delegated administrator** + org enable |
| Multi-Region findings one dashboard | Security Hub **cross-Region aggregation** |
| Auto-page on CRITICAL findings | **EventBridge** on Security Hub/GuardDuty → **SNS** |
| CRITICAL → disable key + notify + audit | **EventBridge** → **Step Functions** |
| Many controls show Unknown after Config disabled | Re-enable **AWS Config recorder** |
| Landing zone + detective guardrails | **Control Tower** + **Config** + **Security Hub** |
| Prevent disabling security services in prod | **SCP** (preventive), not Security Hub |
| Investigate who opened SG to 0.0.0.0/0 | **CloudTrail** + finding in **Security Hub** |
| Suppress recurring approved finding | Security Hub **automation rule** (suppress) |
| Third-party scanner centralization | **BatchImportFindings** (ASFF) into Security Hub |
| Macie finds sensitive S3 data | Macie findings in **Security Hub** |
| WAF policy drift org-wide | **Firewall Manager** findings in Hub |

## Exam traps
| Trap | Reality |
| --- | --- |
| Security Hub **replaces** GuardDuty | Enable **both**; Hub **aggregates** GuardDuty findings |
| Security Hub **blocks** API calls | **Detective**; use **SCP/WAF/Lambda** for enforcement |
| **Config conformance pack** = Security Hub | Related compliance story; **different** primary interfaces — Hub = standards + aggregation |
| Fix finding by closing in Hub only | **Remediate resource** (encrypt bucket, restrict SG); then finding resolves on re-check |
| Enable Hub only in management account for org view | Use **administrator member account** + **org configuration** |
| **Inspector** schedule for weekly CVE scan | **EventBridge schedule** → start scan; findings land in **Hub** |
| Real-time git credential leak | **EventBridge + Step Functions** — not Security Hub primary path |

## Security Hub vs AWS Config (repeat — high frequency)
| | **Security Hub** | **AWS Config** |
| --- | --- | --- |
| Primary output | **Security findings** + **standards score** | **Configuration items** + **Config rule** compliance |
| Best question fit | “Consolidate security posture across tools” | “History of resource configuration / timeline” |
| Remediation | Often manual/automation via IR; some controls tie to Config remediation | **SSM Automation** remediation on NON_COMPLIANT |

## Quick review checklist
- [ ] Aggregates ASFF findings; does not replace detectors
- [ ] Org: **delegated admin account** + enable for organization
- [ ] Standards: FSBP, CIS — **controls** and **score**
- [ ] Config recorder required for many controls
- [ ] EventBridge + SNS/SFN for response
- [ ] vs GuardDuty, Inspector, Config, CloudTrail, SCP
- [ ] Cross-Region aggregation
- [ ] Automation rules for suppress/archive
- [ ] Control Tower Service-Managed Standard (awareness)

## Related notes
- **Incident Response** — GuardDuty/Hub → EventBridge patterns
- **AWS EventBridge** — rules, cross-account bus
- **AWS Config** — recorder, aggregator, remediation
- **AWS Organizations** — delegated administrator, SCPs
- **AWS Control Tower** — guardrails and Security Hub standard
- **AWS WAF / Firewall Manager** — findings sources
- **ECR / Inspector** — image vulnerability path
