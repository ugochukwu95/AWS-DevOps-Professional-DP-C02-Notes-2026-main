# What you need to know about scaling on AWS

DOP-C02 scaling questions are usually **not** “turn on Auto Scaling.” They test whether you scale the **right resource** using the **right signal** for the **workload shape**.

Rule of thumb: Ask “If we’re falling behind, what number goes up first?” — scale on that metric (or a derived one like backlog per instance).

```text
Workload produces a signal (queue depth, requests, CPU, lag, …)
        ↓
CloudWatch metric (often AWS/service-native)
        ↓
Scaling policy (target tracking, step, scheduled, predictive)
        ↓
Capacity changes (EC2 instances, ECS tasks, Lambda concurrency, shards, RCU/WCU, …)
```

**Exam mantra**: Match the metric to **what backs up first** when load spikes — not whatever metric is easiest to enable.

## Two families of “auto scaling”
| Layer | Service | What grows/shrinks |
| --- | --- | --- |
| **EC2 Auto Scaling groups** | Amazon EC2 Auto Scaling | **EC2 instances** in an ASG |
| **Application Auto Scaling** | Application Auto Scaling API | **Desired count** of a target: ECS service, DynamoDB table/index capacity, Aurora replicas, Lambda (limited), etc. |

An **ECS service on EC2** often uses **both**:
1. **Service auto scaling** → more **tasks**
2. **Capacity provider** → more **EC2 instances** when tasks cannot be placed

An **ECS service on Fargate** → scale **task count** only (no EC2 ASG).

## Scaling policy types (exam)
| Policy | Behavior | When questions mention it |
| --- | --- | --- |
| **Target tracking** | Keep a metric near a target (e.g. 70% CPU, 1000 msgs/instance) | “Maintain X per unit”; smooth scaling |
| **Step scaling** | Add/remove N capacity units when alarm breaches thresholds | “Add 2 instances when queue > 1000, 4 when > 5000” |
| **Simple scaling** | Legacy single-step on alarm | Older designs; prefer step or target tracking |
| **Scheduled scaling** | Change min/max/desired at times | Business hours, batch windows |
| **Predictive scaling** | ML on history to scale **before** spike (EC2 ASG) | Periodic traffic patterns |

**Target tracking** is not always wrong — the exam trap is **tracking the wrong metric** (e.g. CPU for an SQS worker fleet).

## Cooldowns, grace periods, and “slow to scale”
Even with the correct metric, scaling can feel late if:

| Setting | Effect |
| --- | --- |
| **Default cooldown** (simple/step) | Ignores additional scale activities after a change |
| **Scale-out cooldown** on target tracking | Can delay repeated scale-out |
| **Instance warmup** | New instances excluded from metrics until healthy |
| **Health check grace period** | ASG waits before marking unhealthy during boot |
| **Launch time** | New EC2/ECS tasks need minutes to register and process |

Exam fixes for “not scaling in a timely manner”:
1. **Wrong metric** (most common) → switch to queue/ALB/lag metric
2. **Cooldown too long** → shorten scale-out cooldown
3. **Max capacity** already hit → raise ASG max
4. **Insufficient capacity** / launch failures → check limits, subnets, AMI, instance types

## Scale-in safely (workers and connections)
Scaling **in** too aggressively causes lost work or errors.

| Pattern | Scale-in safeguard |
| --- | --- |
| **ALB-backed web tier** | Connection draining on deregister; target health checks |
| **SQS workers on EC2** | **Lifecycle hook** to finish in-flight messages; scale on **backlog**, not CPU |
| **ECS** | **Minimum healthy percent** during deploys; scale-in one task at a time for long jobs |
| **Lambda + SQS** | Visibility timeout > function timeout; partial batch failures |

**Exam tip**: “Workers must finish processing before instance terminates” → **ASG lifecycle hook** + **heartbeat/complete** after queue drain.

## What scales automatically (no ASG policy needed)
| Service | Scaling model |
| --- | --- |
| **Lambda** (most triggers) | Concurrency scales with invoke rate (account/region limits apply) |
| **Lambda + SQS** | **Event source mapping** increases concurrent executions based on queue backlog (batch size, max concurrency setting) |
| **DynamoDB on-demand** | On-demand capacity mode scales read/write automatically |
| **S3, SNS (publish)** | Massively parallel by design |

Questions comparing “EC2 + SQS + ASG” vs “Lambda + SQS” often test **who owns scaling logic**.

## High-level workload → scaling cheat sheet
| Workload shape | Scale on (first choice) | Scale what |
| --- | --- | --- |
| **HTTP/API behind ALB** | `ALBRequestCountPerTarget`, latency, 5xx | ECS tasks, EC2 instances in target group |
| **SQS queue consumers (EC2/ECS)** | **Queue depth**, **backlog per instance**, **age of oldest message** | ASG instances or ECS service desired count |
| **CPU-bound batch on EC2** | **Average CPU** (target tracking) | ASG |
| **Streaming (Kinesis)** | **Iterator age**, throughput vs shard count | **Shard count** (split/merge), consumers |
| **DynamoDB provisioned** | **ConsumedReadCapacityUnits / Write** (target 70%) | Table or GSI capacity (Application Auto Scaling) |
| **Aurora read-heavy** | **Average CPU** on readers or **DatabaseConnections** | **Aurora Auto Scaling** for **Aurora Replicas** |
| **ElastiCache cluster mode** | Memory/evictions, CPU | Shards/replicas |
| **Spot interruption** | N/A (capacity event) | **Capacity-optimized** allocation, mixed instances, on-demand base |

Detailed metric selection: **Choose the right metric and trigger.md**.  
Worked exam patterns: **Exam scenarios and worked examples.md**.

## Related notes in this repo
- **AWS ECS** — service auto scaling vs capacity providers
- **Elastic Beanstalk** — worker tier scales on **SQS depth**
- **Lambda** — concurrency, SQS event source mapping
- **Amazon CloudWatch** — alarms, metric math, anomaly detection
- **Amazon Kinesis** — shard scaling
- **Amazon ElastiCache** — replica/shard scaling
