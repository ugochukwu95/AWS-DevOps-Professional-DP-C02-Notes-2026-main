# Security Hub — standards, aggregation, and organization deployment

## Single account vs organization
| Scope | Pattern |
| --- | --- |
| **One account** | Enable Security Hub; enable standards; connect integrations |
| **Organization** | **Designated Security Hub administrator account** aggregates member findings |

```text
Management account (Organizations)
        ↓ enable trusted access + designate admin
Security tooling account (delegated administrator)
        ↓ Security Hub organization configuration
All member accounts → findings roll up to admin account
        ↓
Central dashboards, EventBridge rules, SNS paging
```

**Exam tip**: “Central security team in account 111122223333 views findings for entire org” → **Security Hub delegated administrator** + **organization-wide enable**, not manual per-account console hopping.

## Delegated administrator (Organizations)
Same pattern as **GuardDuty**, **Firewall Manager**, and **Config** aggregators:

1. Enable **Organizations trusted access** for Security Hub (from management account).
2. **Designate** a member account as the Security Hub **administrator account**.
3. From admin account, **enable Security Hub for the organization** (all accounts or OUs).

The **management account** should remain for billing/org tasks; run security tooling in a **dedicated member account** (see **Organizations best practices** note).

**Do not confuse**:
| Mechanism | Purpose |
| --- | --- |
| **`RegisterDelegatedAdministrator`** | Service admin for Security Hub org features |
| **Resource-based delegation policy** | Delegate **SCP/tag policy** management — different feature |

## Cross-Region aggregation
Security Hub can **link Regions** so the **administrator account** sees findings from multiple Regions in one place.

Exam scenario: “Company operates in us-east-1 and eu-west-1; security team wants one view” → enable Security Hub in both Regions + **cross-Region aggregation** (admin account configuration).

## Enabling standards org-wide
When you enable a **security standard** (e.g. FSBP, CIS) at the organization level:

- **Controls** run per account/Region (subject to prerequisites).
- **Failed controls** generate **findings** with compliance status.
- **Security score** helps prioritize remediation workstreams.

**Prerequisite exam trap**: Standard control shows widespread **Unknown** → check **AWS Config recorder** is on and IAM permissions allow checks — see **Config, Security Hub, and Control Tower** in Config multi-account note.

## AWS Config relationship
| Config | Security Hub |
| --- | --- |
| Records **configuration history** and **Config rules** | Maps many **controls** to Config evaluations + other data sources |
| **Conformance packs** | Org compliance bundles (related but separate product path) |
| **Aggregator** | Multi-account **Config** view |

Use **Config** for “what changed on this resource Tuesday?” Use **Security Hub** for “what is our CIS/FSBP posture and consolidated severities across tools?”

## Control Tower alignment
- Control Tower **detective controls** often use **Config rules**; status surfaces in Control Tower dashboard.
- Optional **Service-Managed Standard: AWS Control Tower** in Security Hub adds aligned checks.

Exam: landing zone + centralized security findings → **Control Tower** + **Security Hub** + **Config**, not Control Tower alone.

## Insights and prioritization
**Insights** group findings — e.g. all **Critical** S3-related findings or findings for one **IAM user**.

Use when question asks **prioritize remediation** without building custom Athena queries first.

## Automation rules and custom actions
| Feature | Use |
| --- | --- |
| **Automation rule** | Auto-**suppress** approved patterns; set **severity**; **archive** stale findings |
| **Custom action** | Send matching findings to **EventBridge** target for runbooks |

```text
Security Hub finding (Severity = CRITICAL, Product = GuardDuty)
        ↓
Automation rule or EventBridge on aws.securityhub
        ↓
Lambda / Step Functions / SNS / ticket
```

Prefer **EventBridge** when exam describes multi-step IR (see **Incident Response**).

## Finding format (ASFF)
**AWS Security Finding Format** — JSON schema so GuardDuty, Inspector, partners, and custom integrations share fields: `Severity`, `Resources`, `Compliance`, `GeneratorId`, `RecordState`, etc.

Custom findings can be **BatchImportFindings** for in-house scanners — awareness for “centralize third-party tool output in Security Hub.”

## IAM and access
| Actor | Typical access |
| --- | --- |
| **Security analysts** | Read findings, update workflow status, run insights |
| **Automation role** | EventBridge, Lambda with `securityhub:*` scoped actions |
| **Org admin account** | Organization configuration APIs |

Use **least privilege**; cross-account read often via **administrator account** aggregation rather than sharing root keys.

## Deployment checklist (multi-account exam)
- [ ] Dedicated **security/tooling account** as Security Hub admin
- [ ] **Organizations** trusted access enabled
- [ ] **GuardDuty**, **Inspector**, **Config** enabled where findings should originate
- [ ] **Config recorder** on in members (control accuracy)
- [ ] **Cross-Region aggregation** if multi-Region
- [ ] **EventBridge** rules on high severity → SNS/Step Functions
- [ ] **Automation rules** for known false positives
- [ ] **SCP** prevents disabling Security Hub / Config in prod OUs (governance)

## Troubleshooting (exam-relevant)
| Symptom | Likely cause |
| --- | --- |
| No GuardDuty findings in Hub | GuardDuty not enabled or integration disabled in Security Hub |
| Controls all Unknown | **Config recorder** off or insufficient permissions |
| Member account findings missing | Account not enrolled in org Security Hub config |
| Duplicate tickets | Both GuardDuty **and** Hub fire separate SNS unless dedupe/automation |
| Stale compliance score | Resolved findings not archived; resources remediated outside Hub view |
