# AWS Transform MGN and DMS

Two workhorses for SAP-C03 migrations (Skills 4.1.2 and 4.1.3): **AWS Transform MGN** moves whole **servers** (rehost), and **AWS Database Migration Service (DMS)** moves **databases** with minimal downtime (rehost or replatform, homogeneous or heterogeneous). **AWS Transform** wraps MGN in an agentic end-to-end workflow. MGN replaces **Server Migration Service (SMS)** and **CloudEndure Migration**.

## AWS Transform MGN
AWS Transform MGN was previously known as **AWS Application Migration Service** (renamed June 8, 2026; same service and capabilities, and the short name **MGN** is unchanged). It is the replication engine that AWS Transform uses to rehost servers.

**Continuous block-level replication** of source servers (physical, VMware, Hyper-V, other clouds, or EC2 in another Region) into AWS, then launch as native EC2 instances.

```text
Source server + AWS Replication Agent
   │  continuous block-level replication (encrypted, TCP 1500)
   ▼
Staging area subnet: lightweight replication servers + low-cost EBS volumes
   │  launch test or cutover instance (conversion to boot natively on EC2)
   ▼
Target subnet: production EC2 instances
```

| Concept | Detail |
| --- | --- |
| **Replication agent** | Installed on each source server; agentless replication also exists for **vCenter** environments |
| **Staging area** | Subnet in your account with small replication servers and cheap EBS; keeps costs low until launch |
| **Replication settings** | Staging subnet, instance type for replication servers, EBS type, encryption, bandwidth throttling, private connectivity (DX/VPN) |
| **Launch templates** | EC2 launch template per server — instance type (or right-sizing), subnet, security groups, IAM profile, tags |
| **Test launch** | Launch test instances without stopping replication; validate, then mark ready for cutover |
| **Cutover launch** | Stop source app, wait for final sync, launch cutover instances, finalize (replication stops) |
| **Post-launch actions** | SSM documents run on launched instances — install CloudWatch/SSM agents, uninstall source tools, custom scripts, disaster recovery hardening |
| **Pricing** | Free for a period per server (90 days); you pay for staging resources and launched instances |

**Exam tip**: "Lift and shift hundreds of servers with minimal downtime and minutes of cutover" → **AWS Transform MGN**. Cutover downtime is only the final sync and boot, because replication is continuous.

**Related**: **AWS Elastic Disaster Recovery (DRS)** uses the same replication technology for ongoing DR, not one-time migration.

## AWS Transform
Agentic AI service for migration and modernization. Agents do the heavy lifting; humans review and approve at each step.

| Capability | What it does |
| --- | --- |
| **Migrations (including VMware)** | Discovery, dependency mapping, wave planning, **network conversion** (VPCs, subnets, security groups, transit gateways, route tables as CloudFormation, CDK, Terraform, or Landing Zone Accelerator code), landing zone setup, then rehost to EC2 (via MGN) or containerize |
| **Windows full-stack** | Modernize **.NET** apps (for example .NET Framework to cross-platform .NET on Linux), **SQL Server** databases, and deployment processes to exit Windows/SQL licensing |
| **Mainframe** | Assess the portfolio, analyze COBOL code, **refactor to Java**, or "reimagine" from extracted business rules |
| **Custom transformations** | Org-wide code changes: Java, Node.js, Python version upgrades, runtime migrations, language translations, learned from your samples and docs |
| **Continuous modernization** | Ongoing detection and remediation of end-of-life dependencies, outdated frameworks, and vulnerabilities across many repositories |

Two ways to rehost: the **AWS Transform MGN console** for direct control over replication and cutover, or the **AWS Transform agentic workflow** (discovery → wave plan → network → rehost). You can switch to the MGN console at the rehost stage.

**Exam tip**: "Migrate a large VMware estate to native EC2 and automate dependency mapping, wave planning, and VPC creation" → **AWS Transform** (for VMware). "Just replicate these servers and cut over" → **AWS Transform MGN**.

## VMware Cloud on AWS and relocate
- **Relocate** = move VMs at the hypervisor level with no conversion to EC2 and no new tooling.
- **VMware Cloud on AWS**: VMware SDDC (vSphere, vSAN, NSX) on dedicated bare-metal hosts in AWS; use **HCX** for bulk migration or live **vMotion**.
- **Amazon Elastic VMware Service (EVS)**: run VMware Cloud Foundation in your own VPC on EC2 bare metal.
- Choose relocate when the requirement is **keep VMware skills/tools**, **fastest datacenter exit**, or **no re-IP/no re-platform**. Choose AWS Transform / AWS Transform MGN when the goal is native EC2 (and dropping VMware licensing).
- Neither VMware Cloud on AWS nor Amazon EVS is in the SAP-C03 in-scope list; expect them mainly as distractors.

## AWS Database Migration Service (DMS)
Source DB stays **online** during migration. DMS reads from the source endpoint and writes to the target endpoint.

| Component | Detail |
| --- | --- |
| **Replication instance** | Managed EC2 instance running tasks; size for throughput; Multi-AZ option for task resilience |
| **DMS Serverless** | Automatically provisions and scales capacity — no instance sizing |
| **Source / target endpoints** | Connection info for databases, S3, Kinesis, Kafka, OpenSearch, DynamoDB, Redshift, and more |
| **Task** | Table mappings, transformation rules, migration type |

| Migration type | What it does | Use |
| --- | --- | --- |
| **Full load** | Copy existing data once | Downtime acceptable, or static data |
| **CDC only** | Replicate ongoing changes from transaction logs | Data already loaded by native tools |
| **Full load + CDC** | Copy, then apply changes until cutover | **Minimal downtime** migrations |

- CDC requires source log settings (for example MySQL **binary logging in ROW format**, Oracle supplemental logging, SQL Server MS-CDC/replication, PostgreSQL logical replication).
- **Data validation**: compares source and target rows after full load and during CDC.
- **LOB handling**: **limited LOB mode** (truncates at a max size; fastest), **full LOB mode** (complete but slow), **inline LOB mode** (small LOBs inline, large ones looked up).
- DMS migrates **data and basic tables**, not secondary indexes, stored procedures, users, or triggers — those come from SCT/native tools.
- **DMS Fleet Advisor** (database fleet inventory) reached end of support on May 20, 2026; use **Migration Evaluator** or AWS Transform assessments for database fleet planning.

| | Homogeneous | Heterogeneous |
| --- | --- | --- |
| Example | MySQL → RDS/Aurora MySQL, PostgreSQL → Aurora PostgreSQL | Oracle → Aurora PostgreSQL, SQL Server → Aurora MySQL |
| Schema | Native tools or DMS homogeneous data migrations | **SCT** or **DMS Schema Conversion** first |
| Data | DMS or native tools | DMS |

## Schema Conversion Tool and DMS Schema Conversion
- **AWS SCT**: downloadable desktop tool; converts schema, views, stored procedures, functions; produces an **assessment report** showing what converts automatically and what needs manual effort.
- **DMS Schema Conversion**: same capability as a managed feature in the DMS console (no local install).
- SCT **data extraction agents** can pull data from data warehouses (Teradata, Netezza, Oracle DW) to **Redshift**.

**Exam tip**: "Oracle to Aurora PostgreSQL with least effort" → **SCT/DMS Schema Conversion** for schema + **DMS full load + CDC** for data. DMS alone does not convert stored procedures.

## Large databases: offline seed + DMS CDC
When the network is too slow for the initial load:
1. Take a native backup/export (or SCT data extraction agent output) onto your own storage devices, recording the log position.
2. Bring the devices to an **AWS Data Transfer Terminal** and upload to **S3** over its high-throughput connection.
3. Restore/load from S3 into the target, then run **DMS CDC** from the recorded position to catch up.

The older pattern of SCT extraction onto **Snowball Edge** still appears in practice questions, but Snowball Edge is closed to new customers and not in the SAP-C03 in-scope list.

## Native tool alternatives
| Source → target | Native approach |
| --- | --- |
| PostgreSQL → RDS/Aurora PostgreSQL | `pg_dump` / `pg_restore`, or logical replication |
| MySQL → Aurora MySQL (large) | **Percona XtraBackup** to S3 → restore Aurora cluster from S3; then binlog replication to catch up |
| MySQL → RDS MySQL | `mysqldump`/`mydumper`, XtraBackup restore from S3, binlog replication |
| SQL Server → RDS SQL Server | **Native backup/restore** of `.bak` from **S3** (option group `SQLSERVER_BACKUP_RESTORE`) |
| Oracle → RDS Oracle | **Oracle Data Pump** export, transfer dump file via S3 integration, import with `DBMS_DATAPUMP` |
| RDS MySQL/PostgreSQL → Aurora | Create an **Aurora read replica** of the RDS instance, then promote (minimal downtime) |

**Exam tip**: For **homogeneous, very large** databases, native backup/restore is usually faster than a DMS full load; add DMS CDC or native replication to shrink the cutover window.
