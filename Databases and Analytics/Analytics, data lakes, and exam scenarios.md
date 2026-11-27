# Analytics, data lakes, and exam scenarios

AWS analytics questions on SAP-C03 are about assembling the cheapest, lowest-overhead pipeline: **S3 as the data lake**, **Glue Data Catalog** as the shared metadata layer, **Lake Formation** for governance, and the right query engine (**Athena**, **Redshift**, **EMR**, **OpenSearch**) for the consumer. Prefer **serverless** options unless the question demands control or sustained heavy compute.

SAP-C03 Task 1.5 adds **lakehouse** (Apache Iceberg), **real-time vs batch pipelines** (MSK, EMR, AppFlow), and **cross-account data sharing** (Glue Data Catalog, Lake Formation, **AWS Clean Rooms**)—covered in `Lakehouse, streaming, and data sharing.md`.

## Data lake reference architecture
```text
INGEST                 STORE              CATALOG             PROCESS              CONSUME
Kinesis / Firehose --> S3 raw zone  -->  Glue crawlers  -->  Glue ETL / EMR  -->  Athena (ad hoc SQL)
MSK, DMS (CDC)         S3 curated zone   Glue Data Catalog   (to Parquet,         Redshift (+ Spectrum)
DataSync, Transfer     (Parquet, part-   Lake Formation      partitioned)         QuickSight dashboards
AppFlow (SaaS)         itioned)          permissions                              SageMaker / EMR
```
- Separate **raw**, **cleaned**, and **curated** prefixes/buckets; apply S3 lifecycle rules to raw data.
- Ingest tools: **DMS** for database CDC, **DataSync** for file shares/on-premises bulk, **Transfer Family** for SFTP partners, **AppFlow** for SaaS (Salesforce, etc.), **Firehose** for streaming delivery.

## AWS Glue
- **Data Catalog**: Hive-compatible metastore of databases/tables/partitions used by Athena, Redshift Spectrum, EMR, and Lake Formation.
- **Crawlers**: infer schema and partitions from S3/JDBC sources and update the catalog on a schedule.
- **ETL jobs**: serverless **Spark** (batch or streaming) or Python shell; **job bookmarks** process only new data; Glue Studio for visual authoring; **Glue Data Quality** for rules.
- **Glue DataBrew**: **no-code** visual data preparation for analysts (cleaning, normalising, profiling).

**Exam tip**: "Analysts with no coding skills must clean data" → **DataBrew**. "Schema of new S3 data must appear in Athena automatically" → **crawler** (or partition projection for predictable partitions).

## AWS Lake Formation
- Central governance on top of the Glue Data Catalog: **database, table, column, row, and cell-level** permissions via data filters—instead of complex S3 bucket policies.
- **LF-tags** (tag-based access control): grant access by tag (`classification=confidential`) so permissions scale as tables grow.
- **Cross-account sharing** via AWS RAM: share catalog resources to other accounts or the whole organization; consumers query with Athena/Redshift Spectrum/EMR without copying data.
- Permissions enforced for integrated engines (Athena, Redshift Spectrum, EMR, Glue).

## Amazon Athena
- Serverless SQL on S3; pay **per TB scanned**. Cost and speed both improve by scanning less:
  - **Partitioning** (e.g. `year=/month=/day=`) and **partition projection** (no crawler or `MSCK REPAIR` needed).
  - **Columnar formats** (**Parquet**, **ORC**) + compression → read only needed columns. Convert with Glue ETL, Firehose format conversion, or Athena **CTAS**.
  - Avoid many tiny files—compact them.
- **Federated query**: Lambda-based connectors query DynamoDB, RDS, Redshift, CloudWatch Logs, and others in place.
- **Workgroups**: separate teams, enforce result locations and encryption, set **per-query and per-workgroup data scan limits** for cost control.
- **Apache Iceberg** tables support ACID `UPDATE`/`DELETE`/`MERGE` and time travel on S3.

## Amazon Redshift
| | Provisioned (RA3) | Redshift Serverless |
| --- | --- | --- |
| Capacity | Choose node type/count | RPUs scale automatically |
| Billing | Per node-hour (Reserved Instances available) | Per RPU-second used |
| Best for | Steady, predictable, 24/7 warehouse | Intermittent, unpredictable, or new workloads |

- **RA3 managed storage** separates compute and storage—scale compute without resizing for storage.
- **Redshift Spectrum**: query S3 data (via Glue Data Catalog) from Redshift and join with local tables—keep cold data in S3.
- **Data sharing**: live, read access across clusters, accounts, and Regions **without copying** (RA3 or Serverless).
- **Concurrency scaling**: adds transient capacity for bursts of concurrent queries; free credits accrue daily (about one hour per day per cluster).
- **Zero-ETL integrations**: Aurora MySQL/PostgreSQL, RDS MySQL, and DynamoDB replicate into Redshift in near real time—no pipeline to build.
- **Streaming ingestion** directly from Kinesis Data Streams and MSK into materialized views.
- Workload management (WLM) queues, cross-Region snapshot copy for DR, pause/resume for provisioned clusters.

## Amazon EMR
| Deployment | Choose when |
| --- | --- |
| **EMR on EC2** | Full control of Hadoop/Spark/Hive/HBase/Presto, custom AMIs, long-running clusters |
| **EMR on EKS** | Organisation already runs EKS; share cluster with other workloads |
| **EMR Serverless** | Run Spark/Hive jobs without managing clusters—least overhead |

- Node types: **primary** (coordination), **core** (HDFS + tasks), **task** (compute only). Use **Spot for task nodes**; On-Demand/Reserved for primary and core (losing core nodes risks HDFS data).
- Store data in **S3 (EMRFS)** rather than HDFS so clusters can be transient; use **managed scaling** and instance fleets.

**Exam tip**: Existing on-premises Hadoop/Spark jobs with minimal rewrite → **EMR**. New simple SQL ETL → **Glue** or **Athena CTAS** (less overhead).

## Amazon OpenSearch Service
- Full-text search, log analytics, and **OpenSearch Dashboards**. Multi-AZ domains with dedicated primary nodes; **UltraWarm** and **cold** storage tiers lower cost for older indices.
- **OpenSearch Serverless** removes cluster sizing; **OpenSearch Ingestion** provides managed pipelines.
- Zero-ETL from DynamoDB adds search to DynamoDB data without custom streaming code.

## Streaming, briefly
See the `AWS kinesis` folder for details, and `Lakehouse, streaming, and data sharing.md` for the MSK vs Kinesis decision and batch vs real-time pipelines.
| Need | Service |
| --- | --- |
| Custom real-time consumers, replay, ordering per shard | **Kinesis Data Streams** |
| Load streaming data into S3/Redshift/OpenSearch with no code, near real time | **Amazon Data Firehose** |
| Apache Kafka compatibility, migrate Kafka | **Amazon MSK** (provisioned or Serverless) |
| Stateful stream processing (windows, joins) | **Managed Service for Apache Flink** (legacy Kinesis Data Analytics for SQL is being retired) |

## Amazon QuickSight
Serverless BI: **SPICE** in-memory engine for fast dashboards, **row-level security**, embedded dashboards for external users, pay-per-session reader pricing, natural-language Q&A (now under the Amazon Q / Quick Suite branding). Connects to Athena, Redshift, RDS, S3, and SaaS sources.

## Choose the right approach
| Requirement | Answer |
| --- | --- |
| Ad hoc SQL on S3, infrequent, least overhead | **Athena** |
| Reduce Athena cost | **Parquet/ORC + partitioning + compression** |
| Complex BI over TB–PB, many concurrent users | **Redshift** |
| Warehouse used a few hours a day, unpredictable | **Redshift Serverless** |
| Join warehouse tables with cold data in S3 | **Redshift Spectrum** |
| Share live warehouse data with another account | **Redshift data sharing** |
| Near-real-time analytics on Aurora without ETL | **Aurora zero-ETL to Redshift** |
| Column/row-level access to data lake across accounts | **Lake Formation** (+ LF-tags, RAM) |
| Lift existing Spark/Hadoop jobs | **EMR** (Spot task nodes) / **EMR Serverless** |
| Serverless Spark ETL with catalog integration | **Glue ETL** |
| Full-text search or log analytics dashboards | **OpenSearch Service** |
| Business dashboards with per-user row filtering | **QuickSight** + row-level security |
| Key-value at any scale, serverless | **DynamoDB** |
| Relational, high availability, many read replicas | **Aurora** |
| Graph relationships | **Neptune** |

## Common exam scenarios
- **Athena queries scan entire CSV dataset and cost too much** → convert to **Parquet**, partition by date, use partition projection; workgroup scan limits as guardrail.
- **Data lake permissions in S3 bucket policies are unmanageable** → **Lake Formation** with **LF-tags**.
- **Central data lake account shares tables with business-unit accounts** → Lake Formation **cross-account sharing** via RAM; no data copies.
- **Nightly Spark jobs on EMR, minimise cost** → transient cluster, data in S3, **Spot task nodes** (or EMR Serverless).
- **Redshift slows at 9 AM when many analysts log in** → **concurrency scaling**.
- **Historical Redshift data rarely queried but must remain joinable** → unload to S3 Parquet, query with **Spectrum**.
- **Two Redshift teams in different accounts need the same live data** → **data sharing**, not snapshots/UNLOAD.
- **Operational reports on Aurora without impacting production and without ETL code** → **zero-ETL to Redshift**.
- **Stream clickstream into S3 as Parquet with least code** → **Firehose** with format conversion (Glue schema).
- **Kafka migration with minimal changes** → **Amazon MSK**.
- **Search product catalog stored in DynamoDB** → **DynamoDB zero-ETL to OpenSearch**.
- **Lambda functions exhaust Aurora connections** → **RDS Proxy**.
- **Global users need local writes on key-value data** → **DynamoDB global tables**.
- **Relational DR in another Region, RPO about a second, RTO about a minute** → **Aurora Global Database**.
- **Read-heavy DynamoDB, microsecond reads, minimal code changes** → **DAX**.
- **SQL Server app migrating off licences with minimal code changes** → **Babelfish for Aurora PostgreSQL**.
- **Existing unencrypted RDS must be encrypted** → encrypted snapshot copy → restore → DMS sync → cutover.
- **Time-series IoT data for a new project** → **Timestream for InfluxDB** (LiveAnalytics is closed to new customers) or DynamoDB/S3 + Athena by access pattern.
- **Immutable ledger option offered (QLDB)** → discontinued; prefer Aurora PostgreSQL with audit design.
