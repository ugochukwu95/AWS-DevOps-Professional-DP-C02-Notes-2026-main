# Modernization and exam scenarios

After (or instead of) a lift-and-shift, SAP-C03 (Skills 4.1.4–4.1.6 and 1.3.3) expects you to pick the **managed or serverless replacement** that removes operational overhead with the least rework. The best answer is usually the **closest managed equivalent** that keeps protocols and APIs compatible.

## Strangler fig pattern
Incrementally replace a monolith by routing individual features to new services while the rest stays on the legacy system.

```text
Clients → routing layer (API Gateway / ALB path rules / VPC Lattice)
            ├── /orders   → new microservice (Lambda or ECS)
            └── /*        → legacy monolith (EC2)
```
- Migrate feature by feature; the legacy app shrinks until it can be retired.
- Lower risk than a "big bang" rewrite; each step can be rolled back by changing routing.
- **Migration Hub Refactor Spaces** used to automate this scaffolding but is closed to new customers (November 7, 2025); build the routing layer with **API Gateway** or **ALB** rules directly.

## Monolith to microservices
| Target | Choose when |
| --- | --- |
| **Lambda** | Event-driven, short-running (max 15 minutes), spiky traffic, least ops |
| **ECS on Fargate** | Containerized services, no cluster management, simplest container option |
| **EKS** | Kubernetes already in use, portability, Kubernetes ecosystem tooling |
| **Elastic Beanstalk** | Simple web apps/APIs with minimal platform knowledge (App Runner is not in the SAP-C03 in-scope list) |

**AWS App2Container** containerizes existing Java and .NET apps and generates ECS/EKS deployment artifacts, a replatform step before refactoring. **AWS Transform** can also containerize during migration.

## Legacy integration with data transformation
Skill 1.3.3: put a modern interface in front of a legacy system and **transform data in the integration layer**, so neither side has to change.

| Legacy interface | Integration pattern |
| --- | --- |
| SOAP/XML or fixed-width HTTP service | **API Gateway** REST API facade with **mapping templates** for request/response reshaping, or a **Lambda** integration for complex XML ↔ JSON conversion |
| On-prem service reachable only privately | API Gateway **private integration** (VPC link → NLB → on-prem IPs over DX/VPN) |
| JMS/AMQP/MQTT application | **Amazon MQ** broker as the bridge; **Lambda** consumes from the broker (event source mapping) and transforms into SQS/EventBridge/DynamoDB |
| Message enrichment or filtering between systems | **EventBridge Pipes** (source such as Amazon MQ or SQS → filter → enrich with Lambda/API → target) or EventBridge input transformers |
| Multi-step translation with retries/compensation | **Step Functions** orchestrating Lambda transforms |
| Batch file drops from legacy systems | **Transfer Family** or S3 File Gateway → S3 event → Lambda/Glue transform |

**Exam tip**: "Expose a legacy SOAP backend as a JSON REST API without changing the backend" → **API Gateway + Lambda (or mapping templates)**. "Legacy app speaks JMS; new services are serverless" → **Amazon MQ** + Lambda consumer.

## Commercial databases
| Source | Modern target | Notes |
| --- | --- | --- |
| Oracle | **Aurora PostgreSQL** | SCT/DMS Schema Conversion + DMS; removes Oracle licensing |
| SQL Server | **Babelfish for Aurora PostgreSQL** | Understands **T-SQL** and the SQL Server wire protocol (TDS) — minimal application code changes |
| SQL Server (keep engine) | **RDS for SQL Server** | Replatform; license included |
| Any, with key-value access | **DynamoDB** | Refactor; only when access patterns fit |

**Exam tip**: "Move off SQL Server licensing with the fewest application changes" → **Babelfish for Aurora PostgreSQL**.

## Messaging and streaming
| Current | Target | Why |
| --- | --- | --- |
| Self-managed ActiveMQ / RabbitMQ (JMS, AMQP, MQTT, STOMP, OpenWire) | **Amazon MQ** | Protocol-compatible — **no code change** |
| New or refactored apps | **SQS / SNS / EventBridge** | Serverless, near-unlimited scale, but requires code changes to AWS APIs |
| Self-managed Apache Kafka | **Amazon MSK** (provisioned or Serverless) | Kafka APIs compatible; **MSK Connect** for Kafka Connect |
| Simple streaming ingestion, AWS-native | **Kinesis Data Streams / Firehose** | Requires producer/consumer changes |

## Scheduled jobs
- Cron servers on EC2 → **EventBridge Scheduler** (cron, rate, one-time schedules, time zones, retries, DLQ) targeting Lambda, ECS tasks, Step Functions, and many AWS APIs.
- Long or multi-step batch → **Step Functions** (or ECS tasks) triggered on a schedule.

## Windows and .NET
- **Rehost** Windows servers with AWS Transform MGN; consider **license-included** EC2 vs **BYOL on Dedicated Hosts** (licenses tied to physical cores/sockets).
- File servers → **FSx for Windows File Server**; Active Directory → **AWS Managed Microsoft AD** or AD Connector.
- .NET Framework apps → containerize (App2Container, Windows containers on ECS/EKS) or port to modern .NET to run on Linux/Lambda. **AWS Transform** full-stack Windows modernization automates the .NET port plus **SQL Server** modernization and deployment changes.

## Mainframe modernization
- **AWS Transform for mainframe**: assesses the mainframe portfolio, maps business functions, **refactors** COBOL to Java, or **reimagines** applications from extracted business rules. This is the current AWS answer for new mainframe projects.
- The older **AWS Mainframe Modernization Service** (Rocket replatform runtime, Blu Age refactor) is closed to new customers (managed runtime from November 7, 2025; self-managed experience moved to maintenance in an announcement dated June 30, 2026).
- Mainframes are often **retained** in early waves.

## Choose the right approach
| Requirement | Answer |
| --- | --- |
| Business case / TCO before migrating | **AWS Transform assessment** or **Migration Evaluator** |
| Discover server dependencies for wave planning | **AWS Transform** with **agent-based** collection |
| Discover VMware VMs without installing agents | **Agentless collector** or RVTools export into AWS Transform |
| Plan move groups and waves, track migration | **AWS Transform** (Migration Hub is closed to new customers) |
| Rehost many servers, minimal downtime | **AWS Transform MGN** |
| VMware to native EC2 with automated network conversion | **AWS Transform** for VMware |
| Keep VMware tooling, fastest exit | **VMware Cloud on AWS** (relocate) with HCX |
| .NET Framework/SQL Server off Windows licensing | **AWS Transform** full-stack Windows modernization |
| COBOL mainframe to Java | **AWS Transform for mainframe** |
| Java/Python version upgrades across hundreds of repos | **AWS Transform** custom transformations |
| Heterogeneous DB migration | **SCT / DMS Schema Conversion** + **DMS full load + CDC** |
| Minimal-downtime DB migration | **DMS full load + CDC** or native replication |
| Large DB, slow network | Native backup on drives → **Data Transfer Terminal** → S3, then **DMS CDC** |
| RDS MySQL → Aurora MySQL, minimal downtime | **Aurora read replica**, then promote |
| Recurring NFS/SMB sync to S3/EFS/FSx | **DataSync** scheduled task |
| Tens of TB to PB, deadline beyond bandwidth | **Data Transfer Terminal** (Snowball Edge only for existing Snow customers) |
| Data captured on portable drives, needed in S3 within hours | **Data Transfer Terminal** |
| Legacy SOAP/XML service behind a JSON API | **API Gateway** + **Lambda** / mapping templates |
| Legacy JMS app feeding serverless services | **Amazon MQ** + Lambda consumer |
| Partner SFTP uploads to S3 | **Transfer Family** |
| On-prem apps need SMB/NFS backed by S3 | **S3 File Gateway** |
| Replace tape backup | **Tape Gateway** |
| Long-distance uploads to one bucket | **S3 Transfer Acceleration** + multipart |
| Self-managed ActiveMQ with no code change | **Amazon MQ** |
| Self-managed Kafka | **Amazon MSK** |
| Replace cron EC2 instance | **EventBridge Scheduler** |
| SQL Server off licensing, minimal code change | **Babelfish for Aurora PostgreSQL** |

## Common exam scenarios
- **500 VMs must move in 3 months with no code changes and minutes of downtime** → **AWS Transform MGN** with continuous replication, test launches, then cutover per wave.
- **Company still uses SMS or CloudEndure in the options** → distractor; **AWS Transform MGN** is the current service.
- **Question says "AWS Application Migration Service"** → same service as **AWS Transform MGN** (renamed June 2026).
- **Need to know which servers talk to each other before grouping waves** → **agent-based** discovery (network connections) feeding **AWS Transform** move groups and waves.
- **CFO wants projected AWS cost before approving migration** → **AWS Transform assessment** or **Migration Evaluator** business case.
- **2,000 VMware VMs to EC2; team wants automated wave plans and generated VPC/Transit Gateway IaC** → **AWS Transform** for VMware, rehosting through AWS Transform MGN.
- **Portfolio of .NET Framework apps on Windows Server with SQL Server; cut licensing** → **AWS Transform** Windows modernization to .NET on Linux and an open-source-compatible database.
- **COBOL mainframe must become Java services with traceable business rules** → **AWS Transform for mainframe**.
- **Oracle on-prem to Aurora PostgreSQL, near-zero downtime** → **SCT** for schema and code, **DMS full load + CDC**, cut over when lag is near zero.
- **5 TB MySQL to Aurora MySQL quickly** → **Percona XtraBackup** to S3, restore Aurora from S3, binlog replication to catch up (faster than DMS full load).
- **SQL Server `.bak` files to RDS SQL Server** → upload to S3, **native restore** via `SQLSERVER_BACKUP_RESTORE` option group.
- **DMS task truncates large text columns** → **limited LOB mode** max size too small; increase it or use **full/inline LOB mode**.
- **DMS CDC from MySQL not capturing changes** → enable **binary logging in ROW format** and sufficient binlog retention.
- **200 TB in 2 weeks over a 1 Gbps link shared with production** → bandwidth math fails (~23 days at 80% use, far longer when shared) → copy to drives and upload at a **Data Transfer Terminal**, then DataSync for deltas.
- **Autonomous-vehicle test fleet fills SSDs daily; engineers need the data in S3 the same day** → **Data Transfer Terminal** reservation near the test site.
- **Option suggests ordering Snowball Edge for a new AWS customer** → not available to new customers (and not in SAP-C03 scope); use **Data Transfer Terminal** or DataSync.
- **Nightly copy of on-prem NFS share to S3 without saturating the WAN** → **DataSync** scheduled task with **bandwidth throttle**.
- **Copy files to EFS privately over Direct Connect** → DataSync agent + **VPC endpoint** for DataSync.
- **Partners use SFTP with their own clients, users in Active Directory** → **Transfer Family** SFTP with **Directory Service** identity.
- **On-prem app needs low-latency access to full dataset plus cloud backup** → **Volume Gateway stored mode**.
- **Expand on-prem block storage without buying arrays** → **Volume Gateway cached mode**.
- **Global users upload large files to one S3 bucket slowly** → **S3 Transfer Acceleration** + **multipart upload**.
- **Monolith must be modernized gradually with no big-bang cutover** → **strangler fig** with API Gateway/ALB routing.
- **Mobile app needs JSON; the on-prem order system only exposes SOAP over a private network** → **API Gateway** with **VPC link** private integration and **Lambda** transformation.
- **Legacy ERP publishes JMS messages; new order service runs on Lambda** → **Amazon MQ for ActiveMQ** with a Lambda event source mapping that transforms and forwards events.
- **Self-managed RabbitMQ cluster, least operational overhead, no code changes** → **Amazon MQ for RabbitMQ** (not SQS, which needs code changes).
- **Cron jobs on a single EC2 instance are a single point of failure** → **EventBridge Scheduler** invoking Lambda or ECS tasks.
- **Keep vCenter operations and migrate a datacenter in weeks** → **VMware Cloud on AWS** with **HCX**.
