# Choosing a database on AWS

AWS pushes **purpose-built databases**: pick the engine by **data model** and **access pattern**, not by habit. SAP-C03 questions usually describe the workload (key-value lookups at massive scale, graph traversals, SQL Server lift-and-shift, sub-millisecond reads) and offer four plausible engines—the discriminators are the data model, scaling model, and how much code has to change.

## Purpose-built database selection
| Service | Data model | Typical access pattern / clue in the question |
| --- | --- | --- |
| **RDS** (MySQL, PostgreSQL, MariaDB, Oracle, SQL Server, Db2) | Relational | Existing relational app, joins, lift-and-shift, licence-bound engines (Oracle/SQL Server) |
| **Aurora** (MySQL/PostgreSQL compatible) | Relational | Relational with higher performance, fast failover, up to 15 replicas, cross-Region DR |
| **DynamoDB** | Key-value / document | Single-digit ms at any scale, known access patterns, serverless, spiky traffic |
| **DocumentDB** | Document (MongoDB compatible) | Migrate MongoDB workloads, JSON documents with flexible queries |
| **Keyspaces** | Wide-column (Cassandra/CQL) | Migrate Apache Cassandra without managing clusters |
| **Neptune** | Graph (Gremlin, openCypher, SPARQL) | Social graphs, fraud rings, recommendations, knowledge graphs—"relationships between entities" |
| **ElastiCache** (Valkey, Redis OSS, Memcached) | In-memory key-value | Cache in front of a DB, session store, leaderboards—see `Amazon ElastiCache` folder |
| **MemoryDB** | In-memory, **durable** (Valkey/Redis OSS API) | Primary database needing microsecond reads **and** Multi-AZ durability |
| **Timestream** | Time series | IoT/telemetry. **Timestream for LiveAnalytics is closed to new customers**; **Timestream for InfluxDB** is the current option |
| **OpenSearch Service** | Search index | Full-text search, log analytics, fuzzy matching, dashboards |
| **Redshift** | Columnar data warehouse | OLAP, complex aggregations over TB–PB, BI reporting |

**Exam tip**: **QLDB is discontinued**—do not pick it for new designs. For an immutable, verifiable audit trail today, AWS points to **Aurora PostgreSQL** (with audit tables/extensions) or an event log pattern; treat any QLDB option as a distractor unless the question is clearly legacy.

**Exam tip**: "Cache" ≠ "database". If the data must survive node failure without a separate system of record, choose **MemoryDB**, not ElastiCache.

## MemoryDB vs ElastiCache
MemoryDB is newly listed in the SAP-C03 in-scope services.

| | ElastiCache (Valkey / Redis OSS) | MemoryDB (Valkey / Redis OSS API) |
| --- | --- | --- |
| Role | **Cache** in front of a system of record; session store | **Primary, durable** in-memory database |
| Durability | Asynchronous replication—recent writes can be lost on failover | Writes committed to a **Multi-AZ transaction log** before acknowledgement—no data loss on failover |
| Latency | Sub-millisecond reads **and** writes | Microsecond reads, **single-digit ms writes** (log commit) |
| Consistency | Eventual on replicas | Strong on the primary, eventual on replicas |
| Cost | Lower; also Memcached and serverless options | Higher (instances + data written); worth it only if you would otherwise run cache **plus** a database |
| Typical clue | "Reduce database load", "cache query results", "session state" | "Microsecond reads, durable, no separate database", "Redis as the primary store" |

**Exam tip**: "Replace ElastiCache + RDS with one fully durable Redis-compatible store" → **MemoryDB**. "Speed up reads from RDS, data can be rebuilt" → **ElastiCache** (cheaper). Both offer reserved nodes; **Database Savings Plans** cover ElastiCache (**Valkey** only), but MemoryDB is not on the covered-services list.

## RDS high availability and read scaling
| | Multi-AZ DB **instance** | Multi-AZ DB **cluster** | **Read replicas** |
| --- | --- | --- | --- |
| Purpose | HA / failover | HA **and** read scaling | Read scaling, cross-Region DR |
| Topology | 1 primary + 1 standby (other AZ) | 1 writer + **2 readable standbys** in 3 AZs | Primary + async replicas |
| Replication | Synchronous | Semi-synchronous | Asynchronous |
| Standby readable? | **No** | **Yes** (reader endpoint) | Yes |
| Failover | Automatic, typically 1–2 minutes | Automatic, typically faster (under ~35 s) | Manual **promotion** |
| Engines | All RDS engines | MySQL and PostgreSQL only | MySQL/MariaDB/PostgreSQL up to 15; Oracle/SQL Server up to 5 |
| Cross-Region | No | No | Yes (except some engine limits) |

- Read replicas can themselves be Multi-AZ, and a promoted replica becomes a standalone DB (replication breaks).
- **RDS Blue/Green Deployments**: staging copy kept in sync; switchover for major version upgrades or schema changes with minimal downtime.

**Exam tip**: "Standby must also serve reads" on RDS MySQL/PostgreSQL → **Multi-AZ DB cluster**. Classic Multi-AZ standby is never readable.

## Aurora architecture
```text
           Cluster endpoint (writer)      Reader endpoint (load-balanced)
                    |                              |
              [Writer]   [Replica]   [Replica]  ... up to 15 replicas
                    \________|___________/
            Shared cluster volume: 6 copies across 3 AZs
            (writes need 4/6, reads 3/6; self-healing, auto-grows)
```
- **Storage** is decoupled from compute; replicas read the same volume so **replica lag is typically milliseconds**.
- **Failover** promotes a replica (priority tiers 0–15), typically under 30 seconds. No replicas → Aurora recreates the writer (slower).
- **Endpoints**: **cluster** (writer), **reader** (round-robin over replicas), **custom** (subset of instances, e.g. larger instances for analytics), plus instance endpoints.
- **Replica auto scaling**: Application Auto Scaling adds/removes replicas on CPU or connection metrics.
- **Backtrack** (Aurora **MySQL** only): rewind the cluster in place to a point in time (up to 72 hours) without restoring—fast fix for a bad `DELETE`.
- **Cloning**: copy-on-write clone in minutes; ideal for test/dev from production without full copy cost. Cross-account cloning via RAM.
- **Global Database**: one primary Region plus read-only secondary Regions using storage-level replication (lag typically under 1 second). Managed **switchover** (planned, RPO 0) or **failover** (unplanned, RTO typically around a minute). **Write forwarding** lets secondary Regions send writes to the primary.
- **Serverless v2**: capacity in ACUs, can mix with provisioned instances—details in `Amazon Aurora/Aurora Serverless v2.md`.
- **Aurora Limitless Database** (PostgreSQL): automated horizontal sharding for write scale beyond a single writer.
- **Aurora DSQL**: serverless distributed SQL (PostgreSQL compatible) with active-active multi-Region—newer service, appears where "multi-Region writes with strong consistency, relational" is required.

| Storage config | Billing | Choose when |
| --- | --- | --- |
| **Aurora Standard** | Instance + storage + **per-I/O** charges | Low/moderate I/O |
| **Aurora I/O-Optimized** | Higher instance/storage price, **no I/O charges** | I/O is a large share of spend (AWS guidance: >25%) or I/O cost is unpredictable |

**Babelfish for Aurora PostgreSQL** understands SQL Server's **T-SQL** and **TDS** wire protocol—migrate SQL Server apps with **minimal code changes** and no SQL Server licence.

## Database cost optimization (Skill 3.4.3)
| Workload pattern | Cost-optimal choice |
| --- | --- |
| Intermittent, spiky, or dev/test relational load | **Aurora Serverless v2** (scales in ACUs; can scale to 0 ACUs with auto-pause on supported versions) |
| I/O is a large share of the Aurora bill | **Aurora I/O-Optimized** (no per-I/O charges; see table above) |
| Steady relational instance, fixed engine/family/Region | **RDS/Aurora reserved DB instances** (1 or 3 years) |
| Mixed engines, migrations, serverless, multi-Region DB spend | **Database Savings Plans** (1-year, No Upfront, Gen 7+ instances, up to 35% serverless / 20% provisioned) |
| DynamoDB spiky/unknown | **On-demand** capacity mode |
| DynamoDB steady | **Provisioned + auto scaling + reserved capacity** |
| DynamoDB storage-heavy, rarely read | **Standard-IA table class** |
| Non-prod databases idle at night | Stop/start schedule (RDS restarts after 7 days), Aurora Serverless v2 |

Database SP vs reserved instances decision table: `Cost Optimization/Purchase options - Savings Plans, Reserved Instances, and Spot.md`.

**Exam tip**: Reserved DB instances do **not** cover Aurora Serverless v2; **Database Savings Plans** do. Database SPs apply only to Gen 7+ instances (for example `db.r7g`), so upgrading the instance class can be part of the savings plan.

## RDS Proxy
- Fully managed **connection pooling** in your VPC for RDS and Aurora (MySQL, PostgreSQL, MariaDB, SQL Server).
- Solves **Lambda connection storms**—thousands of concurrent functions share a small pool.
- **Faster failover**: proxy keeps client connections and reroutes to the new writer (AWS cites up to ~66% reduction).
- Credentials from **Secrets Manager**; can enforce **IAM authentication** to the proxy.
- Not public—clients must be in (or reach) the VPC.

## RDS Custom
Managed RDS for **Oracle** and **SQL Server** **with OS and database access** (SSH/RDP, custom patches, third-party agents). Choose when an app needs privileged access that standard RDS blocks but you still want automated backups and monitoring. Otherwise standard RDS (less overhead) or EC2 (full control). **RDS Custom for Oracle is listed as out of scope for SAP-C03**—expect RDS Custom questions, if any, to involve SQL Server.

## Encryption limitations
- Encryption at rest (KMS) must be chosen **at creation**; you **cannot** encrypt an existing unencrypted instance in place.
- Replicas and snapshots inherit encryption; you cannot create an encrypted replica from an unencrypted primary.
- **Encrypt an existing DB**: snapshot → **copy snapshot with encryption enabled** (choose CMK) → restore new instance → cut over. For minimal downtime, keep the new DB in sync with **DMS** (or native replication) before cutover.
- Cross-Region snapshot copy/replica of an encrypted DB needs a KMS key **in the destination Region**.

## Choose the right approach
| Requirement | Answer |
| --- | --- |
| Relational, minimal admin, fast failover, many readers | **Aurora** with replicas |
| SQL Server app, avoid licence cost, minimal code changes | **Babelfish for Aurora PostgreSQL** |
| SQL Server needing OS-level access but managed backups | **RDS Custom for SQL Server** |
| Lambda exhausting DB connections | **RDS Proxy** |
| Relational DR across Regions, RPO ~1 s | **Aurora Global Database** |
| Undo accidental delete within hours, no restore | **Aurora Backtrack** (MySQL) |
| Fresh prod copy for testing quickly and cheaply | **Aurora cloning** |
| High I/O bill on Aurora | Switch to **I/O-Optimized** |
| MongoDB migration | **DocumentDB** |
| Cassandra migration | **Keyspaces** |
| Fraud ring / relationship queries | **Neptune** |
| Durable in-memory primary DB | **MemoryDB** |
| Cache in front of RDS/DynamoDB, data rebuildable | **ElastiCache** (cheaper than MemoryDB) |
| Flexible commitment across DB engines/serverless | **Database Savings Plans** |
| Fixed engine/instance for 3 years, max discount | **Reserved DB instances** |

## Common exam scenarios
- **Unencrypted RDS must become encrypted with minimal downtime** → encrypted snapshot copy + restore, DMS to sync changes, then cut over; there is no in-place toggle.
- **Reporting queries slow the OLTP writer** → Aurora replica with a **custom endpoint** for reporting, or RDS read replica.
- **Unpredictable, intermittent relational load** → **Aurora Serverless v2**; avoid over-provisioned instances.
- **Failover takes too long and app reconnects slowly** → **RDS Proxy** and/or Aurora (faster than RDS Multi-AZ instance).
- **Major version upgrade with minimal downtime** → **RDS Blue/Green Deployments**.
- **Write throughput exceeds largest single Aurora writer** → **Aurora Limitless** (PostgreSQL) or redesign onto **DynamoDB**.
- **Application uses ElastiCache plus a separate database only for durability of Redis data** → consolidate on **MemoryDB**.
- **Aurora bill shows I/O as roughly half of spend** → **Aurora I/O-Optimized**.
- **Steady Aurora Serverless v2 and RDS usage, team will also adopt DynamoDB** → **Database Savings Plan** for a 1-year flexible commitment.
