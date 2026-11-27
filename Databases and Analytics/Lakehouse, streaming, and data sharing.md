# Lakehouse, streaming, and data sharing

SAP-C03 Task 1.5 explicitly adds **lakehouse architectures** (Apache Iceberg, Lake Formation, Redshift Spectrum), **real-time and batch pipelines** (EMR, Redshift, **MSK**, **AppFlow**), and **cross-account data sharing** (Glue Data Catalog, Lake Formation, **AWS Clean Rooms**). Questions test which sharing mechanism fits the trust boundary and which pipeline fits the latency requirement. Basics of S3 data lakes, Glue, Athena, and Redshift are in `Analytics, data lakes, and exam scenarios.md`.

## Data lake vs data warehouse vs lakehouse
| | Data lake | Data warehouse | Lakehouse |
| --- | --- | --- | --- |
| Storage | Files on **S3** (Parquet, ORC, JSON) | Proprietary managed storage (Redshift) | Files on S3 in an **open table format** (**Apache Iceberg**) |
| Schema | On read | On write | On write, with **schema evolution** |
| Transactions | None—overwrite files/partitions | Full ACID | **ACID** row-level `INSERT`/`UPDATE`/`DELETE`/`MERGE` |
| Engines | Athena, EMR, Glue, Spectrum | Redshift only | Any Iceberg engine: Athena, EMR, Glue, Redshift, Flink, Firehose |
| Best for | Cheap raw storage, ML, exploration | Fast BI, complex joins, many concurrent users | One copy of data for SQL, Spark, and ML with warehouse-like semantics |

## Apache Iceberg on S3
- **Open table format**: metadata files track which data files make up each **snapshot** of a table.
- **ACID** with optimistic concurrency—concurrent writers do not corrupt the table; CDC upserts with `MERGE`.
- **Schema evolution**: add, drop, rename, widen columns without rewriting data. **Hidden partitioning** and **partition evolution**—queries do not need partition columns, and the partition scheme can change.
- **Time travel**: query `FOR TIMESTAMP AS OF` / a snapshot ID for audits, reproducible ML training, or rollback.
- **Compaction**: streaming and CDC create many small files and delete files—compact them (Glue Data Catalog **automatic table optimization**, Spark `rewrite_data_files`), expire old snapshots, and remove orphan files to control cost and query time.

### Amazon S3 Tables
- A **table bucket** type that stores **Iceberg tables as first-class resources** (table-level permissions and APIs).
- **Managed maintenance enabled by default**: compaction (default target 512 MB files), snapshot management (expire old snapshots), unreferenced file removal. AWS cites up to ~3x faster queries than self-managed Iceberg in a general purpose bucket.
- Integrates with the Glue Data Catalog (`s3tablescatalog`) so **Athena, Redshift, EMR, Glue, and Firehose** can query or write; Lake Formation governs access.

**Exam tip**: "Iceberg tables on S3, small-file problem, least operational overhead" → **S3 Tables** (or Glue automatic table optimization for existing general purpose buckets), not a scheduled custom Spark compaction job.

### Lakehouse architecture of Amazon SageMaker (brief)
Formerly branded **SageMaker Lakehouse**: unifies S3 data lakes (including S3 Tables) and **Redshift managed storage** behind the Glue Data Catalog, exposed through the **Iceberg REST API** with Lake Formation permissions. **SageMaker Unified Studio** is the single workspace for SQL, notebooks, ETL, and ML on that data. Zero-ETL integrations can land operational data directly in it.

### Redshift and the lake
- **Redshift Spectrum** (RA3) / the integrated lake query engine (Serverless, Graviton RG nodes) queries S3 tables in the Glue Data Catalog and joins them with local tables.
- Redshift can **read and write Iceberg** tables (self-managed on S3 or in S3 Tables): `CREATE TABLE ... USING ICEBERG`, `INSERT`, `UPDATE`, `DELETE`, `MERGE`.

## Cross-account cataloging and sharing
- **Glue Data Catalog** is per account per Region. Cross-account access without Lake Formation needs a **catalog resource policy** plus **S3 bucket policy**—coarse and hard to manage.
- **Lake Formation cross-account sharing**: grant database/table/column/row permissions to another account, an OU, or the organization. Uses **AWS RAM** under the hood; the consumer accepts the share and creates a **resource link** in its own catalog to query with Athena, Redshift Spectrum, EMR, or Glue. No data copies.
- **LF-tags (LF-TBAC)**: tag databases/tables/columns (`domain=sales`, `pii=true`) and grant on tag expressions—new tables are shared automatically when tagged. Preferred at scale (data mesh with producer and consumer accounts).

| Mechanism | Shares | Partner can see raw rows? | Best for |
| --- | --- | --- | --- |
| **Lake Formation sharing** | Catalog tables on S3 (incl. Iceberg) | Yes, within granted columns/rows | Internal accounts, data mesh, governed data lake |
| **Redshift data sharing** | Live Redshift databases/schemas/tables | Yes | Warehouse-to-warehouse, cross-account and cross-Region, consumer pays its compute |
| **AWS Clean Rooms** | Joint analysis on combined data | **No**—only results allowed by analysis rules | Multi-party collaboration (advertiser + publisher, bank + retailer) without exposing raw data |
| AWS Data Exchange | Third-party data products (subscribe/license) | Yes | **Out of scope for SAP-C03**; recognize it as a distractor |

## AWS Clean Rooms
- **Collaboration**: two or more member AWS accounts; roles define who **can query**, who **receives results**, and who **pays for compute** (CRPU-hours).
- Data stays in each member's account (S3 via the Glue Data Catalog; also Athena, Snowflake sources). Members associate **configured tables** with an **analysis rule**:
  - **Aggregation**: only `COUNT`/`SUM`/`AVG` with minimum aggregation thresholds—no row-level output.
  - **List**: row-level output of the overlap (for example matched IDs for activation), restricted columns.
  - **Custom**: approved SQL or PySpark **analysis templates**; required for differential privacy.
- **Differential privacy**: adds calibrated noise and enforces a **privacy budget** so results cannot reveal whether an individual is in the data.
- **Cryptographic computing (C3R)**: encrypt data client-side before it enters the collaboration.
- **Clean Rooms ML**: train **lookalike** models (or custom models) on one party's data and generate segments from another party's seed data without either sharing raw records.

**Exam tip**: "Two companies want to measure campaign overlap without sharing customer PII with each other" → **AWS Clean Rooms** (aggregation rule, optionally differential privacy). Lake Formation and Redshift data sharing expose rows to the consumer.

## Real-time vs batch pipelines
| | Kinesis Data Streams | Amazon MSK |
| --- | --- | --- |
| API | AWS Kinesis API, KCL | **Apache Kafka** protocol—existing producers/consumers, Kafka Connect, Kafka Streams |
| Capacity | **On-demand** (no sizing) or provisioned shards | **Provisioned** (Standard or **Express** brokers) or **MSK Serverless** |
| Ops | Fully managed, minimal tuning | Partitions, topics, broker configs to manage (least with Serverless) |
| AWS integration | Native with Lambda, Firehose, Flink, Redshift streaming ingestion | Lambda, Firehose, Flink, Redshift streaming ingestion, **MSK Connect** |
| Choose when | New AWS-native streaming, least operational overhead | Migrating Kafka, need Kafka ecosystem/semantics, multi-cloud portability |

- **MSK Provisioned – Standard brokers**: most configurable, you manage EBS/tiered storage. **Express brokers**: storage fully managed, faster scaling and recovery, higher throughput per broker. **MSK Serverless**: no capacity management, pay per data volume, least configurable.
- **MSK Connect**: managed, autoscaling **Kafka Connect** workers—run Debezium CDC sources or S3/OpenSearch sinks without servers.
- **Amazon Managed Service for Apache Flink**: stateful stream processing (windows, joins, exactly-once) on KDS or MSK.
- **Amazon Data Firehose**: no-code, buffered (near-real-time) delivery to S3, Redshift, OpenSearch, HTTP endpoints, and **Iceberg tables**; format conversion to Parquet. Can read from KDS or MSK.
- **Redshift streaming ingestion**: materialized views over KDS/MSK—low-latency analytics without staging in S3.
- **EMR** for batch: **EMR on EC2** (full control, Spot task nodes), **EMR on EKS** (share an existing EKS cluster), **EMR Serverless** (least overhead). Glue ETL for serverless Spark with catalog integration.
- **Zero-ETL integrations**: Aurora MySQL/PostgreSQL, RDS (MySQL, PostgreSQL, Oracle), and DynamoDB replicate into **Redshift** (or the SageMaker lakehouse) without pipelines; application sources such as Salesforce and SAP are also supported via Glue zero-ETL.

### Amazon AppFlow (SaaS ingestion)
- Managed, no-code flows between **SaaS apps** (Salesforce, SAP OData, ServiceNow, Zendesk, Slack, Marketo, Google Analytics, and more) and **S3, Redshift**, or back to SaaS (for example S3 → Salesforce).
- Triggers: **on demand**, **scheduled** (incremental), or **event-driven** (for example Salesforce change events).
- Built-in mapping, filtering, masking, and validation; encryption with KMS; **PrivateLink** for supported SaaS so traffic avoids the internet.

**Exam tip**: "Ingest Salesforce data into S3 daily, no code" → **AppFlow**. "Replicate Salesforce objects into Redshift continuously" → **zero-ETL** integration is also valid; choose based on target and transformation needs.

## Choose the right approach
| Requirement | Answer |
| --- | --- |
| ACID updates/deletes and time travel on S3 data | **Apache Iceberg** tables |
| Managed Iceberg with automatic compaction | **S3 Tables** |
| Join warehouse tables with S3 lake data | **Redshift Spectrum** / Redshift Iceberg support |
| Share governed lake tables with other internal accounts | **Lake Formation** + **LF-tags** (RAM, resource links) |
| Share live warehouse data across accounts/Regions | **Redshift data sharing** |
| Joint analysis with an external partner, no raw data exposure | **AWS Clean Rooms** (+ differential privacy) |
| Lookalike audience from partner data | **Clean Rooms ML** |
| Migrate self-managed Kafka with minimal change | **Amazon MSK** (Express brokers or Serverless) |
| New AWS-native stream, least ops | **Kinesis Data Streams on-demand** |
| Kafka CDC/sink connectors without servers | **MSK Connect** |
| Stateful streaming aggregations | **Managed Service for Apache Flink** |
| Stream to S3/Iceberg as Parquet, no code | **Firehose** |
| Spark/Hadoop batch, minimal ops | **EMR Serverless** (EMR on EC2 for full control) |
| Operational DB to warehouse without pipelines | **Zero-ETL** to Redshift |
| SaaS (Salesforce, ServiceNow) to S3 | **AppFlow** |

## Common exam scenarios
- **GDPR deletes must remove individual customer rows from the S3 data lake** → **Iceberg** tables with `DELETE`/`MERGE`; rewriting Parquet partitions is the high-effort distractor.
- **Auditors need to see a table exactly as it was last quarter** → Iceberg **time travel** (within snapshot retention).
- **Streaming CDC into Iceberg creates thousands of small files, queries slow** → **S3 Tables** automatic compaction or Glue **automatic table optimization**.
- **Central data lake account shares hundreds of tables with BU accounts; new tables must be shared automatically** → Lake Formation **LF-tag** grants to the consumer accounts.
- **Consumer account cannot see a shared Lake Formation table in Athena** → accept the **RAM** share and create a **resource link** in the consumer catalog; grant its users permissions on the link.
- **Retailer and CPG brand want overlap counts of shared customers; neither may see the other's customer list** → **AWS Clean Rooms** collaboration with **aggregation analysis rule**.
- **Partner queries must not allow re-identification through repeated queries** → Clean Rooms **differential privacy** with a privacy budget.
- **Advertiser wants to find users similar to its best customers in a publisher's data** → **Clean Rooms ML** lookalike segments.
- **Subsidiary needs live access to the parent's Redshift tables in another Region** → **Redshift data sharing**; unload/copy is the distractor.
- **On-premises Kafka cluster with Kafka Connect pipelines moving to AWS, minimal code change** → **Amazon MSK** + **MSK Connect**.
- **Spiky, unpredictable Kafka workload, team wants no broker sizing** → **MSK Serverless**.
- **Kafka cluster needs faster scaling and less storage management at high throughput** → MSK Provisioned with **Express brokers**.
- **New clickstream ingestion, AWS-native, minimal operations** → **Kinesis Data Streams on-demand** + Firehose to S3.
- **Real-time fraud scoring needs sliding-window aggregations over a stream** → **Managed Service for Apache Flink**.
- **Dashboards in Redshift need seconds-fresh data from Kinesis** → **Redshift streaming ingestion** materialized views.
- **Nightly Spark jobs, team does not want to manage clusters** → **EMR Serverless**.
- **Near-real-time analytics on Aurora PostgreSQL without building ETL** → **Aurora zero-ETL integration with Redshift**.
- **Marketing wants daily Salesforce opportunities in S3 for Athena, no code, private connectivity** → **Amazon AppFlow** scheduled flow (PrivateLink).
- **Buy third-party market data feeds** → AWS Data Exchange exists but is **out of scope**; pick Clean Rooms only when the need is privacy-preserving joint analysis.
