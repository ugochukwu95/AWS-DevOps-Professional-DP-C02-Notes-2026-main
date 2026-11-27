# Resilience Hub, ransomware protection, and container DR

SAP-C03 adds explicit skills for **assessing and testing DR** (AWS Resilience Hub, Systems Manager runbooks, FIS), **protecting backups from ransomware**, **cost-optimized retention**, and **multi-cluster container DR**. These topics show up as "prove it works," "make it undeletable," and "keep Kubernetes running if a Region fails."

## AWS Resilience Hub (Skills 4.2.3, 4.2.5)
Central place to define resilience targets, assess an application against them, and implement recommendations.

| Concept | Detail |
| --- | --- |
| **Application** | Resources imported from CloudFormation stacks, Terraform state files, Resource Groups, AppRegistry, or EKS clusters; works across accounts and Regions |
| **AppComponent** | Resources that work and fail as one unit (for example a primary DB and its replica) |
| **Resiliency policy** | **RTO and RPO targets** per disruption type: application, cloud infrastructure, **AZ**, **Region**. Tiers from Mission critical to Non-critical; AWS-suggested policies available |
| **Assessment** | Estimates workload RTO/RPO and reports **Policy met** or **Policy breached**, plus a **resiliency score** |
| **Resiliency recommendations** | Configuration changes per AppComponent (Multi-AZ, cross-Region backup copy, Global Database) with cost trade-offs |
| **Operational recommendations** | **CloudWatch alarms**, **SOPs**, and **FIS experiments**, deployable as CloudFormation templates |
| **SOP** | Prescriptive recovery steps, implemented as **Systems Manager Automation** documents; test and time them |
| **Drift detection** | Flags **policy drift** (component was compliant, now is not) and **resource drift** (resources added/removed) versus the last compliant assessment; schedule daily assessments |

**CI/CD integration**: a pipeline stage (CodePipeline → Step Functions using Resilience Hub SDK calls) imports the deployed stack, publishes the app version, runs an assessment, and **fails the deployment on Policy breached**. Place it after the production-like test stage and before production.

**Exam tip**: "Continuously verify that an application still meets its RTO/RPO after every change" → **Resilience Hub** assessment in the pipeline plus drift detection. Resilience Hub estimates; **FIS** and game days prove.

## Systems Manager runbooks for recovery
- **Automation runbooks** codify recovery: restore from a recovery point, promote a replica, scale out Auto Scaling groups, update parameters, run scripts on instances.
- Add **approval steps** for human-in-the-loop actions; run across **multiple accounts and Regions** from a central account.
- Trigger from **EventBridge** rules or CloudWatch alarms; DRS post-launch actions and ARC Region switch plans can also invoke SSM.
- Store runbooks as code and test them in drills; an SOP that has never run is a guess.

## Ransomware and accidental deletion (Skill 4.3.4)
| Control | Protects | Key behaviour |
| --- | --- | --- |
| **S3 Versioning + MFA Delete** | Objects | Permanent version deletes and versioning changes need the **root user's MFA** |
| **S3 Object Lock** | Objects (WORM) | **Governance** (bypass with special permission) or **compliance** (nobody, including root, can shorten or delete); retention periods and **legal holds** |
| **EBS snapshot lock** | EBS snapshots | **Governance**: locked immediately, IAM-permitted users can unlock or change. **Compliance**: optional **cooling-off period of 1–72 hours** during which it can still be unlocked; afterwards nobody can unlock or shorten it, only extend. Duration 1–36,500 days or an expiry date. No extra charge |
| **AWS Backup Vault Lock** | Recovery points in a vault | Governance or compliance mode (compliance has a minimum 72-hour grace time before becoming immutable) |
| **Logically air-gapped vault** | Recovery points | Compliance-locked by default; shared to a recovery account via **AWS RAM** |
| **Recycle Bin** | EBS snapshots, EBS-backed AMIs (1–365 days), EBS volumes (1–7 days) | Deleted resources matching a **retention rule** can be restored. Lock Region-level rules with an **unlock delay of 7–30 days** |
| **Separate backup account + SCPs** | Everything above | Deny `backup:DeleteRecoveryPoint`, vault lock and policy changes, `ec2:DeleteSnapshot`, and `kms:ScheduleKeyDeletion` outside a break-glass role; keep backup KMS keys in that account |

- **Lock vs Recycle Bin**: a lock **prevents** deletion; Recycle Bin lets you **undo** a deletion. Use both for layered defense.
- Compliance-mode snapshot locks can only be removed early by **closing the AWS account**.
- Restoring an AMI from Recycle Bin requires restoring its **snapshots first**; keep snapshot retention ≥ AMI retention.

**Exam tip**: "Even an administrator with full permissions must not delete snapshots for 7 years" → **EBS snapshot lock, compliance mode** (or Vault Lock compliance). "Need to test the lock first" → governance mode, or compliance with a cooling-off period.

## Data Lifecycle Manager vs AWS Backup (Skill 3.4.4)
| | Amazon Data Lifecycle Manager (DLM) | AWS Backup |
| --- | --- | --- |
| Scope | **EBS snapshots** and **EBS-backed AMIs** only | Many services (EBS, RDS, DynamoDB, EFS, FSx, S3, EKS, more) |
| Policy model | Tag-targeted lifecycle policies, or **default policies** covering a whole Region | Backup plans, tag/ARN resource assignment, Organizations backup policies |
| Retention | By count or age; cross-Region copy; cross-account sharing/copy | Lifecycle to cold storage, expiry, cross-Region/cross-account copy |
| Cost levers | No extra charge beyond snapshots; move old snapshots to **EBS Snapshots Archive** | Cold storage tier for supported resources; pay for backup storage and restores |
| Governance | Basic | **Vault Lock**, Backup Audit Manager, restore testing |

**Exam tip**: "Cheapest automated EBS snapshot rotation, no compliance reporting" → **DLM**. "Central, multi-service, auditable, immutable" → **AWS Backup**.

## Multi-cluster container HA and DR (Skill 4.2.6)
| Pattern | How | Trade-off |
| --- | --- | --- |
| **Active/active clusters** | EKS or ECS in two+ Regions, all serving, behind **Global Accelerator** or Route 53 latency records | Lowest RTO; data layer must be multi-Region (DynamoDB global tables, Aurora Global Database) |
| **Active/passive (warm)** | Small standby cluster; scale nodes/tasks on failover | Cheaper; RTO = scale-up time |
| **Recreate on demand** | IaC for the cluster + **GitOps** for workloads + restore state from backup | Cheapest; RTO of cluster build + sync + restore |

- **Stateless workloads**: keep state in managed data stores replicated across Regions so any cluster can serve.
- **GitOps (Argo CD, Flux)**: every cluster syncs the same manifests from Git, so a new or standby cluster converges to the production state automatically.
- **Karpenter** (and Cluster Autoscaler/HPA) lets a passive EKS cluster run minimal nodes and scale fast on failover. On ECS, **Fargate** removes node pre-provisioning; use ECS service auto scaling.
- **ECR replication** to the DR Region (and account) so image pulls do not depend on the failed Region.
- **AWS Backup for EKS**: one **composite recovery point** with cluster state (Kubernetes objects) and EBS/EFS/S3 persistent volumes. Restore to an existing or **new cluster**, cross-Region or cross-account, down to a namespace; restores do not overwrite existing objects. Excludes container images, VPC infrastructure, and nodes. Requires cluster auth mode `API` or `API_AND_CONFIG_MAP`; prefer **EKS Pod Identity** over IRSA for portable restores.
- **Velero**: open-source alternative that backs up Kubernetes objects to S3 and snapshots volumes; common when you need cross-cloud portability.
- **ECS** is Regional: deploy the same services, ALBs, and task definitions to each Region through pipelines or StackSets.
- **ARC Region switch** has ECS service and EKS resource scaling blocks to scale the standby before shifting traffic; **ARC zonal shift** covers AZ impairment within a Region.

## Chaos engineering with FIS (Skills 4.3.2, 4.3.5)
1. **Steady state**: a measurable business signal (orders per minute, p99 latency, error rate) captured in CloudWatch.
2. **Hypothesis**: "If one AZ loses power, the steady state stays within its thresholds."
3. **Experiment template**: **actions** (stop/terminate instances, ECS task and EKS pod faults, API throttling, network disruption, RDS/Aurora failover), **targets** (by tags, ARNs, filters), **stop conditions** (CloudWatch alarms), IAM role, logging.
4. **Run** in a lower environment first, then production with a small blast radius; use scenarios such as **AZ power interruption** and cross-Region connectivity disruption.
5. **Measure** actual recovery time against RTO, fix weaknesses, and repeat on a schedule or in a pipeline.

## Choose the right approach
| Requirement | Answer |
| --- | --- |
| Check whether an app can meet RTO/RPO per AZ and Region disruption | **Resilience Hub** assessment with a resiliency policy |
| Block deployments that weaken resilience | Resilience Hub assessment stage in **CodePipeline** |
| Detect that a change broke DR compliance | Resilience Hub **drift detection** with scheduled assessments |
| Codified, approvable recovery steps | **SSM Automation runbooks** (Resilience Hub SOPs) |
| Snapshots undeletable even by admins | **EBS snapshot lock, compliance mode** |
| Recover snapshots/AMIs deleted by mistake | **Recycle Bin** retention rule (locked) |
| Immutable multi-service backups | **AWS Backup Vault Lock** (compliance) or logically air-gapped vault |
| WORM objects in S3 | **S3 Object Lock** compliance mode |
| Low-cost EBS-only snapshot retention | **DLM** + EBS Snapshots Archive |
| EKS cluster state and volumes restorable in another Region | **AWS Backup for EKS** with cross-Region restore, or Velero |
| Rebuild EKS workloads quickly in a new cluster | IaC + **GitOps** (Argo CD/Flux) + ECR replication |
| Container traffic across Regions with fast failover | **Global Accelerator** in front of Regional ALBs/NLBs |
| Validate resilience against AZ loss | **FIS** AZ power interruption scenario with alarm stop conditions |

## Common exam scenarios
- **"Leadership asks whether the payments app meets a 15-minute RTO for a Regional outage"** → define a **Resilience Hub** policy and run an assessment; follow its recommendations.
- **"Every release must be checked for resilience regressions before production"** → Resilience Hub assessment in **CodePipeline**, fail on **Policy breached**.
- **"Recovery steps live in a wiki and are executed inconsistently"** → **SSM Automation runbooks** generated from Resilience Hub SOP recommendations, tested in drills.
- **"Ransomware actor with admin credentials deleted EBS snapshots"** → **EBS snapshot lock (compliance)** plus a locked **Recycle Bin** rule; backups copied to a separate account.
- **"Team wants to trial snapshot locking before making it permanent"** → **governance mode**, or compliance mode with a **cooling-off period**.
- **"Engineer deleted a golden AMI and its snapshots yesterday"** → restore the snapshots, then the AMI, from **Recycle Bin**.
- **"Attacker could change the Recycle Bin rule to purge snapshots"** → **lock** the Region-level rule with an unlock delay longer than your detection time.
- **"S3 audit logs must be WORM for 7 years, not even root can delete"** → **S3 Object Lock compliance mode**.
- **"Prod account compromise must not reach backups"** → dedicated backup account, **SCPs** denying delete and lock changes, **logically air-gapped vault** shared via RAM.
- **"Cheapest way to keep daily EBS snapshots for 30 days and monthly ones for a year"** → **DLM** policies, monthly snapshots moved to **EBS Snapshots Archive**.
- **"EKS platform must survive a Region failure with RTO of minutes"** → active/active or warm EKS clusters in two Regions, **GitOps**, **ECR replication**, stateless pods, **Global Accelerator** in front.
- **"Restore an EKS namespace and its EBS volumes after accidental deletion"** → **AWS Backup for EKS** namespace-level restore.
- **"Standby EKS cluster costs too much"** → minimal nodes with **Karpenter**, scale on failover (warm standby) or recreate from IaC + GitOps.
- **"ECS services in DR Region could not pull images during the outage"** → **ECR cross-Region replication** configured ahead of time.
- **"Prove the app tolerates AZ loss without harming customers"** → **FIS** experiment template with steady-state alarms as **stop conditions**.
