# What is cost optimization on AWS?

Cost optimization means delivering business value at the **lowest price point that still meets requirements**. On SAP-C03 most questions give four architectures that all work and ask for the **MOST cost-effective** one—so you must spot which option meets every stated requirement (availability, RPO/RTO, latency, compliance) and then pick the cheapest of those.

SAP-C03 has a dedicated **Domain 3: Cost-Optimized Architecture Design (15%)** with four tasks:
| Task | Covers | Where in these notes |
| --- | --- | --- |
| **3.1** Pricing models | RIs, Savings Plans (incl. **Database Savings Plans**), Spot, Graviton, rightsizing, AI/ML cost | `Purchase options - Savings Plans, Reserved Instances, and Spot.md` |
| **3.2** Data transfer and network cost | CloudFront, VPC endpoints, NAT, inter-AZ/Region, Transit Gateway vs PrivateLink pricing | `Cost visibility, data transfer, and exam scenarios.md` |
| **3.3** Cost allocation and visibility | Tagging, CUR, tag enforcement, **cost categories**, **split cost allocation**, Bedrock token tracking, Budgets, anomaly detection | This note + `Cost visibility, data transfer, and exam scenarios.md` |
| **3.4** Storage, database, backup, observability cost | Tiering, gp3, DB capacity modes, retention, **cost-effective observability** | `Cost visibility, data transfer, and exam scenarios.md`, `Amazon S3 and Storage`, `Databases and Analytics` |

This is the **cost optimization pillar** of the Well-Architected Framework—see `AWS Well-Architected Six Pillars/The six pillars.md` for how it trades off against the other pillars.

## Cost pillar design principles
| Principle | What it means in practice |
| --- | --- |
| **Implement cloud financial management** | Dedicated FinOps function, budgets, forecasting, cost-aware culture |
| **Adopt a consumption model** | Pay only for what you use; stop or scale to zero when idle |
| **Measure overall efficiency** | Unit economics—cost per order, per user, per GB processed |
| **Stop spending on undifferentiated heavy lifting** | Managed and serverless services instead of self-managed fleets |
| **Analyze and attribute expenditure** | Tags, cost categories, accounts per workload, showback/chargeback |

**Exam tip**: "Cheapest" never means "breaks a requirement". A Single-AZ database is cheaper than Multi-AZ, but it is the wrong answer if the question says "highly available".

## Cloud financial management
- **Visibility**: Cost Explorer, Cost and Usage Report (CUR), dashboards per team.
- **Accountability**: every resource owned by a team via account structure and tags.
- **Control**: AWS Budgets, budget actions, SCPs that block expensive instance types or Regions.
- **Optimization**: recommendations from Compute Optimizer, Trusted Advisor, Cost Optimization Hub.

## Consolidated billing in AWS Organizations
- The **management account** pays one bill for all member accounts.
- **Volume pricing tiers aggregate** across accounts (for example S3 storage tiers and data transfer tiers).
- **Reserved Instance and Savings Plans discounts are shared** across all accounts in the organization by default. The owning account gets the benefit first; unused benefit flows to other accounts.
- Sharing can be **turned off per account** in the billing preferences (RI and Savings Plans discount sharing) of the management account—for example for a business unit that must keep its own discounts.
- No extra cost for consolidated billing.

**Exam tip**: "Each business unit bought RIs, but utilization is low in some accounts" → consolidated billing with discount sharing enabled lets unused RIs/SPs apply to other accounts automatically.

## The cost levers
| Lever | What you do | Main tools / services |
| --- | --- | --- |
| **Right-size** | Match instance/volume/function size to actual utilization | Compute Optimizer, Cost Optimization Hub, Trusted Advisor, CloudWatch metrics |
| **Pricing model** | Commit for steady state, Spot for interruptible | Savings Plans, Reserved Instances, Spot, Cost Explorer recommendations |
| **Elasticity / scheduling** | Scale with demand; stop non-prod outside office hours | Auto Scaling, Instance Scheduler on AWS, EventBridge Scheduler |
| **Storage tiering** | Move data to cheaper classes as it ages | S3 Lifecycle, S3 Intelligent-Tiering, EBS gp3, EBS Snapshots Archive, EFS lifecycle |
| **Data transfer** | Keep traffic in-AZ / private, cache at edge | VPC gateway endpoints, CloudFront, Direct Connect, architecture placement |
| **Managed / serverless** | Remove idle capacity and ops labour | Lambda, Fargate, Aurora Serverless v2, DynamoDB on-demand, S3 |
| **Processor choice** | Better price performance | Graviton (EC2, RDS, Lambda arm64, Fargate) |
| **Observability** | Ingest, keep, and store only the telemetry you use | Log classes, retention settings, metric filters, EMF, trace sampling |
| **AI/ML tier choice** | Right model, tier, batching, caching | Bedrock and SageMaker AI options—see the `AI and ML Architecture` folder |

Order of operations most FinOps teams follow: **eliminate waste → right-size → then commit** (buy Savings Plans/RIs). Committing before right-sizing locks in waste.

## Cost allocation tags
| | User-defined tags | AWS-generated tags |
| --- | --- | --- |
| Created by | You (for example `CostCenter`, `Project`) | AWS (for example `aws:createdBy`, `aws:cloudformation:stack-name`) |
| Prefix in billing | `user:` | `aws:` |
| Activation | Must be **activated** in the Billing console | Must be **activated** in the Billing console |

- Activate in the **management account** (payer) for the whole organization.
- Tags appear in Cost Explorer and CUR only **after activation** (can take up to 24 hours) and only for usage **going forward**; AWS supports a backfill request for historical months, but do not rely on it in exam answers.
- Untagged resources show as "No tag key"—a common reason allocation reports look incomplete.

**Exam tip**: "Tags exist on resources but do not appear in Cost Explorer" → the tags were **not activated as cost allocation tags**.

## Cost categories
**AWS Cost Categories** is explicitly in scope for SAP-C03 and is the main **showback/chargeback** building block.
- Rule-based grouping of costs (by account, tag, service, charge type, or other cost categories) into business dimensions such as `Team`, `BusinessUnit`, or `Environment`. Rules are evaluated in order; a **default value** catches anything unmatched.
- **Split charges**: allocate a shared cost (for example a shared networking, security, or platform account) across other categories **proportionally** (by their own spend), **evenly**, or by **fixed percentage**.
- Usable in Cost Explorer, Budgets, CUR 2.0, and Cost Anomaly Detection—one business view everywhere.
- Fix messy tagging retroactively at the reporting layer without retagging resources (rules apply from the start of the current month; past months can be backfilled).

## Split cost allocation data (containers)
Shared EC2 hosts in ECS/EKS clusters normally appear in CUR as **one instance line item**, so you cannot see which team's tasks or pods used it.
- **Split cost allocation data** adds **container-level** line items (ECS **tasks**, EKS **pods**) to **CUR / CUR 2.0**, splitting the **amortized** instance cost by each container's share of **CPU and memory** (and for EKS on accelerated instances, **GPU/Trainium/Inferentia**).
- Opt in once in the **management account** (Cost Management preferences) for ECS and/or EKS, then include split cost allocation data in the CUR export.
- EKS options: split by pod **resource requests**, or by the higher of requests vs actual use (via Amazon Managed Service for Prometheus or Container Insights).
- Pod/task labels and tags (for example `team`, ECS service, EKS namespace) become allocation dimensions.
- **Not shown in Cost Explorer**—query in **Athena** / the Containers Cost Allocation QuickSight dashboard.

**Exam tip**: "Multiple teams share one EKS (or ECS on EC2) cluster; finance needs cost per team/namespace with least effort" → **split cost allocation data in CUR**, not separate clusters per team or a custom metering tool.

## Tag enforcement for cost allocation
Use the three controls together—each covers a gap the others leave:

| Need | Use |
| --- | --- |
| Standardize tag keys, capitalization, allowed values | **Tag policy** (Organizations) |
| Prevent noncompliant tag values on specified resource types | Tag policy with **enforcement** enabled (`enforced_for`) |
| Block creation of resources **without** a required tag | **SCP** denying create actions when `aws:RequestTag/CostCenter` is `Null`, plus `aws:TagKeys` to control which keys can be set or removed |
| Detect and remediate noncompliant existing resources | AWS Config **`required-tags`** managed rule (+ SSM Automation remediation), conformance packs across the org |
| Report compliance org-wide | Tag policy **compliance report** (Organizations / Resource Groups) |

```json
{
  "Effect": "Deny",
  "Action": ["ec2:RunInstances", "ec2:CreateVolume"],
  "Resource": ["arn:aws:ec2:*:*:instance/*", "arn:aws:ec2:*:*:volume/*"],
  "Condition": { "Null": { "aws:RequestTag/CostCenter": "true" } }
}
```

**Exam tip**: Tag policies do **not** stop someone launching an untagged resource—that needs an **SCP** (or IAM policy) with a tag condition. Config `required-tags` **detects** after the fact; the SCP **prevents**. Then **activate** the keys as cost allocation tags or they still will not show in billing.

## Showback vs chargeback
| | Showback | Chargeback |
| --- | --- | --- |
| What happens | Teams **see** their costs | Teams are **billed** internally for their costs |
| Goal | Awareness, behaviour change | Financial accountability, budget ownership |
| Typical tooling | Cost Explorer views, CUR dashboards, cost categories | CUR 2.0 + **cost categories with split charges** + **split cost allocation data** for shared clusters; **AWS Billing Conductor** for custom pro forma rates |

### Generative AI cost attribution (Amazon Bedrock)
Skill 3.3.4 names **token usage monitoring for Amazon Bedrock**. Many teams calling the same model show up as one Bedrock line item unless you attribute it:
- **Application inference profiles**: one profile per team/app, tagged (for example `Team=Search`), activated as cost allocation tags; callers pass the profile ARN as the model ID → **billed cost by tag** in Cost Explorer and CUR.
- **IAM principal attribution**: Bedrock cost attributed to the calling IAM identity in CUR 2.0.
- **CloudWatch `AWS/Bedrock` metrics**: `InputTokenCount`, `OutputTokenCount`, `Invocations` per model/profile ID → dashboards and alarms on token consumption.
- **Model invocation logging** (with per-request metadata) for per-request token detail.
- See the `AI and ML Architecture` folder for model tiers, batching, and caching.

**Exam tip**: Separate **AWS accounts per team/workload** is the cleanest allocation boundary—tags then refine within an account, cost categories map accounts and tags to business units, and split cost allocation handles shared containers.
