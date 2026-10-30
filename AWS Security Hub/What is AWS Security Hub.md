# What is AWS Security Hub?

AWS Security Hub is a **cloud security posture management (CSPM)** service that **collects, normalizes, and prioritizes security findings** from AWS and partner tools into a **single pane** — then evaluates accounts against **security standards** (control checks).

```text
GuardDuty, Inspector, Config, IAM Access Analyzer, Macie, Firewall Manager, …
        ↓
Findings normalized to ASFF (AWS Security Finding Format)
        ↓
Security Hub (standards, insights, workflows)
        ↓
EventBridge / SNS / ticketing / Lambda remediation
```

**Exam mantra**: Security Hub **aggregates and scores**; it does **not** replace the **source detectors** (GuardDuty still detects threats; Inspector still scans; Config still records config).

## What Security Hub does (and does not do)
| Does | Does not |
| --- | --- |
| Centralize findings across accounts and Regions | Block API calls in real time (use SCP, WAF, Lambda response) |
| Run **security standard** control checks (FSBP, CIS, PCI, etc.) | Replace **CloudTrail** for API audit history |
| Deduplicate and enrich finding severity | Patch EC2 or fix code by itself |
| Integrate with **EventBridge** for automation | Store all application logs (use **CloudWatch Logs**) |

**Exam trap**: “Single dashboard for GuardDuty + Config + Inspector findings in the org” → **Security Hub**, not Config alone or GuardDuty alone.

## Core concepts
| Term | Meaning |
| --- | --- |
| **Finding** | A security issue in **ASFF** (severity, resource, compliance status, generator) |
| **Security standard** | Bundle of **controls** (e.g. AWS Foundational Security Best Practices) |
| **Control** | A check mapped to a requirement (often backed by Config rule, Security Hub check, or integrated product) |
| **Compliance score** | Percent of **passed** controls in a standard (exam: “posture trending”) |
| **Insight** | Grouped view of findings (e.g. by resource, IAM user, severity) |
| **Automation rule** | Auto-archive, suppress, or route findings matching criteria |
| **Custom action** | Trigger response (e.g. EventBridge event) from console or automation |

## Integrated finding sources (high-yield)
Security Hub ingests from AWS services including (exam awareness — not exhaustive memorization):

| Source | Typical finding type |
| --- | --- |
| **Amazon GuardDuty** | Threat detection (anomalies, malicious activity) |
| **Amazon Inspector** | CVEs on EC2, ECR images, code repos |
| **AWS Config** | Configuration compliance related to security controls |
| **IAM Access Analyzer** | External access to resources |
| **Amazon Macie** | Sensitive data in S3 |
| **AWS Firewall Manager** | WAF/org policy violations |
| **Amazon Detective** | Investigation context (linked workflows) |
| **Partner integrations** | Third-party tools publishing ASFF |

Enable the **product integration** in Security Hub so findings flow in; disabling the source stops new findings from that product.

## Security standards (examples)
| Standard | Exam note |
| --- | --- |
| **AWS Foundational Security Best Practices (FSBP)** | Common default; broad AWS best practices |
| **CIS AWS Foundations Benchmark** | Industry benchmark; frequent exam reference |
| **PCI DSS** | Payment workloads |
| **NIST 800-53** | Federal-style controls |

**Control Tower** can enable **Service-Managed Standard: AWS Control Tower** in Security Hub for aligned detective coverage with the landing zone.

## Finding workflow states
Findings move through workflow statuses such as **NEW**, **NOTIFIED**, **SUPPRESSED**, **RESOLVED** — useful for ticketing and automation idempotency.

**Exam tip**: “Suppress false positives for approved bastion SG” → **automation rule** or manual suppress with justification — not disable GuardDuty org-wide.

## Security Hub vs adjacent services
| Question | Answer |
| --- | --- |
| Who detected the threat? | **GuardDuty** (finding also in Security Hub) |
| Is this bucket encrypted / compliant? | **Config** rule + often **Security Hub control** |
| CVE on container image? | **Inspector** → Security Hub |
| Org-wide compliance dashboard | **Security Hub** (+ **Config aggregator** for config-specific views) |
| Prevent creating public S3 | **SCP**, **Hooks**, **IAM** — not Security Hub |

Many Security Hub **controls require AWS Config** to be enabled and recording — without Config, controls may show **Unknown** or **Failed** incorrectly.

## Pricing awareness (exam level)
Security Hub charges for checks and finding ingestion (model varies by standard and usage). The exam cares about **when to use the service**, not line-item pricing.

## Related notes in this repo
- **Incident Response** — EventBridge response to findings
- **AWS Config** — recorder dependency for controls
- **AWS Organizations** — delegated administrator
- **AWS Control Tower** — Service-Managed Standard
- **GuardDuty / Inspector / WAF** — upstream finding sources

Next: **Standards, aggregation, and organization deployment.md** and **DevOps integrations and DOP-C02 exam scenarios.md**.
