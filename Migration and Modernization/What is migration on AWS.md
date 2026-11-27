# What is migration on AWS?

A large migration moves a **portfolio** of applications, servers, and databases from on-premises (or another cloud) to AWS. SAP-C03 covers this in **Domain 4 (Resilience, Migration, and Business Continuity, 15%)**, Task 4.1: the **process** (assess → mobilize → migrate & modernize), **discovery, dependency mapping, and wave planning** (Skill 4.1.1), the **7 Rs** strategy for each application, and which **AWS tool** fits each step.

The guiding idea: migrate in **waves**, choose the **cheapest acceptable R** per application, and avoid re-architecting everything on day one unless the question demands it.

## Migration phases
| Phase | Goal | Typical outputs / tools |
| --- | --- | --- |
| **Assess** | Build the business case and understand the estate | **AWS Transform** assessment (TCO business case), **Migration Evaluator**, Migration Readiness Assessment |
| **Mobilize** | Close readiness gaps, detailed planning | Landing zone (**Control Tower**), discovery and dependency mapping, wave plan, pilot migrations, skills/CCoE |
| **Migrate & modernize** | Execute waves, then optimize | **AWS Transform MGN**, **AWS Transform**, **DMS**, **DataSync**, **Data Transfer Terminal** |

**Exam tip**: "Build a business case / estimate TCO before deciding to migrate" → **AWS Transform assessment** (fast, self-service) or **Migration Evaluator** (deeper, expert-led). "Discover servers, dependencies, and utilization, then plan waves" → **AWS Transform** discovery and migration planning. Do not swap business case with inventory.

## The 7 Rs
| Strategy | What it means | Example | AWS tools |
| --- | --- | --- | --- |
| **Retire** | Decommission; no longer needed | Unused reporting app found during discovery | Discovery data shows zero usage |
| **Retain** | Keep on-premises for now (revisit later) | Mainframe with recent hardware refresh, latency-bound app | Hybrid connectivity (DX/VPN) |
| **Rehost** (lift and shift) | Move servers as-is to EC2 | Linux/Windows VMs to EC2 with no code changes | **AWS Transform MGN**, AWS Transform (agentic workflow) |
| **Relocate** (hypervisor-level lift) | Move VMs to a VMware environment on AWS without converting them | vSphere cluster to VMware Cloud on AWS via HCX vMotion | **VMware Cloud on AWS**, Amazon EVS |
| **Replatform** (lift, tinker, shift) | Small optimizations, no core re-architecture | Self-managed MySQL → **RDS**, Tomcat app → **Elastic Beanstalk**, app to containers on ECS | **DMS**, RDS, Beanstalk, ECS/Fargate |
| **Repurchase** (drop and shop) | Move to a different product, usually SaaS | On-prem CRM → Salesforce, Exchange → Microsoft 365 | AWS Marketplace |
| **Refactor / re-architect** | Rewrite for cloud-native features | Monolith → microservices on ECS/EKS/Lambda | Refactor patterns, AWS Transform, SCT, Lambda, EventBridge |

Cost and effort grow roughly from top to bottom (retire/retain cheapest; refactor most expensive, but highest long-term benefit).

**Exam tip**: "Fastest migration, no code changes, large server count" → **rehost with AWS Transform MGN**. "Reduce DBA overhead with minimal changes" → **replatform** to RDS/Aurora. "Must keep VMware tooling and operational model" → **relocate**.

## AWS Transform for discovery and planning
**AWS Transform** is the agentic AI migration and modernization service (launched May 2025). It is the successor to **AWS Migration Hub** and **AWS Application Discovery Service**, which stopped accepting new customers on **November 7, 2025** and are not in the SAP-C03 in-scope list.

- **Discovery**: agentless and agent-based collectors, the open-source Export for vCenter tool, RVTools exports, or imported inventory (CMDB/CSV) from any source environment.
- **Assessment**: TCO business case with EC2 right-sizing, licensing (BYOL vs license-included), and what-if scenarios.
- **Migration planning**: scope → group servers into **applications** → generate **move groups** → build **waves**, refined through chat; flags affected groups when new dependencies are discovered.
- **Execution**: network conversion to VPC infrastructure as code, landing zone setup, then rehost with the **AWS Transform MGN** replication engine.

## Discovery and dependency mapping
| | Agentless collector | Agent-based collector | Import |
| --- | --- | --- | --- |
| Deployment | Appliance in **VMware vCenter** | Agent installed on each server (Windows/Linux) | Upload existing inventory (CMDB, RVTools, CSV) |
| Environment | VMware VMs only | Physical, VMware, Hyper-V, other clouds | Any |
| Data | VM inventory, CPU/memory/disk utilization | Above **plus running processes and inbound/outbound network connections** | Whatever the source holds |
| Dependency mapping | Limited | **Yes**, best for grouping apps into move groups | Only if the export contains connection data |
| Effort | Low (one appliance) | Higher (agent rollout, change approval) | Lowest |

**Exam tip**: "Identify server-to-server dependencies to plan move groups" → **agent-based** collection. "Cannot install software on VMs, VMware estate" → **agentless collector** or an RVTools export.

## Migration Evaluator
- Formerly TSO Logic; still available at no additional charge. Produces a data-driven **business case** and **TCO** projection, including right-sizing and licensing options.
- Uses an agentless collector or imported data (for example from existing monitoring tools/CMDB).
- Output: **Quick Insights** summary and a detailed, expert-led business case. Also the recommended replacement for **DMS Fleet Advisor** (end of support May 20, 2026) for database fleet assessments.

## Portfolio and wave planning
```text
Discovery data → group servers into applications → assign R per app
            → move groups (apps with hard dependencies move together)
            → waves (pilot wave first, then larger waves) → execute + track in AWS Transform
```
| Term | Meaning |
| --- | --- |
| **Hard dependency** | System cannot run without it (app → its database); keep in the **same move group** |
| **Soft dependency** | Latency-insensitive; can be split across move groups |
| **Non-technical dependency** | Shared business function, owner, compliance window, RTO/RPO class |
| **Move group** | Co-dependent applications migrated together |
| **Wave** | One or more move groups scheduled together |

- Keep **tightly coupled** applications (chatty dependencies, shared DB) in the **same wave** to avoid cross-network latency.
- Start with a **pilot** of low-risk apps to prove the landing zone and runbooks.
- Use **AWS Transform MGN** at scale with launch templates and post-launch actions.

## Migration Acceleration Program (MAP)
- AWS program for large migrations following **assess → mobilize → migrate & modernize**.
- Provides methodology, tools, partner expertise, training, and **funding/credits** to offset migration costs; MAP engagements can now be tracked inside AWS Transform.
- Appears in questions as the answer to "commercial support and funding for a large-scale migration," not as a technical tool.

## Common distractors
- **Server Migration Service (SMS)** and **CloudEndure Migration** → replaced by **AWS Transform MGN**; pick it for new rehost questions.
- **Migration Hub** and **Application Discovery Service** → closed to new customers; for new projects the planning/discovery answer is **AWS Transform**.
- **Business case vs inventory** → AWS Transform assessment/Migration Evaluator vs discovery data and dependency mapping.
- **Migration-tool security** was removed from the SAP-C03 blueprint text, but basics (encrypted replication, private connectivity over DX/VPN, least-privilege IAM) may still appear implicitly.
