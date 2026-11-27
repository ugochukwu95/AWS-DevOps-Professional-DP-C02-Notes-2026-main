# Data transfer - DataSync, Transfer Family, Storage Gateway, and Data Transfer Terminal

SAP-C03 data transfer questions (Skills 4.1.3 and 1.3.2) hinge on **how much data**, **how much bandwidth**, **how much time**, and whether the transfer is **one-time** or **ongoing/hybrid**. Do the math first, then pick online (DataSync, S3 multipart/Transfer Acceleration, Direct Connect) or offline (**AWS Data Transfer Terminal**).

## Transfer time math
```text
time (seconds) = data (bytes) × 8 / (link speed (bits/s) × utilization)
1 TB = 10^12 bytes = 8 × 10^12 bits
1 Gbps fully used ≈ 10.8 TB/day   (80% utilization ≈ 8.6 TB/day)
```
Worked example: 100 TB over 1 Gbps at 80% → 8 × 10^14 / (10^9 × 0.8) = 10^6 s ≈ **11.6 days**.

| Data | Link | Time at 80% utilization |
| --- | --- | --- |
| 10 TB | 100 Mbps | ~11.6 days |
| 10 TB | 1 Gbps | ~1.2 days |
| 50 TB | 500 Mbps | ~11.6 days |
| 100 TB | 1 Gbps | ~11.6 days |
| 100 TB | 10 Gbps | ~1.2 days |
| 1 PB | 1 Gbps | ~116 days |
| 1 PB | 10 Gbps | ~11.6 days |

**Exam tip**: Read whether the link is **shared** with production. "Only 30% of a 1 Gbps link is available" cuts throughput to ~3.2 TB/day, which is often the clue pointing to an **offline** transfer.

## Online vs offline
| Choose online (DataSync, S3 CLI/multipart, DX) when | Choose offline (Data Transfer Terminal) when |
| --- | --- |
| Transfer fits the deadline at available bandwidth | Network transfer would take weeks/months |
| Ongoing or incremental sync is needed | One-time bulk seed, or data already on portable drives |
| Direct Connect already exists | Limited, expensive, or no connectivity at the data source |
| | Data is collected in the field (vehicles, film sets, remote sites) |

Common pattern: **seed offline via Data Transfer Terminal, then sync deltas online with DataSync** (or DMS CDC for databases).

## AWS Data Transfer Terminal
**Secure physical locations** where you bring your **own storage devices** and upload to AWS over a high-throughput connection to the AWS network.

| Aspect | Detail |
| --- | --- |
| How it works | **Reserve a time slot** in the AWS console, assign authorized people, arrive with government-issued photo ID, connect your devices, upload |
| Connectivity | Each facility has at least **two 100G** optical fiber connections to the AWS network; you bring a 100G LR4 QSFP transceiver and use DHCP |
| Destinations | Any AWS endpoint, for example **S3** or **EFS** |
| Devices | Your own SSDs/arrays and laptop (existing Snowball devices can also be brought) |
| Custody | You **keep control of your devices** the whole time; nothing is shipped to AWS |
| Locations | Metro areas in the US, Europe, and Asia Pacific (for example Los Angeles, Seattle, London, Munich, Tokyo, Sydney); check the current list |

**Exam tip**: "Huge datasets created on portable drives (ADAS test fleets, media production), must be in S3 within hours, chain of custody required" → **Data Transfer Terminal**. "Ongoing private, consistent connectivity" → **Direct Connect** instead.

## Snow Family (not in SAP-C03 scope)
- Snowball Edge is **not listed** in the SAP-C03 in-scope services, and AWS **stopped offering Snow Family devices to new customers on November 7, 2025**.
- AWS has announced **end of support for Snowball Edge devices in commercial Regions on December 31, 2026** (GovCloud/ADC customers with active jobs are not affected). Snowmobile and Snowcone were retired earlier.
- AWS's recommended replacements: **DataSync** for online transfer, **Data Transfer Terminal** for physical transfer, **AWS Outposts** for edge compute.
- Treat Snowball answers in older practice questions as the legacy equivalent of "offline bulk transfer."

## AWS DataSync
Managed **online** transfer service for files and objects, with integrity checks and encryption in transit.

- **Agent**: VM (VMware, Hyper-V, KVM) or EC2 instance near the source for on-premises/other-cloud sources. AWS-to-AWS storage transfers do not need an agent.
- **Sources**: NFS, SMB, HDFS, self-managed object storage, other clouds' object storage, AWS storage services.
- **Destinations**: **S3** (any storage class), **EFS**, **FSx for Windows File Server, Lustre, OpenZFS, NetApp ONTAP**.
- **Tasks**: source location + destination location + options (verify data, preserve metadata/permissions, filters, overwrite/delete behaviour).
- **Scheduling**: run tasks on a schedule for recurring incremental sync; only changed data is copied.
- **Bandwidth throttle**: limit task bandwidth so production traffic is not starved.
- **Network path**: internet, **VPN**, or **Direct Connect**; use a **VPC (PrivateLink) endpoint** for private transfer.
- Often much faster than DIY `rsync`/`robocopy` scripts thanks to parallelism; no scripts to maintain.

## AWS Transfer Family
Fully managed **SFTP, FTPS, FTP, and AS2** endpoints backed by **S3** or **EFS**, so partners keep their existing clients and workflows.

| Feature | Detail |
| --- | --- |
| Identity | **Service-managed** users (SSH keys), **AWS Directory Service** (Managed AD), or **custom identity provider** (Lambda / API Gateway) |
| Endpoints | Public, or **VPC** endpoint (optionally internet-facing with Elastic IPs for partner allow-lists) |
| FTP | Plain FTP only inside a VPC (not internet-facing) |
| AS2 | B2B EDI exchange with message disposition notifications |
| Workflows | Managed post-upload processing (copy, tag, decrypt, custom Lambda step) |

**Exam tip**: "External partners upload via SFTP; eliminate the self-managed SFTP server" → **Transfer Family** to S3. "Need static IPs for partner firewall" → VPC endpoint with **Elastic IPs**.

## AWS Storage Gateway
Hybrid storage: on-premises apps use standard protocols while data lives in AWS, with a **local cache** for low latency.

| Type | Protocol | Backing storage | Use |
| --- | --- | --- | --- |
| **S3 File Gateway** | NFS / SMB | Objects in **S3** (one file = one object) | File shares backed by S3, data lake ingest, backups to S3 with lifecycle |
| **FSx File Gateway** | SMB | **FSx for Windows File Server** | Low-latency on-prem access to Windows shares (no longer offered to new customers) |
| **Volume Gateway – cached** | iSCSI | Primary data in S3, hot data cached locally | Expand block storage into AWS, EBS snapshots |
| **Volume Gateway – stored** | iSCSI | Primary data **on premises**, async backup to S3 as EBS snapshots | Low-latency full local dataset + cloud backup/DR |
| **Tape Gateway** | iSCSI VTL | Virtual tapes in S3, archive to **Glacier / Deep Archive** | Replace physical tape with existing backup software |

**Exam tip**: Storage Gateway is for **ongoing hybrid access**; DataSync is for **moving data**. "Replace tape library, keep Veeam/NetBackup" → **Tape Gateway**.

## Hybrid data synchronization patterns
| Need | Pattern |
| --- | --- |
| On-prem NFS/SMB → AWS on a schedule, one-way | **DataSync** scheduled task (incremental, verified, throttled) |
| On-prem apps keep using a file share, data lands in S3 for cloud analytics | **S3 File Gateway**; cloud jobs read the objects directly |
| Objects written to the bucket by cloud apps must appear on the on-prem share | S3 File Gateway **cache refresh** (`RefreshCache` or automated refresh); otherwise the share shows stale listings |
| Bidirectional sync between on-prem and EFS/FSx | Two DataSync tasks (one per direction) on schedules, with clear ownership to avoid conflicts |
| Partners push files that trigger processing | **Transfer Family** + managed workflows or S3 event → EventBridge/Lambda |
| Windows shares consolidated in AWS, low-latency branch access | **FSx for Windows File Server** (plus DFS); FSx File Gateway only for existing customers |

## S3 Transfer Acceleration and multipart upload
- **Multipart upload**: required above **5 GB** single PUT limit, recommended from roughly **100 MB**; parts upload in parallel and failed parts retry independently. Add a lifecycle rule to **abort incomplete multipart uploads**.
- **S3 Transfer Acceleration**: uploads enter the nearest **CloudFront edge location** and ride the AWS backbone to the bucket, which helps **long-distance** uploads over the internet; extra per-GB cost; use the speed comparison tool to verify the gain.
- Neither helps if your own uplink is saturated; then consider Direct Connect or Data Transfer Terminal.
