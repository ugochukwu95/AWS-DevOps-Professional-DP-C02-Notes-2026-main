# What is disaster recovery on AWS?

Disaster recovery (DR) is how a workload **recovers from an event that takes out a whole site**—usually an AWS **Region**—or from **data loss/corruption** that high availability cannot fix. SAP-C03 covers this in **Domain 4 (Resilience, Migration, and Business Continuity, 15%)**, Tasks 4.2 and 4.3. Questions describe a business target (RPO/RTO, budget, ops effort) and ask for the **cheapest architecture that still meets it**. Pick the strategy first, then the per-service replication mechanism.

## RPO vs RTO
| Term | Question it answers | Driven by |
| --- | --- | --- |
| **RPO** (Recovery Point Objective) | How much data can we lose? (time since last good copy) | Backup frequency / replication lag |
| **RTO** (Recovery Time Objective) | How long can we be down? | How much is already running in the DR site + automation |

- Lower RPO → more frequent backups or **continuous replication**.
- Lower RTO → more **pre-provisioned** infrastructure and **automated** failover.
- Both lower → higher cost. The exam answer is the option that **just meets** the stated numbers.

## DR vs high availability
| | High availability | Disaster recovery |
| --- | --- | --- |
| Scope | Component or **AZ** failure | **Region** failure, account compromise, data corruption |
| Typical tools | Multi-AZ RDS, ALB + Auto Scaling across AZs | Second Region, backups, cross-Region replication |
| Protects against bad data? | **No**—corruption/deletes replicate instantly | Yes, if you keep **point-in-time** or immutable backups |

**Exam tip**: Multi-AZ is **not** DR. "Accidental table drop" or "ransomware" → you need **point-in-time recovery or isolated backups**, not more replicas.

## The four DR strategies
| Strategy | Typical RPO | Typical RTO | Cost | What runs in DR Region |
| --- | --- | --- | --- | --- |
| **Backup & restore** | Hours | Hours (to a day) | $ | Nothing except backups/AMIs; infra rebuilt from IaC |
| **Pilot light** | Minutes (replicated data) | Tens of minutes | $$ | Data stores live/replicating; app servers **off** or not deployed |
| **Warm standby** | Seconds–minutes | Minutes | $$$ | Full stack running at **reduced capacity**; scale up on failover |
| **Multi-site active/active** | Near zero | Near zero | $$$$ | Full production capacity serving live traffic |

```text
Backup & restore   Primary [App + DB] --backups/snapshots--> DR: [vault only]
Pilot light        Primary [App + DB] --replication--------> DR: [DB replica]   App: off
Warm standby       Primary [App + DB] --replication--------> DR: [small App + DB replica]
Active/active      Region A [App + DB] <--bi-directional---> Region B [App + DB]  (both serve)
```

Distinguishing pilot light vs warm standby: in **pilot light** the DR Region **cannot serve requests** until you start/deploy compute; in **warm standby** it **can serve** (at lower capacity) immediately.

**Exam tip**: "RPO/RTO of hours, minimise cost" → backup & restore. "RTO under ~1 hour, low cost, data must be current" → pilot light. "RTO of minutes, must handle some traffic immediately" → warm standby. "Zero downtime, users in several continents" → active/active.

## Active/passive vs active/active
| | Active/passive | Active/active |
| --- | --- | --- |
| Strategies | Backup & restore, pilot light, warm standby | Multi-site |
| Writes | Single Region | Multiple Regions (or write-local, read-global) |
| Data challenge | Replication lag = RPO | **Write conflicts**—need conflict resolution (e.g. last-writer-wins) |
| Routing | Route 53 **failover** records / ARC | Route 53 **latency** / geoproximity, Global Accelerator |

## Region vs AZ failures
- **AZ impairment** → handled by Multi-AZ design. Use **ARC zonal shift** (or **zonal autoshift**) to move ALB/NLB traffic away from an impaired AZ.
- **Region impairment** → requires a second Region and a DR strategy above.
- **Gray failures** (partial, intermittent) are the hard case—health checks may not trip, so have a **manual, tested** failover switch.

## Data plane vs control plane (static stability)
- **Control plane** = APIs that create/modify resources (launch instances, change DNS records, modify IAM). Less available, and may itself be impaired during a regional event.
- **Data plane** = the running service (instances serving traffic, Route 53 answering DNS queries, health checks evaluating).
- **Static stability**: the DR design should work **without making control-plane calls** during the event. Pre-provision capacity, pre-create records, and fail over by flipping data-plane state.

**Exam tip**: Failover that depends on "update the Route 53 record via API" or "launch instances in the DR Region at failover time" is less resilient than **pre-provisioned capacity + health-check-driven or ARC routing control failover**.

## Multi-Region failover options (Skill 4.2.4)
| Option | How traffic moves | Choose when |
| --- | --- | --- |
| **Route 53 health checks + failover records** | DNS answers switch to the secondary when the primary health check fails | Simple, cheap active/passive; clients honour DNS TTLs |
| **AWS Global Accelerator** | Two static **anycast IPs**; endpoint groups per Region with health checks and **traffic dials**; traffic shifts at the edge | Fast failover **without DNS caching delays**, static IPs for allow-lists, TCP/UDP apps |
| **ARC routing controls** | Operator flips on/off switches that drive Route 53 health check state | Deterministic, human-approved Region failover via the data plane |
| **ARC Region switch** | Recovery **plan** that orchestrates the whole stack (scale compute, promote databases, flip routing) | Multi-step, cross-account Region failover/failback, triggered manually or by CloudWatch alarms |

## Amazon Application Recovery Controller (ARC)
Formerly **Amazon Route 53 Application Recovery Controller**; documentation and older questions may still use that name.

| Feature | Purpose |
| --- | --- |
| **Routing controls** | On/off switches tied to Route 53 health checks; flip to move traffic between Regions/cells |
| **Cluster** | Five redundant Regional endpoints; routing control state changes use the **data plane** (highly available) |
| **Safety rules** | Assertion/gating rules prevent unsafe states (e.g. both cells off) |
| **Region switch** | Plans with execution blocks (EC2 Auto Scaling, Aurora Global Database, routing controls, Route 53 health checks, nested plans, and more); runs **from the Region being activated** so it does not depend on the impaired Region |
| **Zonal shift / autoshift** | Move load balancer traffic away from one AZ |

- Routing controls give **human-in-the-loop**, deterministic failover rather than relying only on automatic health checks.
- Region switch supports both **active/passive** (failover/failback) and **active/active** (shift away/return) plans, including resources in multiple accounts.
- Routing control clusters have a fixed hourly cost—justified for critical workloads, overkill for low-tier apps.

## Testing DR
- **Untested DR is not DR.** Run regular **game days** that perform real failover and failback.
- **AWS Fault Injection Service (FIS)**: managed chaos engineering—experiment templates inject faults (stop/terminate instances, throttle APIs, disrupt network connectivity, AZ power interruption scenarios) with **stop conditions** tied to CloudWatch alarms.
- Validate backups by **restoring** them (AWS Backup **restore testing**), and run **DRS drills** for server-based recovery.
- Measure actual RPO/RTO during tests and compare with targets.
- **AWS Resilience Hub** assesses an application against RTO/RPO policies and recommends alarms, SOPs, and FIS tests; see `Resilience Hub, ransomware protection, and container DR.md`.

## Choose the right approach
| Requirement | Answer |
| --- | --- |
| RPO/RTO 24 hours, lowest cost | **Backup & restore** (AWS Backup cross-Region copy + IaC) |
| RTO tens of minutes, minimal running cost | **Pilot light** (replicated DB, compute off) |
| RTO minutes, serve traffic immediately | **Warm standby** (scaled-down stack) |
| Near-zero RPO/RTO, global users | **Multi-site active/active** |
| Protect against accidental deletion | **PITR / immutable backups**, not Multi-AZ |
| Failover must not depend on control plane | Pre-provisioned capacity + **ARC routing controls** |
| Regional failover unaffected by client DNS caching, static IPs | **AWS Global Accelerator** endpoint groups + health checks |
| Orchestrate full-stack Region failover in the right order | **ARC Region switch** plan |
| Move traffic away from impaired AZ | **ARC zonal shift / autoshift** |
| Prove DR works | **Game days** + **FIS** experiments + restore testing + **Resilience Hub** assessments |

## Common exam scenarios
- **"Company accepts several hours of downtime, wants lowest DR cost"** → backup & restore; pilot light/warm standby are distractors that cost more.
- **"Database must be current in DR, app servers can start on failover"** → pilot light with cross-Region DB replication; AMIs/launch templates ready.
- **"DR Region must accept traffic within minutes of a failure"** → warm standby with Auto Scaling to scale up after failover.
- **"Route 53 failover did not happen because API calls failed during the outage"** → use data-plane failover (health checks / ARC routing controls), not record updates.
- **"Operators want a manual, reliable switch for Region failover"** → ARC routing controls with safety rules.
- **"Clients cache DNS for hours, so Route 53 failover is too slow"** → **Global Accelerator**: static anycast IPs, traffic shifts between Regional endpoint groups without DNS changes.
- **"Region failover requires scaling up compute, promoting Aurora, then shifting traffic, across three accounts"** → **ARC Region switch** plan.
- **"Multi-AZ RDS did not help after a bad deployment corrupted data"** → restore from PITR/snapshot; HA does not protect against logical errors.
- **"Validate resilience to AZ loss in a controlled way"** → AWS FIS experiment with CloudWatch alarm stop conditions.
