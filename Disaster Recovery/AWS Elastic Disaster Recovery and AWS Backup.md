# AWS Elastic Disaster Recovery and AWS Backup

Two managed services cover most server and data DR answers on SAP-C03 (Skills 4.2.2 and 4.3.1). **AWS Elastic Disaster Recovery (DRS)** continuously replicates **whole servers** so they can be launched in AWS within minutes. **AWS Backup** centrally schedules, copies, retains, and protects **point-in-time backups** across many AWS services. They solve different problems and are often used together.

## AWS Elastic Disaster Recovery (DRS)
Successor to **CloudEndure Disaster Recovery**. Recovers physical, virtual (VMware, Hyper-V), other-cloud, or **EC2** servers into AWS.

```text
Source servers (on-prem / other cloud / EC2 in Region A)
   | AWS Replication Agent: continuous block-level replication
   v
Staging area subnet (target Region)
   lightweight replication servers + low-cost EBS volumes + point-in-time snapshots
   | launch (drill or recovery)
   v
Recovery subnet: full-size EC2 recovery instances (only pay compute when launched)
```

Key points:
- **Continuous block-level replication** → RPO of **seconds**; RTO typically **minutes** (boot + conversion).
- **Staging area subnet** keeps steady-state cost low—no full-size compute running until recovery.
- **Point-in-time recovery**: recover from an earlier snapshot (e.g. before ransomware encryption), not only the latest state. Retention is configurable.
- **Drills**: launch recovery instances for testing **without interrupting replication**.
- **Launch settings / EC2 launch templates** define instance type, subnet, security groups; post-launch actions can run SSM automation.
- **Failback**: to on-premises using the DRS **Failback Client**; for AWS-to-AWS (cross-Region/cross-AZ) recovery, DRS sets up **reverse replication** back to the original Region.
- Works for **on-prem → AWS**, **cross-Region**, and **cross-AZ** EC2 recovery.
- Application-agnostic: replicates the disk, so it works for databases and legacy apps that have no native replication.

**Exam tip**: "Lift-and-shift **DR** for on-prem servers, RPO seconds, RTO minutes, minimal infrastructure cost" → **DRS**. **AWS Transform MGN** (formerly AWS Application Migration Service) uses the same replication tech but is for **one-time migration**—a common distractor.

## AWS Backup
| Concept | Meaning |
| --- | --- |
| **Backup plan** | Rules: schedule, backup window, lifecycle (transition to cold storage, expire), **copy actions** |
| **Resource assignment** | Select resources by **tags** or ARNs (tag-based is the scalable answer) |
| **Backup vault** | Container for recovery points; own **KMS key** and **vault access policy** |
| **Recovery point** | A backup (snapshot or continuous) of a resource |
| **Continuous backup** | **PITR** for supported services (e.g. RDS, Aurora, S3) up to 35 days |
| **Cold storage** | Cheaper tier for supported resource types; minimum 90 days in cold storage |

### Cross-Region and cross-account copy
- **Copy action** in a backup rule copies recovery points to a vault in another **Region** and/or another **account**.
- Cross-account copy requires both accounts in the same **AWS Organization** and a destination vault access policy allowing the source.
- Use **customer managed KMS keys** for resources whose encryption follows the source key (e.g. EBS, RDS); copies of resources encrypted with AWS managed keys cannot be shared cross-account.
- A **dedicated backup account** (separate credentials, SCP-protected) limits blast radius if a production account is compromised.

### Organizations backup policies
- Defined in the **management account** (or delegated administrator), attached to OUs/accounts.
- Enforce consistent plans across all member accounts—resources selected by tag.

### Vault Lock
| | Governance mode | Compliance mode |
| --- | --- | --- |
| Who can remove/change lock | Users with sufficient IAM permissions | **Nobody**—not even root or AWS—after grace time |
| Grace time | N/A | Cooling-off period (minimum **72 hours**) before lock becomes immutable |
| Use | Test retention settings, internal guardrail | **WORM** regulatory retention (e.g. SEC 17a-4 style), ransomware protection |

Vault Lock enforces **minimum/maximum retention** and prevents deletion of recovery points before their retention expires.

### Logically air-gapped vault
- Vault type whose recovery points are **locked in compliance mode by default** and isolated from the owning account's normal access paths.
- Share to a recovery account via **AWS RAM** so you can **restore even if the source account is compromised**.
- **Exam tip**: "Ransomware-resilient backups that can be restored from a separate clean account" → logically air-gapped vault (or locked cross-account vault). More ransomware controls (EBS snapshot lock, Recycle Bin, S3 Object Lock) are in `Resilience Hub, ransomware protection, and container DR.md`.

### Restore testing and auditing
- **Restore testing**: scheduled automatic restores of recovery points, with optional validation, to prove backups are usable and measure restore time.
- **Backup Audit Manager**: frameworks of controls (e.g. "resources protected by a backup plan", "backups copied cross-Region", "vault locked") with reports; built on **AWS Config**.

### Supported services (common on exam)
EC2/EBS, RDS, Aurora, DynamoDB, EFS, FSx (all types), S3, DocumentDB, Neptune, Redshift, Storage Gateway volumes, VMware workloads, SAP HANA on EC2, CloudFormation stacks (application backups), and **EKS clusters** (cluster state plus EBS/EFS/S3 persistent volumes as one composite recovery point).

## DRS vs AWS Backup vs native snapshots
| | DRS | AWS Backup | Native snapshots/backups |
| --- | --- | --- | --- |
| Unit | Whole server (block level) | Resource recovery points | Per-service (EBS snapshot, RDS snapshot) |
| RPO | Seconds | Hours (schedule) or PITR for supported services | Depends on schedule (DLM, RDS automated backups) |
| RTO | Minutes | Hours (restore + rebuild) | Hours |
| Cross-Region/account | Yes (replication to target Region) | Yes, policy-driven copy actions | Manual or DLM/service-specific copy |
| Central governance | No | **Yes**—Organizations policies, Vault Lock, Audit Manager | No |
| Best for | Pilot-light-style server recovery | Backup & restore, compliance retention, ransomware | Simple single-service needs |

## Choose the right approach
| Requirement | Answer |
| --- | --- |
| On-prem servers to AWS DR, RPO seconds, RTO minutes | **DRS** |
| One-time server migration to AWS | **AWS Transform MGN** (not DRS) |
| Central backups across all org accounts | **AWS Backup** + **Organizations backup policies** |
| Backups in another Region and account | Backup plan **copy action** to cross-account, cross-Region vault |
| Backups must be undeletable for 7 years | **Vault Lock compliance mode** |
| Restore even if prod account is compromised | **Logically air-gapped vault** shared via RAM |
| Prove backups are restorable | **AWS Backup restore testing** |
| Report backup compliance to auditors | **Backup Audit Manager** |
| Recover servers to state before ransomware hit | DRS **point-in-time recovery** |

## Common exam scenarios
- **"Hundreds of on-prem VMs, no native replication, RTO 15 minutes, low steady-state cost"** → DRS with staging subnet; backups would miss the RTO.
- **"Test DR quarterly without affecting replication"** → DRS drills.
- **"Return to on-prem data center after the event"** → DRS failback client.
- **"Admin with full permissions must not be able to delete backups"** → Vault Lock **compliance** mode (governance mode can be bypassed).
- **"Enforce identical backup schedules in every new account"** → Organizations backup policy, tag-based selection.
- **"Copied RDS snapshots fail to share cross-account"** → source encrypted with AWS managed key; re-encrypt with customer managed KMS key.
