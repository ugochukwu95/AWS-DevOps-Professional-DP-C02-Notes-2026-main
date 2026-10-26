# What is the AWS Well-Architected Framework?

The **AWS Well-Architected Framework** is a set of **best practices and design principles** for building and operating workloads on AWS. It helps teams compare their architecture against AWS guidance, find gaps, and prioritize improvements—without prescribing a single “correct” design for every use case.

It answers: **“Is this workload built to run safely, reliably, efficiently, and sustainably at scale?”**

## The six pillars (overview)
| Pillar | Primary question |
| --- | --- |
| **Operational excellence** | Are we running and observing the workload well, and improving it continuously? |
| **Security** | Are we protecting data, systems, and assets while delivering business value? |
| **Reliability** | Can the workload recover from failure and meet demand? |
| **Performance efficiency** | Are we using the right resources and types for the job? |
| **Cost optimization** | Are we avoiding unnecessary spend while meeting business needs? |
| **Sustainability** | Are we minimizing the environmental impact of cloud resources? |

```text
Workload design → Six pillars (trade-offs) → Measured outcomes
                        ↓
              Well-Architected Review (optional but recommended)
```

Pillars **interact**. Example: stronger encryption and logging (security) can add cost and latency; the framework expects you to **balance** pillars against business requirements, not maximize every pillar in isolation.

## Shared responsibility (context)
Well-Architected reviews apply to **your workload** on AWS. You own architecture and operations in the cloud; AWS owns security **of** the cloud (hardware, regions, core services). Pillar guidance assumes you implement your side (patching guest OS, IAM, network controls, backup strategy, etc.).

## Well-Architected Tool
**AWS Well-Architected Tool** is a free console/API service for documenting workloads and running **structured reviews** against pillar questions.

Typical flow:
1. **Define a workload** (name, environment, owner, description, AWS Regions, architectural components).
2. **Answer pillar questions** (best practice, improvement needed, none, not applicable).
3. **Review the report** — highlights **high-risk issues (HRIs)** and improvement plans.
4. **Repeat** at milestones (design, pre-production, production, major changes).

Outputs include workload risk counts, HRI lists, and **milestones** so you can track progress over time.

### Lenses
A **lens** adds pillar questions for a **specific domain** on top of the core framework. Examples:
- **Serverless**
- **SaaS**
- **Machine learning**
- **Data analytics**
- **IoT**
- **Financial services**
- **Custom lenses** (your organization’s extensions)

Use a lens when the workload is dominated by that pattern (e.g. Lambda/API Gateway → Serverless lens).

### Well-Architected Review (partner/AWS)
An optional **Well-Architected Review** with AWS or a partner is a facilitated session using the tool. Completing remediation for HRIs may qualify for **AWS Well-Architected Program** credits (program rules change—check current AWS documentation).

## How pillars map to DevOps practice
| DevOps theme | Pillars most involved |
| --- | --- |
| CI/CD, runbooks, observability | Operational excellence |
| IAM, secrets, encryption, audit | Security |
| Multi-AZ, backups, chaos testing, DR | Reliability |
| Right-sizing, caching, serverless | Performance efficiency |
| Tagging, budgets, Savings Plans, lifecycle | Cost optimization |
| Graviton, idle resources, Region selection | Sustainability |

Your DP-C02 notes (CloudFormation, CodePipeline, Systems Manager, Config, Organizations) implement **operational excellence**, **security**, and **reliability** patterns the framework describes in abstract terms.

## Review cadence (recommended)
- **Design phase** — catch structural mistakes early (network, data, identity).
- **Before go-live** — reliability and security HRIs.
- **After major changes** — new Region, migration, large traffic shift.
- **Periodically in production** — cost, sustainability, and ops debt.

## Anti-patterns the framework discourages
- **Manual, undocumented** production changes (ops excellence).
- **Single-AZ** production with no recovery story (reliability).
- **Long-lived credentials** and overly broad IAM (security).
- **Oversized instances “just in case”** without metrics (performance + cost).
- **Untagged, unowned** resources with no lifecycle (cost + sustainability).

## Relation to other AWS programs
| Program / artifact | Relationship |
| --- | --- |
| **AWS Control Tower** | Landing zones and guardrails align with security and ops pillars |
| **AWS Config / Security Hub** | Evidence and compliance for security and ops questions |
| **Trusted Advisor** | Automated checks; overlaps some cost/security/reliability themes |
| **Architecture Center** | Reference architectures illustrate pillar trade-offs |

## DevOps Professional (DP-C02) note
The exam focuses on **implementing** patterns (pipelines, IaC, monitoring, incident response) rather than memorizing every Well-Architected question. Knowing the **six pillars and what each optimizes for** still helps when scenarios ask for the “best” long-term operational or security posture.

See **`The six pillars.md`** for design principles, typical AWS services, and review themes per pillar.
