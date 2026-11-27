# Multi-Region data replication and exam scenarios

Once the DR strategy is chosen, the exam tests **which native replication feature** delivers the required RPO with the least effort. Data is the hard part—compute can be rebuilt from AMIs and IaC; lost data cannot.

## Per-service replication summary
| Service | Mechanism | Typical RPO | Failover |
| --- | --- | --- | --- |
| **Aurora Global Database** | Storage-level async replication to secondary Regions | Typically **< 1 second** lag | Switchover (planned) or failover (unplanned), ~minute-level RTO |
| **RDS cross-Region read replica** | Engine-native async replication | Seconds–minutes (lag-dependent) | **Manual promote** to standalone |
| **RDS automated backup replication** | Snapshots + transaction logs copied to another Region | Minutes (PITR) | Restore new instance (slower RTO) |
| **DynamoDB global tables** | Multi-active replication | Typically ~1 second (eventual) | None needed—every replica writable |
| **S3 CRR (+ RTC)** | Async object replication | RTC: **99.99% of objects within 15 minutes** (SLA) | Point app/MRAP at replica bucket |
| **ElastiCache Global Datastore** | Async cross-Region (Valkey/Redis OSS) | Typically sub-second | Manual promote secondary |
| **EFS replication** | Managed async replication | Designed for **RPO of 15 minutes** | Delete replication → destination becomes writable |
| **EBS / AMI** | Snapshot / AMI copy (DLM or AWS Backup) | Schedule-based (hours) | Launch from copy |
| **FSx** | Cross-Region backup copy; **SnapMirror** for FSx for ONTAP | Schedule / near-continuous (SnapMirror) | Restore / break mirror |

## Aurora Global Database
- One **primary** Region (read/write) and **secondary** Regions (read-only), replicated at the **storage layer**—no load on the primary's DB engine.
- **Switchover** (planned, formerly managed planned failover): primary and secondary swap roles with **no data loss** (RPO 0); use for DR drills or Region rotation.
- **Failover** (unplanned): promote a secondary when the primary Region is impaired; data loss up to the replication lag.
- **Write forwarding**: apps in a secondary Region send writes that are forwarded to the primary—lets you deploy the app in every Region without app-level routing of writes.
- Global writer endpoint keeps the write endpoint name stable across switchover/failover.

**Exam tip**: "Cross-Region relational DR, RPO seconds, RTO about a minute" → Aurora Global Database. Cross-Region read replicas are the cheaper, slower-to-recover distractor.

## RDS cross-Region options
- **Cross-Region read replica**: async; promote manually (becomes standalone—replication ends; repoint app). Good for pilot light.
- **Cross-Region automated backup replication**: copies automated backups and logs to another Region so you can do **PITR in the DR Region**—cheaper than a running replica, slower RTO.
- Snapshot copy cross-Region: simplest backup & restore option.

## DynamoDB global tables
- **Multi-active**: every replica accepts reads and writes; replication typically within about a second.
- Default conflict resolution: **last writer wins** (eventual consistency across Regions).
- **Multi-Region strong consistency (MRSC)** became available in 2025: strongly consistent reads across Regions and **RPO of zero**, with constraints (a fixed three-Region configuration, which may use a witness Region, and limited Region sets). Higher write latency—choose only when the scenario explicitly demands zero data loss across Regions.
- Global tables do not replace backups—enable **PITR** to recover from bad writes, which replicate everywhere.

## S3 replication
| Feature | Detail |
| --- | --- |
| **CRR / SRR** | Requires **versioning** on source and destination; async; new objects only |
| **Existing objects** | Use **S3 Batch Replication** |
| **RTC** | 15-minute SLA for 99.99% of objects + replication metrics and events |
| **Delete marker replication** | Off by default; enable per rule. Deletes of **specific versions** are never replicated (protects against malicious deletes) |
| **Replica modification sync** | Replicates metadata changes made on replicas back—used with **two-way replication** |
| **SSE-KMS objects** | Must be explicitly enabled; destination KMS key required |

**Multi-Region Access Points (MRAP)**: one global endpoint over multiple buckets with replication. **Failover controls** set buckets **active or passive**, so you can shift S3 traffic to another Region within minutes without changing application endpoints.

## Other replication features
- **ElastiCache Global Datastore**: one primary cluster, read-only secondaries in other Regions; promote a secondary on failover. Cache data is usually rebuildable, so this matters when warm-cache RTO matters.
- **EBS snapshot copy / AMI copy**: cross-Region (and cross-account) copies; automate with **Data Lifecycle Manager** or AWS Backup. Encrypted copies need a KMS key in the destination Region.
- **EFS replication**: read-only replica file system in another Region or AZ; failover by deleting the replication configuration; failback by replicating back.
- **FSx**: copy backups cross-Region (all FSx types); FSx for NetApp ONTAP **SnapMirror** for continuous replication.
- **KMS multi-Region keys**: same key ID/material in each Region so replicated ciphertext decrypts in DR without re-encryption.
- **Secrets Manager replica secrets**: replicas stay in sync with the primary (including rotation); **promote** a replica to standalone in DR.
- **ECR replication**: registry-level cross-Region and cross-account replication, filterable by repository prefix—images ready in DR Region.
- **CloudFormation StackSets**: deploy identical infrastructure to many accounts/Regions—keeps DR Region IaC in sync for pilot light/warm standby.

## Choose the right approach
| Requirement | Answer |
| --- | --- |
| Relational DB, RPO ~1 s, RTO ~1 min, cross-Region | **Aurora Global Database** |
| Planned Region swap with zero data loss | Aurora Global Database **switchover** |
| Relational DR, lowest cost, RTO hours | RDS **cross-Region snapshot copy / automated backup replication** |
| Relational DR with PITR in DR Region | RDS **cross-Region automated backup replication** |
| Global users writing in every Region | **DynamoDB global tables** |
| Cross-Region NoSQL with RPO zero | DynamoDB global tables **MRSC** |
| S3 replication with a compliance-backed time guarantee | **S3 CRR + RTC** |
| Replicate objects that existed before the rule | **S3 Batch Replication** |
| Single S3 endpoint with Region failover | **Multi-Region Access Points** + failover controls |
| Shared file system in DR Region, 15-min RPO | **EFS replication** |
| Decrypt replicated data in DR Region | **KMS multi-Region keys** |
| DB credentials available in DR Region | **Secrets Manager replica secrets** |
| Container images available in DR Region | **ECR cross-Region replication** |
| Identical infra in DR Region across accounts | **CloudFormation StackSets** |
| On-prem servers, RPO seconds, RTO minutes | **AWS Elastic Disaster Recovery** |
| Central immutable backups for all accounts | **AWS Backup** + Organizations policies + **Vault Lock** |
| Shift users to the replicated Region | Route 53 failover, **Global Accelerator**, or **ARC** routing controls / Region switch (see `What is disaster recovery on AWS.md`) |

## Common exam scenarios
- **"Aurora MySQL, RPO under a few seconds, RTO under a minute, across Regions"** → Aurora Global Database; cross-Region read replica is slower to promote and repoint.
- **"Quarterly DR drill must cause no data loss and be reversible"** → Aurora Global Database **switchover**, then switch back.
- **"Aurora failover plus app scale-up and traffic shift must run as one ordered, repeatable procedure"** → **ARC Region switch** plan (Aurora Global Database, Auto Scaling, and routing execution blocks).
- **"App in secondary Region needs to write occasionally without re-architecting"** → Aurora **write forwarding**.
- **"RDS Oracle, cheapest DR, RTO 8 hours"** → automated backup replication or snapshot copy to DR Region; read replica/Global Database is overspending.
- **"Users on three continents update the same items; must stay available if a Region fails"** → DynamoDB global tables (last writer wins).
- **"Financial ledger in DynamoDB, zero data loss across Regions"** → global tables with **multi-Region strong consistency**.
- **"Bad batch job corrupted DynamoDB items in all Regions"** → restore with **PITR**; replication propagated the corruption.
- **"Must prove 99.99% of S3 objects replicate within 15 minutes"** → S3 **RTC**.
- **"Replication rule added but old objects are missing in destination"** → **S3 Batch Replication**.
- **"Deleting an object in source must not delete it in DR bucket"** → leave **delete marker replication** off (version deletes never replicate anyway).
- **"Two buckets, writes in both Regions, keep metadata in sync"** → two-way replication + **replica modification sync**, fronted by **MRAP**.
- **"Shift S3 traffic to DR Region without changing app endpoints"** → MRAP **failover controls**.
- **"Encrypted EBS snapshots copied to DR Region fail to restore"** → copy must use a KMS key in the destination Region (or a **multi-Region key**).
- **"Lambda in DR Region cannot read DB password after failover"** → **Secrets Manager replica secret** in DR Region.
- **"ECS tasks in DR Region fail to pull images during outage"** → **ECR cross-Region replication** configured beforehand.
- **"Legacy Windows app on-prem with local SQL Server, RTO 30 minutes"** → **DRS**; AWS Backup restore would miss the RTO.
- **"Ransomware deleted backups in prod account"** → AWS Backup cross-account copy to locked vault / **logically air-gapped vault**.
- **"DR Region infrastructure drifts from production"** → **CloudFormation StackSets** (or pipeline deploying to both Regions).
- **"Lowest-cost web tier DR, RTO 4 hours"** → AMIs + IaC in DR Region (backup & restore); warm standby is the expensive distractor.
