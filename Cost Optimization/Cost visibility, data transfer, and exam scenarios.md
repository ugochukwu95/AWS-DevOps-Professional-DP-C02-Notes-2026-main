# Cost visibility, data transfer, and exam scenarios

## Cost visibility and governance tools
| Tool | Purpose | Key facts |
| --- | --- | --- |
| **Cost Explorer** | Visualize, filter, group spend | Forecasts; RI/SP **purchase recommendations**; RI/SP **utilization** and **coverage** reports; group by tag, account, cost category |
| **AWS Budgets** | Alert on actual or **forecasted** cost/usage | Cost, usage, RI/SP utilization and coverage budgets; alerts via email/SNS/Chatbot |
| **Budget actions** | Automatic response when a threshold is hit | Apply an **IAM policy**, apply an **SCP**, or **stop EC2/RDS instances**; run automatically or after approval |
| **Cost Anomaly Detection** | ML-based detection of unusual spend | Monitors by service, account, cost category, or tag; individual alerts or daily/weekly summaries via SNS/email |
| **CUR 2.0 (Data Exports)** | Most granular billing data | Delivered to **S3** (Parquet), query with **Athena**, visualize in **QuickSight** |
| **Cost Categories** | Map accounts/tags/services to business units | Split charges for shared costs; usable in Cost Explorer, Budgets, CUR, Anomaly Detection |
| **Split cost allocation data** | Container-level (ECS task / EKS pod) cost | CUR / CUR 2.0 only (not Cost Explorer); opt in from the management account |
| **Cloud Intelligence Dashboards** | Prebuilt QuickSight dashboards (CUDOS, CID, KPI) | Built on CUR in Athena; org-wide FinOps views |
| **Compute Optimizer** | ML right-sizing recommendations | EC2, ASGs, EBS, Lambda, ECS on Fargate, RDS; memory metrics need CloudWatch agent |
| **Trusted Advisor** | Best-practice checks incl. cost | Idle load balancers, low-utilization EC2, unassociated Elastic IPs, underused EBS, idle RDS; full checks need Business Support or higher |
| **Cost Optimization Hub** | Single place for savings recommendations | Aggregates and **deduplicates** recommendations across accounts and Regions; must opt in |

**Utilization vs coverage**: **utilization** = how much of your purchased commitment is used (low → you overbought). **Coverage** = how much of eligible usage is covered by commitments (low → you could buy more).

**Exam tip**: "Prevent further spend automatically when a dev account exceeds its budget" → **Budgets action** that applies an SCP/IAM deny policy or stops instances. A plain Budget alert only notifies.

**Exam tip**: "Analyze billing with SQL across all accounts at line-item/resource level" → **CUR 2.0 via Data Exports → S3 → Athena → QuickSight**. Cost Explorer is not the answer for custom SQL analysis.

## Data transfer pricing rules
| Traffic path | Charged? |
| --- | --- |
| Inbound from internet to AWS | **Free** |
| Same AZ, using **private IP** | **Free** |
| Same AZ, using public or Elastic IP | Charged |
| **Cross-AZ** within a Region (EC2, RDS replicas, etc.) | Charged **in each direction** |
| **Inter-Region** | Charged (per GB out of the source Region) |
| Outbound to internet | Charged, tiered (cheaper per GB at high volume) |
| **NAT gateway** | Hourly charge **plus per-GB processing**, on top of normal transfer |
| **VPC gateway endpoints** (S3, DynamoDB) | **Free** |
| **Interface endpoints** (PrivateLink) | Hourly per AZ + per-GB processing |
| S3/EC2 origin → **CloudFront** | Free; CloudFront egress is generally cheaper than S3/EC2 direct internet egress at volume, and caching cuts origin load |
| **Direct Connect** egress | Lower per-GB data-out rate than internet egress, plus port-hour charges |

```text
Private subnet EC2 ──► NAT gateway ──► S3      (NAT hourly + per-GB processing)
Private subnet EC2 ──► Gateway endpoint ──► S3 (free)
```

**Exam tip**: Large NAT gateway bill from instances talking to S3 or DynamoDB → add **gateway VPC endpoints**. Cross-AZ chatter between tiers → keep chatty components in the same AZ where availability requirements allow.

## VPC-to-VPC connectivity pricing (Skill 3.2.4)
| Option | Fixed charge | Per-GB charge | Cost notes |
| --- | --- | --- | --- |
| **VPC peering** | None | **No processing fee**; same-AZ traffic free (even cross-account), cross-AZ and inter-Region transfer charged | Cheapest per GB, but not transitive—full mesh of N VPCs needs N(N-1)/2 connections |
| **Transit Gateway** | Per **attachment-hour** (billed to the attached VPC owner) | **Data processing per GB** sent into the TGW, **plus** normal cross-AZ/inter-Region transfer | Hub-and-spoke scale and central routing; no processing charge on data arriving over a TGW peering attachment |
| **PrivateLink** (interface endpoint) | Per **endpoint per AZ-hour** | Data processing per GB through the endpoint | Exposes **one service**, not a whole network; overlapping CIDRs OK; provider runs an NLB |
| **Cloud WAN** | Per core network edge-hour + per attachment-hour | Data processing per GB | Global, policy-driven WAN; most expensive fixed cost |

- Illustrative US East rates: TGW $0.05 per attachment-hour + $0.02/GB processed; PrivateLink $0.01 per endpoint per AZ-hour + $0.01/GB; peering $0 processing. So **high-volume traffic between two VPCs** is cheapest over **peering**, even inside a TGW design (add a peering connection for the heavy pair).
- Centralized egress/inspection through a TGW adds TGW processing on every GB; compare with distributed NAT gateways (NAT has its own per-GB processing) before centralizing.

**Exam tip**: "Two VPCs exchange tens of TB per month; minimize cost" → **VPC peering** (no per-GB processing). "Hundreds of VPCs, transitive routing, minimal management" → **Transit Gateway** despite the per-GB fee. "Expose one service to many consumer VPCs/accounts with overlapping CIDRs" → **PrivateLink**.

## Storage cost levers
- **S3 Lifecycle**: transition by age to Standard-IA, One Zone-IA, Glacier Instant/Flexible Retrieval, Deep Archive; expire old objects and noncurrent versions; abort incomplete multipart uploads. Watch **minimum storage durations** and per-request transition costs for many small objects.
- **S3 Intelligent-Tiering**: for **unknown or changing access patterns**; small per-object monitoring fee, no retrieval fees; objects under 128 KB are not auto-tiered.
- **S3 Storage Lens**: org-wide visibility of storage usage and waste (for example incomplete multipart uploads).
- **EBS gp2 → gp3**: lower price per GB and IOPS/throughput provisioned independently of size; in-place change via Elastic Volumes. gp2 forces you to buy capacity to get IOPS (3 IOPS/GiB); gp3 includes 3,000 IOPS + 125 MiB/s and you pay only for extra.
- **Delete unattached EBS volumes** and **old snapshots**; automate with **Amazon Data Lifecycle Manager** (free, tag-based create/retain/copy/archive policies).
- **EBS Snapshots Archive**: up to 75% cheaper storage for rarely restored snapshots; 90-day minimum, restore takes hours (up to 72), and archiving converts the snapshot to a **full** copy. DLM can archive automatically for monthly/yearly schedules.
- **AWS Backup**: cost-optimized retention via backup plan **lifecycle** (transition to cold storage, expire), org-wide backup policies; keep only the retention the RPO/compliance requirement asks for.
- **EFS lifecycle management**: move files to Infrequent Access / Archive classes.

Details: `Amazon S3 and Storage` folder.

## Database cost levers (Skill 3.4.3)
| Lever | Use when |
| --- | --- |
| **DynamoDB on-demand** | Unknown, spiky, or mostly idle traffic |
| **DynamoDB provisioned + auto scaling + reserved capacity** | Steady, predictable throughput |
| **DynamoDB Standard-IA table class** | Storage dominates cost |
| **Aurora Serverless v2** | Intermittent or highly variable relational load |
| **Aurora I/O-Optimized** | I/O charges are a large share (AWS guidance >25%) of Aurora spend |
| **RDS/Aurora reserved DB instances** | Fixed engine, family, Region; 1 or 3 years |
| **Database Savings Plans** | Flexible 1-year commitment across DB services, engines, Regions, and serverless |
| **Graviton DB instances**, stop dev DBs, right-size via Compute Optimizer | Always worth checking |

See `Purchase options - Savings Plans, Reserved Instances, and Spot.md` and `Databases and Analytics/Choosing a database on AWS.md`.

## Cost-effective observability (Skill 3.4.5)
Observability bills grow with **log GB ingested**, **log GB stored**, **custom metric count**, **traces recorded**, and **queries run**. Design to collect what you use.

| Cost driver | Lever |
| --- | --- |
| **Log ingestion** | **CloudWatch Logs Infrequent Access log class** (renamed **Essentials**): about **50% lower ingestion price per GB**, same storage and Logs Insights price. Chosen **at log group creation**—cannot be changed later |
| Logs you never read | Lower **log levels** in production, drop debug logs at the source, avoid logging full payloads |
| **Log storage** | Set **retention** on every log group (default is **never expire**); for long-term compliance, **export to S3** and lifecycle to **Glacier Flexible Retrieval / Deep Archive** |
| Shipping everything to a second tool | **Subscription filters** with a filter pattern send only matching events to Kinesis/Firehose/Lambda/OpenSearch, not the full stream |
| Metrics from logs | **Metric filters** turn log patterns into metrics—alarm on the metric, keep the logs short-lived |
| **Custom metrics** | Each unique **metric name + dimension combination** is a separate billable metric—**avoid high-cardinality dimensions** (user ID, request ID, container ID) |
| Metric publishing | **Embedded Metric Format (EMF)**: write structured logs, CloudWatch extracts metrics asynchronously (no `PutMetricData` API calls); still pay log ingestion + custom metrics, so keep dimensions low |
| Metric aggregation | Aggregate before publishing (statistic sets, coarser dimensions), use standard 1-minute resolution instead of high resolution unless needed |
| **Traces** | **X-Ray / ADOT sampling rules**—default samples the first request each second plus 5% of the rest; raise only for critical paths |
| **Contributor Insights** | Charged per rule and per log events matched—enable only for targeted top-N analysis, not on every log group |
| Queries and dashboards | Scope Logs Insights queries by time range and log group; field indexes; avoid frequent full-scan scheduled queries |

**Infrequent Access / Essentials class does not support**: metric filters, subscription filters, EMF, Live Tail, Logs anomaly detection, Container/Lambda Insights ingestion, `GetLogEvents`/`FilterLogEvents`. It still supports Logs Insights, cross-account, KMS, and export to S3.

**Exam tip**: "Audit/compliance logs rarely queried, keep in CloudWatch for ad hoc forensics, cut cost" → **Infrequent Access (Essentials) log class** + retention. "Need alarms from these logs" → stays **Standard** (metric filters are not available in IA). "Keep logs 7 years cheaply" → retention in CloudWatch for the hot period, **export to S3 + lifecycle to Glacier Deep Archive**.

See the `Amazon CloudWatch` folder for features and the SAP-C03 Domain 5 monitoring topics.

## AI/ML workloads
Skill 3.1.4 (service tier, batching, caching for Bedrock and SageMaker AI) and Skill 3.2.5 (cross-Region inference routing) are covered in the `AI and ML Architecture` folder. Cost-allocation side: **application inference profiles**, Bedrock token metrics, and **split cost allocation for EKS GPU pods**—see `What is cost optimization on AWS.md`.

## Scheduling non-production
- **Instance Scheduler on AWS**: AWS solution (CloudFormation) that starts/stops **EC2 and RDS** on defined schedules, across accounts and Regions, driven by tags.
- Alternative: **EventBridge Scheduler** + SSM Automation or Lambda.
- Running dev/test only office hours (roughly 50 of 168 hours a week) cuts compute cost by about two-thirds.
- Stopped RDS instances **restart automatically after 7 days**—scheduling handles that.

## Choose the right approach
| Requirement | Answer |
| --- | --- |
| Steady 24/7 EC2, may change family/Region or move to containers | **Compute Savings Plan** |
| Steady EC2, fixed family and Region, max discount | **EC2 Instance SP** or **Standard RI**, 3-year All Upfront |
| Need flexibility to change instance family later with RIs | **Convertible RI** |
| Guaranteed capacity in one AZ plus discount | **On-Demand Capacity Reservation + Savings Plan** (or zonal RI) |
| Fault-tolerant batch, CI, rendering | **Spot** with diversified types, price-capacity-optimized |
| Steady baseline plus spiky peaks | Savings Plan for baseline + Auto Scaling with **mixed instances** (On-Demand/Spot) |
| Steady RDS/ElastiCache/OpenSearch, fixed engine and family | Service-specific **reserved instances/nodes** |
| Steady Redshift provisioned cluster | **Redshift reserved nodes** (no Database SP coverage) |
| DB spend across engines/services/Regions, or moving provisioned → serverless | **Database Savings Plans** (1-year, No Upfront) |
| Steady DynamoDB provisioned throughput | **DynamoDB reserved capacity** |
| Unpredictable, spiky DynamoDB traffic | **On-demand capacity mode** |
| Per-core BYOL licences | **Dedicated Hosts** |
| Cost per team on a shared EKS/ECS cluster | **Split cost allocation data** in CUR 2.0 |
| Business-unit view across accounts and tags, share platform costs | **Cost Categories** with **split charges** |
| Prevent untagged resources at creation | **SCP** with `aws:RequestTag` / `aws:TagKeys` |
| Detect existing untagged resources | AWS Config **`required-tags`** rule |
| Bedrock spend per team/application | **Application inference profiles** with cost allocation tags |
| High-volume traffic between two VPCs | **VPC peering** (no per-GB processing) |
| Many VPCs, transitive routing | **Transit Gateway** (attachment-hour + per-GB processing) |
| Rarely queried logs kept in CloudWatch | **Infrequent Access (Essentials) log class** + retention |
| Long-term log archive | **Export to S3** + lifecycle to Glacier |
| Custom metrics bill exploding | Remove **high-cardinality dimensions**; aggregate; EMF with few dimensions |
| Alert before month-end overspend | **AWS Budgets** with forecasted threshold |
| Automatically block spend in a sandbox | **Budget action** applying SCP / stopping instances |
| Detect unexpected cost spikes without fixed thresholds | **Cost Anomaly Detection** |
| Line-item analysis with SQL and dashboards | **CUR 2.0 + Athena + QuickSight** |
| Right-size EC2, Lambda, EBS | **Compute Optimizer** |
| Unknown S3 access pattern | **S3 Intelligent-Tiering** |
| Known aging pattern in S3 | **S3 Lifecycle** rules |
| Private subnets pulling lots of S3 data | **S3 gateway endpoint** |
| Serve large global downloads cheaply | **CloudFront** in front of S3 |

## Common exam scenarios
- **Steady web tier on m5 instances, plan to migrate part to Fargate next year** → **Compute Savings Plan**; it follows usage to Fargate. EC2 Instance SP/RIs would not.
- **Nightly batch that can restart from checkpoints, must be cheapest** → **Spot** (EC2 Fleet/ASG, many instance types, price-capacity-optimized). Not Reserved—it is not 24/7.
- **Batch must finish by 6 AM no matter what** → Spot for most capacity with **On-Demand base/fallback**; pure Spot is the distractor.
- **Dev/test environments run only during business hours** → **Instance Scheduler** (or stop/start schedules); RIs/SPs are the distractor because usage is not 24/7.
- **DR Region must have capacity guaranteed during a regional failure** → **On-Demand Capacity Reservations** in the DR Region (pair with SP for discount); RIs alone (regional) do not reserve capacity.
- **Large NAT gateway charges; traffic mostly to S3** → **S3 gateway endpoint** (free); interface endpoint is the costlier distractor.
- **High cross-AZ data transfer between app servers and a cache** → place clients and nodes in the same AZ where HA allows, or use AZ-aware reads; question "cheapest" often wants less cross-AZ traffic.
- **Serving terabytes of static content from S3 to global users** → **CloudFront** (cheaper egress + caching); S3 Transfer Acceleration is the distractor (adds cost, for uploads).
- **Company has RIs in one account, others pay On-Demand for the same family** → ensure **RI/SP discount sharing** is enabled under consolidated billing.
- **Cost allocation report missing team costs despite tagging** → **activate** the tags as cost allocation tags in the management account.
- **Must stop developers creating untagged resources** → **SCP** with `aws:RequestTag` condition; tag policies alone only standardize.
- **Finance wants each department billed for usage including shared services** → **cost categories with split charges** + CUR (chargeback).
- **Sandbox accounts must not exceed $500/month without manual effort** → **AWS Budgets action** that applies a deny SCP at threshold.
- **Sudden 10x spend on one service, need alert without setting thresholds** → **Cost Anomaly Detection**.
- **EC2 fleet averages 10% CPU** → **Compute Optimizer** right-size first, then buy Savings Plans on the smaller footprint.
- **Logs accessed for 30 days, kept 7 years for compliance, rarely read** → **S3 Lifecycle** to Glacier Deep Archive; Intelligent-Tiering is a weaker fit when the pattern is known.
- **Thousands of gp2 volumes** → migrate to **gp3** with Elastic Volumes—cheaper with no downtime.
- **Snapshots kept for years for audit, rarely restored** → **EBS Snapshots Archive**.
- **Reporting DB used only during business hours, spiky queries** → **Aurora Serverless v2** or scheduled stop; provisioned 24/7 with RI is the distractor.
- **Convertible vs Standard RI choice with stable workload for 3 years** → **Standard RI** (bigger discount); Convertible only when change is expected.
- **Windows Server and SQL Server per-core licences to reuse** → **Dedicated Hosts**.
- **Containers on ECS with interruptible workers** → **Fargate Spot** capacity provider mixed with Fargate for baseline.
- **Steady Aurora and RDS fleet, migrating some RDS for Oracle to Aurora PostgreSQL and some tables to DynamoDB this year** → **Database Savings Plan**; engine-specific reserved DB instances would strand.
- **Aurora Serverless v2 workload running steadily, wants a commitment discount** → **Database Savings Plan** (RIs do not cover serverless).
- **Stable RDS PostgreSQL on db.r5 for 3 years, maximum discount** → **RDS reserved DB instances**, 3-year; Database SP does not cover pre-Gen-7 instances and is 1-year only.
- **Redshift provisioned cluster runs 24/7** → **Redshift reserved nodes**; Database SP is the distractor (Redshift not covered).
- **Five teams share one EKS cluster; finance needs monthly cost per namespace** → enable **split cost allocation data**, query CUR 2.0 in Athena; Cost Explorer alone shows only EC2 instance cost.
- **Shared networking and security accounts must be charged back to business units in proportion to their spend** → **Cost Categories** with **proportional split charges**.
- **Must prevent untagged resources and report existing ones** → **SCP** (`aws:RequestTag` null check) to prevent, **tag policy** to standardize values, **Config `required-tags`** to detect existing resources.
- **Several product teams call the same Bedrock model; need chargeback per team** → one **application inference profile** per team with cost allocation tags; monitor `InputTokenCount`/`OutputTokenCount` in CloudWatch.
- **Two VPCs in the same Region exchange 50 TB/month through Transit Gateway** → add **VPC peering** between them to avoid TGW per-GB processing (keep TGW for everything else).
- **Hundreds of VPCs across accounts need any-to-any routing** → **Transit Gateway**; peering mesh is unmanageable despite lower per-GB cost.
- **CloudWatch Logs bill dominated by ingestion of verbose audit logs read only during investigations** → new log groups in the **Infrequent Access (Essentials)** class, set retention; Standard class only where metric/subscription filters are needed.
- **Log groups created years ago still hold all data** → default retention is **never expire**—set retention and **export** compliance copies to S3 with Glacier lifecycle.
- **Custom metric costs jumped after adding `customerId` as a dimension** → remove **high-cardinality dimensions**; put the ID in the log (EMF property, not dimension) and query with Logs Insights.
- **All application logs streamed to OpenSearch, cost too high** → **subscription filter** pattern that forwards only errors/required events; keep the rest in CloudWatch with short retention.
- **X-Ray costs high on a high-traffic API** → adjust **sampling rules** (lower fixed rate, higher for critical routes) instead of tracing every request.
