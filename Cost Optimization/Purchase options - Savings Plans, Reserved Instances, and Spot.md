# Purchase options - Savings Plans, Reserved Instances, and Spot

The pricing model is usually the biggest discriminator between answer options. Pattern to remember: **commit for the steady baseline, Spot for interruptible burst, On-Demand for the unpredictable remainder**.

## Compute purchase options compared
| Option | Max discount vs On-Demand | Commitment | Flexibility | Reserves capacity? |
| --- | --- | --- | --- | --- |
| **On-Demand** | None | None | Full | No |
| **Compute Savings Plans** | Up to 66% | $/hour, 1 or 3 years | Any EC2 family, size, AZ, Region, OS, tenancy; also **Fargate and Lambda** | No |
| **EC2 Instance Savings Plans** | Up to 72% | $/hour, 1 or 3 years | One instance **family in one Region**; any size, AZ, OS, tenancy | No |
| **SageMaker AI Savings Plans** | Up to 64% | $/hour, 1 or 3 years | SageMaker AI instance usage, any family/Region/component | No |
| **Database Savings Plans** | Up to 35% (serverless); up to 20% (provisioned) | $/hour, **1 year only**, **No Upfront only** | Any covered DB service, engine, family, size, Region, provisioned ↔ serverless | No |
| **Standard RI** | Up to 72% | Specific instance attributes, 1 or 3 years | Modify AZ/size (same family); **sell on RI Marketplace** | Only if **zonal** |
| **Convertible RI** | Up to 66% | 1 or 3 years | **Exchange** for other family/OS/tenancy of equal or greater value; cannot sell | Only if **zonal** |
| **Spot** | Up to 90% | None | Interrupted with 2-minute notice | No |
| **Dedicated Hosts** | On-Demand or Host Reservation | Optional 1 or 3 years | Whole physical server; socket/core visibility | The host itself |
| **Dedicated Instances** | Can use RIs/SPs | None | Single-tenant hardware, no host visibility | No |
| **On-Demand Capacity Reservations** | **None on its own** | None (cancel any time) | Specific instance type in one AZ | **Yes** |
| **Capacity Blocks for ML** | Priced per block | Fixed future date window | GPU instances (for example P5) for short ML jobs | Yes, for the block |

**Key point**: On-Demand Capacity Reservations are billed at On-Demand rates **whether or not you run instances**. Get the discount by **combining** them with **Savings Plans or regional RIs**—capacity from the reservation, price from the commitment.

**Exam tip**: Savings Plans are the default modern answer for steady compute. Choose **Compute SP** when workloads may change family, Region, or move to Fargate/Lambda; choose **EC2 Instance SP / Standard RI** for maximum discount when the family and Region are fixed.

## Regional vs zonal Reserved Instances
| | Regional RI | Zonal RI |
| --- | --- | --- |
| Capacity reservation | **No** | **Yes**, in the specified AZ |
| AZ flexibility | Applies in any AZ in the Region | Only the specified AZ |
| Instance size flexibility | Yes (Linux/Unix, default tenancy, same family) | No |

**Exam tip**: "Guarantee capacity in a specific AZ for DR **and** get a discount" → On-Demand Capacity Reservation + Savings Plan/regional RI, or a **zonal RI**.

## Payment options and terms
- **All Upfront** > **Partial Upfront** > **No Upfront** in discount size.
- **3-year** terms discount more than 1-year.
- Highest discount = 3-year, All Upfront, Standard RI / EC2 Instance SP. Choose it only when the workload is clearly stable for 3 years.
- Exception: **Database Savings Plans** have a single option—**1-year, No Upfront**.
- Savings Plans and RIs **cannot be cancelled**; Standard RIs can be sold on the RI Marketplace, Convertible RIs and Savings Plans cannot.

## Database Savings Plans
Launched at re:Invent (December 2025) and named explicitly in SAP-C03 Skill 3.4.3. A **$/hour commitment for 1 year** that applies automatically to eligible database usage.

| Attribute | Database Savings Plans |
| --- | --- |
| Services covered | **Aurora, RDS, DynamoDB, ElastiCache (Valkey only), DocumentDB, Neptune, Keyspaces, Timestream (for InfluxDB), DMS**, and OpenSearch Service (listed in the Savings Plans user guide) |
| Not covered | **Redshift** (use reserved nodes); older instance generations |
| Eligible instances | **Generation 7 and newer** (for example `db.r7g`, `db.m7g`, `db.r8g`); older families such as `db.r5`/`db.r6g` are not eligible |
| Serverless coverage | Aurora Serverless v2, Aurora PostgreSQL Limitless, ElastiCache Serverless (Valkey), DocumentDB/Neptune Serverless, OpenSearch Serverless, DynamoDB/Keyspaces throughput |
| Discount | Up to **35%** serverless, up to **20%** provisioned instances; DynamoDB/Keyspaces up to **18%** on-demand throughput, up to **12%** provisioned throughput |
| Term / payment | **1 year**, **No Upfront** only (no 3-year option) |
| Flexibility | Change engine (RDS for Oracle → Aurora PostgreSQL), service (RDS → DynamoDB), family, size, Region, Single-AZ/Multi-AZ, provisioned ↔ serverless |
| Stacking | **Cannot combine** with RDS RIs or DynamoDB reserved capacity **on the same usage**; RIs/reserved capacity apply first, the SP covers the rest |
| Licence costs | RDS for SQL Server licence charges are **not** discounted |

### Database Savings Plans vs reserved DB capacity
| Situation | Better choice |
| --- | --- |
| Migrating or modernizing (engine change, provisioned → serverless, RDS → DynamoDB) during the year | **Database Savings Plans** |
| Aurora Serverless v2 or other serverless DB usage you want discounted | **Database Savings Plans** (RIs do not cover serverless) |
| Usage spread across several DB services or Regions | **Database Savings Plans** |
| Stable engine, instance family, and Region for 3 years; maximum discount | **RDS reserved DB instances** (3-year All Upfront) |
| Steady DynamoDB **provisioned** throughput, single Region, Standard table class | **DynamoDB reserved capacity** (much deeper discount than the SP's 12%) |
| Older-generation instances you cannot move yet | **Reserved instances** (SP does not apply) |
| Redshift provisioned cluster | **Redshift reserved nodes** |

**Exam tip**: The Database Savings Plan is the "**flexible commitment**" answer for databases—just as the Compute SP is for compute. If the stem says "the team plans to move from RDS to Aurora Serverless / DynamoDB this year", reserved DB instances are the distractor.

## Reservations for other services
| Service | Reservation type | Notes |
| --- | --- | --- |
| **RDS / Aurora** | Reserved DB instances (or Database SP) | Size flexibility within a family for many engines; Multi-AZ matters when buying |
| **ElastiCache** | Reserved nodes (or Database SP for Valkey) | Per node type |
| **Redshift** | Reserved nodes | Provisioned clusters (not Serverless); not covered by Database SP |
| **OpenSearch Service** | Reserved instances (or Database SP) | Per instance type |
| **DynamoDB** | Reserved capacity (or Database SP) | Reserved capacity: **provisioned** mode only; Database SP also covers on-demand throughput |
| **SageMaker AI** | SageMaker AI Savings Plans | Not covered by Compute SP |

**Exam tip**: Compute Savings Plans do **not** cover RDS, ElastiCache, Redshift, OpenSearch, or DynamoDB—those need **Database Savings Plans** or their own reservations (Redshift: reserved nodes only).

## Spot Instances
- Spare EC2 capacity, up to 90% off; price changes gradually with long-term supply and demand.
- **2-minute interruption notice** via instance metadata and an **EventBridge** event.
- **EC2 instance rebalance recommendation**: earlier signal that the instance is at elevated risk—proactively drain and replace. ASG **Capacity Rebalancing** acts on it automatically.
- Interruption behaviour: terminate (default), stop, or hibernate.
- Good for **stateless, fault-tolerant, flexible** work: batch, big data (EMR task nodes), CI/CD build agents, containers, rendering, HPC with checkpointing.
- Bad for: single stateful databases, jobs that cannot checkpoint, anything with a hard completion deadline and no fallback.

### Allocation strategies (EC2 Fleet / ASG)
| Strategy | Behaviour |
| --- | --- |
| **price-capacity-optimized** | **Recommended** default: pools with high capacity availability, then lowest price |
| capacity-optimized | Pools with most spare capacity—lowest interruption risk |
| lowest-price | Cheapest pools—highest interruption risk; distractor |
| diversified | Spread across all specified pools |

### Auto Scaling mixed instances policy
- One ASG, multiple instance types (or **attribute-based instance type selection**) for diversification.
- **On-Demand base capacity** + **percentage On-Demand above base** + rest Spot.
- Commitments (SP/RIs) then apply automatically to the On-Demand portion.

```text
ASG desired = 20
  On-Demand base = 4            (covered by Savings Plan)
  Above base: 25% On-Demand, 75% Spot  →  4 OD + 12 Spot
  Spot across 6+ instance types, price-capacity-optimized
```

**Exam tip**: Spot Fleet is legacy; prefer **EC2 Auto Scaling with a mixed instances policy** or **EC2 Fleet**. Diversify across many instance types and AZs to reduce interruptions.

## Graviton
- AWS Arm-based processors with better price performance than comparable x86 instances (AWS cites up to 40% for Graviton2 vs x86).
- Available for EC2, RDS/Aurora, ElastiCache, OpenSearch, Lambda (`arm64`), Fargate, EMR.
- Requires Arm-compatible code/containers (multi-arch images); interpreted languages usually migrate easily.

## Lambda and Fargate levers
- **Lambda**: right-size memory (AWS Lambda Power Tuning), use `arm64` (lower per GB-second price), cut duration, avoid unneeded provisioned concurrency.
- **Fargate**: right-size task CPU/memory, use Graviton, use **Fargate Spot** (ECS only, up to 70% off, interruptible with 2-minute warning).
- **Compute Savings Plans cover Lambda and Fargate**—EC2 Instance SPs and RIs do not.

## Licensing
- **BYOL**: per-socket/per-core licences (for example Windows Server, older SQL Server, Oracle) often require **Dedicated Hosts** (socket/core visibility, host affinity) for compliance. Licence tracking tools such as AWS License Manager exist but are **not in the SAP-C03 scope**.
- Licence-included (for example RDS for SQL Server) avoids licence management but costs more per hour; **Babelfish for Aurora PostgreSQL** removes the SQL Server licence altogether (see `Databases and Analytics`).

**Exam tip**: "Reuse existing per-core Windows/SQL Server licences" → **Dedicated Hosts**. "Single-tenant hardware for compliance, no licence need" → **Dedicated Instances** (cheaper to manage).
