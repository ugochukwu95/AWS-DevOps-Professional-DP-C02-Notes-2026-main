# Choose the right metric and trigger

## The core mistake: scaling on CPU for queue workers

When EC2 (or ECS) instances **pull from SQS** and process messages:

- **Backlog** can grow while **CPU stays moderate** (I/O wait, downstream API latency, small messages).
- CPU may spike **after** the queue is already deep — target tracking on CPU reacts **late**.
- Adding instances does not help if the signal never said “queue is backing up.”

**Exam answer direction**: Scale on **SQS queue metrics**, not **average CPU utilization** of the ASG.

```text
Wrong (common trap):
  SQS backlog grows → workers busy/waiting → CPU not high enough → ASG does not scale → lag worsens

Right:
  SQS ApproximateNumberOfMessagesVisible (or age of oldest) rises
        ↓
  CloudWatch alarm or target tracking on backlog / backlog-per-instance
        ↓
  ASG scale out (or ECS service desired count up)
```

## SQS metrics for scaling (memorize)
| CloudWatch metric (SQS namespace) | Use |
| --- | --- |
| **ApproximateNumberOfMessagesVisible** | Messages available to consumers — **primary scale-out signal** |
| **ApproximateNumberOfMessagesNotVisible** | In flight (visibility timeout) — inflight work |
| **ApproximateAgeOfOldestMessage** | Time oldest message waits — **SLA / latency** scaling |
| **NumberOfMessagesSent / Deleted** | Throughput trends; less direct for instant scale |

**Exam tip**: “Processing **delays**” and “**messages pile up**” → **visible count** and/or **oldest message age**, not CPU.

### Backlog per instance (recommended pattern for EC2 ASG)
Goal: keep roughly **M messages per instance** (e.g. 100).

Use **metric math** or a **custom metric**:

```text
BacklogPerInstance = ApproximateNumberOfMessagesVisible / RunningInstanceCount
```

`RunningInstanceCount` can come from ASG metrics (`GroupInServiceInstances`) in the same CloudWatch expression.

**Target tracking**: target value = desired messages per instance (e.g. 100). When backlog per instance exceeds target, scale out.

### Step scaling alternative
CloudWatch **alarm** when `ApproximateNumberOfMessagesVisible > threshold` for N periods → **step scaling policy** adds capacity in steps (e.g. +2, +4 instances).

Good when exam wording says “**add instances in steps when queue exceeds 1000 messages**.”

### ECS consumers
Same logic on **ECS service auto scaling** (Application Auto Scaling):
- Custom metric: queue depth or backlog per **task**
- Not CPU alone for I/O-bound queue processors

## HTTP / API tier (ALB + EC2 or ECS)
| Metric | Why |
| --- | --- |
| **ALBRequestCountPerTarget** | Requests per target — scales with **traffic**, not CPU lag |
| **TargetResponseTime** | Latency SLO-driven scaling |
| **HTTP 5xx** from target | Often combined with step scaling / ops runbooks, not sole autoscale signal |

**Exam trap**: “Web traffic increased” → **ALB request count per target**, not SQS metrics.

CPU target tracking on web tier is **acceptable** when work is **CPU-bound** (video encode, heavy compute). It is weaker when threads block on DB or external APIs — then latency or request count per target is better.

## When CPU target tracking *is* correct
| Scenario | CPU target tracking |
| --- | --- |
| Stateless **CPU-bound** workers (no queue) | Yes |
| **Batch compute** on homogeneous EC2 fleet | Yes, often with step scaling for spikes |
| **Aurora replica** auto scaling (read replicas) | AWS uses **CPU** on replicas as a common signal (exam: Aurora Auto Scaling) |

Always ask: **Does CPU rise in proportion to the problem the customer describes?**

## Lambda + SQS (contrast for exam)
**Event source mapping** scales pollers/concurrency with queue backlog (subject to **batch size**, **maximum concurrency**, account limits).

If the question allows **architecture change**: moving workers from EC2+ASG to **Lambda** removes manual ASG metric design — but introduces **15 min timeout**, **VPC cold start**, **concurrency limits**, and **cost model** tradeoffs.

## Kinesis Data Streams
Scale **shards** (split/merge), not arbitrary EC2 count without consumer logic.

Watch **GetRecords.IteratorAgeMilliseconds** (consumer lag). Adding EC2 consumers without enough **shards** does not increase stream throughput.

## DynamoDB
| Mode | Scaling |
| --- | --- |
| **On-demand** | Automatic; exam answer for unpredictable traffic |
| **Provisioned** | **Application Auto Scaling** on table/GSI **read/write capacity** (target utilization e.g. 70%) |

**Exam trap**: DynamoDB throttling (`ProvisionedThroughputExceededException`) → **capacity** or **on-demand**, not EC2 ASG.

## Aurora
- **Aurora Auto Scaling** for **read replicas** based on CPU or connections (policy on replica fleet).
- Writer scale-up = **instance class change** or **Aurora Serverless v2** ACU — not classic ASG.

## ElastiCache
- **Replicas** for read scale; **cluster mode** for shard scale.
- Scale on **CPU**, **memory evictions**, **EngineCPUUtilization** — not SQS.

## EC2 ASG advanced (exam awareness)
| Feature | Purpose |
| --- | --- |
| **Mixed instances policy** | On-Demand base + Spot for cost |
| **Warm pools** | Pre-initialized instances for **faster scale-out** |
| **Predictive scaling** | Pre-warm for known daily peaks |
| **Lifecycle hooks** | Drain SQS / complete jobs before terminate |

If the scenario says CPU metric is **correct** but scaling is **slow**, consider **warm pool** or **predictive scaling** — but for **SQS backlog**, fix the **metric first**.

## Decision flowchart (exam)
```text
Is the work driven by an SQS/Kinesis queue?
├── Yes → Queue depth, iterator age, or backlog-per-consumer
│         (NOT CPU as primary signal for EC2/ECS workers)
└── No → Is traffic HTTP through ALB?
         ├── Yes → RequestCountPerTarget, latency
         └── No → Is it CPU-bound compute on the instance?
                  ├── Yes → CPU target tracking
                  └── No → Custom metric for the bottleneck (DB connections, disk, etc.)
```

## Quick comparison table
| Customer says | Wrong default | Better signal |
| --- | --- | --- |
| SQS messages pile up, processing delays | ASG average CPU | **Visible messages** / **backlog per instance** |
| API slow during marketing campaign | SQS metrics | **ALBRequestCountPerTarget** |
| DynamoDB throttling | Scale EC2 web tier | **Table/GSI capacity** or on-demand |
| Kinesis consumers lag | CPU on consumer EC2 | **Iterator age** + **shard count** |
| Need scale-out in 30s for bursty queue | CPU only | Queue metric + **warm pool** / lower cooldown |

See **Exam scenarios and worked examples.md** for the full EC2 + SQS + CPU policy question walkthrough.
