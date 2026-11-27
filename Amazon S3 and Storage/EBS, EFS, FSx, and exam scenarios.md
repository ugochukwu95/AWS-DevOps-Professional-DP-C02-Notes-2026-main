# EBS, EFS, FSx, and exam scenarios

Block, file, and object storage solve different problems. **EBS** is block storage for one EC2 instance in one AZ; **EFS** is a managed NFS file system shared by many Linux clients across AZs; **FSx** provides managed third-party file systems (Windows, Lustre, NetApp ONTAP, OpenZFS). The exam often hinges on **protocol** (SMB vs NFS vs iSCSI), **OS**, and **AZ scope**.

## EBS volume types
| Type | Class | Max IOPS / volume | Max throughput / volume | Key characteristic | Use case |
| --- | --- | --- | --- | --- | --- |
| **gp3** | General purpose SSD | 80,000 | 2,000 MiB/s | Baseline 3,000 IOPS + 125 MiB/s at any size (up to 64 TiB); IOPS and throughput provisioned independently of size | Default for boot volumes, most apps |
| **gp2** | General purpose SSD | 16,000 | 250 MiB/s | 3 IOPS/GiB; small volumes burst to 3,000 IOPS on credits | Legacy—migrate to gp3 (cheaper per GB) |
| **io2 Block Express** | Provisioned IOPS SSD | 256,000 | 4,000 MiB/s | Sub-ms latency, 99.999% durability, up to 64 TiB | Largest, most I/O-intensive databases (SAP HANA, Oracle) |
| **io1** | Provisioned IOPS SSD | 64,000 | 1,000 MiB/s | 50 IOPS/GiB ratio, 99.8–99.9% durability | Legacy provisioned IOPS—prefer io2 |
| **st1** | Throughput optimized HDD | 500 | 500 MiB/s | Large sequential I/O; cannot be a boot volume | Big data, data warehouses, log processing |
| **sc1** | Cold HDD | 250 | 250 MiB/s | Lowest cost per GB; cannot be a boot volume | Infrequently accessed sequential data |

- Highest IOPS figures require **Nitro** instances, and the **instance's EBS bandwidth** caps aggregate performance—an EBS-optimized instance limit is a common hidden bottleneck.
- Volume type, size, and IOPS can be changed in place with **Elastic Volumes** (no detach); size can only grow.
- RAID 0 across volumes increases performance beyond a single volume; RAID 1 is pointless (EBS already replicates within the AZ).

### gp2 → gp3 and IOPS provisioning (Skill 3.4.2)
| | gp2 | gp3 |
| --- | --- | --- |
| How you get IOPS | **3 IOPS per GiB** of size (min 100); under 1 TiB bursts to 3,000 on credits | **3,000 IOPS + 125 MiB/s included** at any size; buy extra IOPS (up to 500 per GiB) and throughput separately |
| Example: 200 GiB volume needing 6,000 IOPS | Must grow to **2,000 GiB** just for IOPS | Keep 200 GiB, provision **6,000 IOPS** |
| Price | Higher per GB | Lower per GB; pay only for IOPS/throughput above baseline |

- Migrate with **Elastic Volumes** (`ModifyVolume`, no detach or downtime); set gp3 IOPS/throughput to match what the gp2 volume actually used (CloudWatch `VolumeReadOps`/`VolumeWriteOps`), not its theoretical maximum.
- **Compute Optimizer** recommends EBS volume type and IOPS changes, including over-provisioned io1/io2 that would be cheaper as gp3.
- Use **io2 Block Express** only for sub-millisecond latency, 99.999% durability, Multi-Attach, or more than gp3's 80,000 IOPS.

**Exam tip**: "Need more IOPS but not more storage" → **gp3** (provision IOPS independently) before jumping to io2. "More than 80,000 IOPS on one volume" or "sub-millisecond latency for a critical database" → **io2 Block Express**.

## EBS Multi-Attach, snapshots, and automation
- **Multi-Attach** — **io1/io2 only**, attach to up to **16 Nitro instances in the same AZ**. Requires a cluster-aware file system; standard ext4/XFS will corrupt data.
- **Snapshots** — incremental, stored regionally (durably in S3, not visible in your buckets). Copy across Regions and accounts; encrypted snapshots need key access (see `AWS KMS` notes).
- **EBS Snapshots Archive** — up to 75% cheaper storage for rarely restored snapshots; minimum 90 days (pro-rated charge if deleted earlier), restore takes 24–72 hours. Archiving converts an incremental snapshot to a **full** snapshot, so archive only long-retention snapshots.
- **Recycle Bin** — retention rules recover accidentally deleted snapshots and AMIs.
- **EBS snapshot lock** — WORM protection per snapshot. **Governance mode**: authorized users can unlock. **Compliance mode**: after an optional **cooling-off period (1–72 hours)** nobody, including root, can unlock or shorten it—only extend. Ransomware/compliance details in the `Disaster Recovery` folder.
- Volumes restored from snapshots **lazy-load** blocks from S3—first reads are slow. **Fast Snapshot Restore (FSR)** removes that penalty, enabled **per snapshot per AZ**, billed per hour. The alternative is to pre-warm by reading every block (`fio`/`dd`).

### Amazon Data Lifecycle Manager (DLM)
Explicitly in scope for SAP-C03 (Skill 3.4.4). Free; you pay only for the snapshots it keeps.
- **Policy types**: EBS snapshot policies (target volumes or instances by **tag**), EBS-backed **AMI** policies (create and deregister), and **cross-account copy event** policies.
- **Schedules**: up to 4 per policy (for example hourly, daily, weekly, monthly), each with its own **count- or age-based retention**.
- **Cost-optimized retention**: short retention for frequent snapshots, long retention only for monthly/yearly; **archive to EBS Snapshots Archive** automatically (monthly/yearly schedules, 90-day minimum in archive).
- **Cross-Region / cross-account copy** with separate retention for the copy; optional **Fast Snapshot Restore** on created snapshots.
- **Default policies**: one-click account/Region-wide backups of all volumes or instances not covered by other policies.

| Need | Choose |
| --- | --- |
| EBS snapshots/AMIs only, tag-driven, lowest cost | **DLM** |
| Many services (RDS, DynamoDB, EFS, FSx, EBS), org-wide backup policies, Vault Lock, central reporting | **AWS Backup** (see `Disaster Recovery`) |

## Instance store
- Physically attached NVMe/SSD—very high IOPS, lowest latency, included in instance price.
- Data **survives reboot** but is **lost on stop, hibernate, terminate**, or host failure.
- Use for caches, buffers, scratch, or data replicated elsewhere (for example Cassandra, Kafka with replication). Never for the only copy of data.

## Amazon EFS
Managed **NFS (v4.0/v4.1)** file system for **Linux** (POSIX); not supported on Windows. Mount targets in each AZ; thousands of concurrent clients from EC2, ECS, EKS, Lambda, and on-premises (via DX/VPN).

| Setting | Options | Choose |
| --- | --- | --- |
| **Availability** | Regional (multi-AZ) / One Zone | One Zone for cheaper dev or re-creatable data |
| **Performance mode** | **General Purpose** / Max I/O | General Purpose (lowest latency, default); Max I/O is legacy for highly parallel workloads and has higher latency |
| **Throughput mode** | **Elastic** / Provisioned / Bursting | Elastic for spiky or unknown; Provisioned for steady high throughput on small data size; Bursting scales with stored size using credits |
| **Storage class** | Standard / Infrequent Access (IA) / Archive (One Zone and One Zone-IA for One Zone) | Lifecycle management moves files by days since last access |

- **Lifecycle management** — transition to IA and Archive after N days without access; optionally move back to Standard on first access. IA and Archive charge per-GB reads.
- **Access points** — enforce a POSIX user/group and a root directory per application; combine with IAM authorization for multi-tenant containers.
- **Replication** — managed same-Region or **cross-Region** replication to a read-only replica file system; failover by deleting the replication configuration to make the replica writable. RPO is measured in minutes.
- Encryption at rest must be chosen **at creation**; in-transit via the EFS mount helper (TLS).

**Exam tip**: Throughput errors on a small Bursting file system that cannot afford to grow → switch to **Elastic** (or Provisioned), not Max I/O.

**Exam tip**: "EFS bill high, most files untouched after a month" → **lifecycle policy** to IA (and Archive for files untouched for months) with **transition back to Standard on first access** for files that become hot again. It is the EFS equivalent of S3 Intelligent-Tiering—no application change.

## Amazon FSx comparison
| | FSx for Windows File Server | FSx for Lustre | FSx for NetApp ONTAP | FSx for OpenZFS |
| --- | --- | --- | --- | --- |
| Protocols | **SMB** | Lustre client (Linux) | **NFS, SMB, iSCSI** (multi-protocol) | **NFS** |
| Clients | Windows (and Linux via SMB) | Linux HPC/ML | Windows, Linux, macOS | Linux, macOS, Windows NFS |
| Key features | Active Directory, NTFS ACLs, DFS Namespaces, shadow copies, dedup | Sub-ms latency, massive throughput; **link to S3** (lazy-load, export results) | SnapMirror, FlexClone, dedup/compression, automatic tiering to capacity pool | Snapshots, clones, ZFS compression |
| AZ options | Single-AZ / Multi-AZ | Single-AZ only | Single-AZ / Multi-AZ | Single-AZ / Multi-AZ |
| Typical migration | Windows file servers, home dirs, SQL Server shares | HPC, genomics, ML training, media rendering | On-prem NetApp, mixed Windows/Linux shares | On-prem ZFS or Linux NFS servers |

- **Lustre Scratch** — no data replication, cheapest, for short-lived jobs; data lost on server failure. **Lustre Persistent** — data replicated within the AZ, for long-running or repeated workloads.
- Lustre **data repository association** presents S3 objects as files; results can be exported back to S3 automatically.

## Choose the right approach
| Requirement | Answer |
| --- | --- |
| Shared file storage for Linux across AZs, minimal ops | **EFS** (Regional) |
| Shared Windows file shares with AD and NTFS ACLs | **FSx for Windows File Server** Multi-AZ |
| HPC job processing S3 data at hundreds of GB/s | **FSx for Lustre** linked to S3 |
| Temporary HPC scratch space, lowest cost | FSx for Lustre **Scratch** |
| Same data via NFS and SMB, or iSCSI LUNs | **FSx for NetApp ONTAP** |
| Lift-and-shift on-prem ZFS | **FSx for OpenZFS** |
| Highest IOPS block volume for a database | **io2 Block Express** |
| General workload, tune IOPS independent of size | **gp3** |
| Cheap sequential throughput, non-boot | **st1** (cold: **sc1**) |
| Restored volumes need full performance immediately | **Fast Snapshot Restore** |
| Automate EBS snapshots by tag with retention | **DLM** (or AWS Backup for multi-service) |
| Snapshots nobody (even root) can delete for N days | **EBS snapshot lock**, compliance mode |
| Monthly snapshots kept for years, rarely restored | DLM policy with **archive tier** retention |
| Cut EFS cost for aging files, no app change | **EFS lifecycle** to IA / Archive |
| gp2 volume over-sized only to get IOPS | **gp3** at the real size + provisioned IOPS |
| Unknown object access pattern, minimal ops | S3 **Intelligent-Tiering** |
| Archive read once or twice a year, 12-hour retrieval OK | S3 **Glacier Deep Archive** |
| Archive needs millisecond access, quarterly reads | S3 **Glacier Instant Retrieval** |
| Lowest-latency object storage beside compute | S3 **Express One Zone** |

## Common exam scenarios
- **Logs accessed for 30 days, then rarely, kept 7 years** → lifecycle: Standard → Standard-IA (30 days) → Glacier Deep Archive, expire after 7 years.
- **Millions of objects under 128 KB moving to Glacier** → transition overhead outweighs savings; keep in Standard/Intelligent-Tiering or aggregate into larger objects first.
- **Analytics app hits 503 Slow Down on one prefix** → spread keys across multiple prefixes; each gets 3,500 writes/5,500 reads per second.
- **Global users upload large files to one bucket slowly** → **Transfer Acceleration** plus multipart upload.
- **Bucket costs growing from invisible storage** → lifecycle rule to **abort incomplete multipart uploads** and expire noncurrent versions; find them with **Storage Lens**.
- **Need to encrypt billions of existing objects with a new CMK** → **S3 Inventory + Batch Operations** copy in place.
- **Must restore archived data within minutes in an emergency** → Glacier Flexible Retrieval **Expedited** with **provisioned capacity** (or Glacier Instant Retrieval if planned).
- **Regulator requires undeletable records for 7 years, even by root** → Object Lock **compliance mode** with default retention.
- **Second-Region copy with a documented 15-minute RPO** → CRR with **Replication Time Control**.
- **Replication enabled but old objects missing in destination** → replication is new-objects only; run **S3 Batch Replication**.
- **Private subnet EC2 reading S3, NAT gateway bill is high** → add an S3 **gateway endpoint** (free).
- **On-premises servers must reach S3 privately over Direct Connect** → S3 **interface endpoint**; gateway endpoints are not reachable from on-premises.
- **Static site on S3 must only be reachable through CloudFront** → REST origin with **OAC** and bucket policy on `AWS:SourceArn`.
- **High KMS costs and throttling on SSE-KMS bucket** → enable **S3 Bucket Keys**.
- **Clustered application needs shared block storage in one AZ** → **io2 Multi-Attach** with a cluster-aware file system.
- **Windows workloads need a shared file system integrated with AD, survive AZ failure** → **FSx for Windows File Server Multi-AZ** (not EFS—Linux only).
- **ML training reads a large S3 dataset repeatedly at high throughput** → **FSx for Lustre** linked to the bucket (Persistent if reused, Scratch if one-off).
- **Company migrating NetApp filers with NFS and SMB clients, wants SnapMirror** → **FSx for NetApp ONTAP**.
- **Containers on EKS/ECS across AZs need shared persistent storage with per-app directories** → **EFS** with **access points**.
- **EFS throughput throttled, file system is small but busy** → change to **Elastic throughput**.
- **Restored EBS database volumes slow on first queries after DR** → enable **Fast Snapshot Restore** on the snapshots in the target AZs.
- **Temporary high-IOPS scratch data that can be lost** → **instance store**, not EBS io2 (cheaper and faster).
- **2 TiB gp2 volumes provisioned only to reach 6,000 IOPS, data is 300 GiB** → new right-sized **gp3** volume with 6,000 provisioned IOPS (Elastic Volumes can change type but cannot shrink size—copy data to a smaller volume).
- **io1 volumes at 10,000 IOPS for a general workload** → **gp3** with 10,000 provisioned IOPS; io2 only when latency/durability demands it.
- **Daily snapshots kept 7 days, monthly kept 7 years, minimum effort** → **DLM** policy with two schedules; monthly schedule **archives** to EBS Snapshots Archive.
- **Ransomware must not be able to delete backups, even with admin credentials** → **EBS snapshot lock compliance mode** (or AWS Backup Vault Lock—see `Disaster Recovery`).
