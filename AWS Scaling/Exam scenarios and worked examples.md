# Scaling exam scenarios and worked examples

## Worked example: EC2 + SQS + CPU target tracking (your question)

### Scenario (paraphrased)
- App on **EC2** across **multiple AZs**.
- Processes messages from **SQS**.
- Message volume **sometimes spikes** → **processing delays**.
- Company added **EC2 Auto Scaling** with **target tracking on average CPU utilization**.
- Instances **do not scale in a timely manner**.

### Why CPU target tracking fails here
1. **Queue depth** is the direct measure of “we are falling behind.”
2. Workers may be **I/O bound** (database, HTTP calls) — CPU stays low while the queue grows.
3. Even when CPU rises, it may rise **after** backlog is already large — **lagging indicator**.
4. Target tracking tries to hold CPU at ~50–70%; that does **not** map to “keep queue near empty.”

### What the exam wants instead
**Scale the ASG on SQS backlog** (and optionally age of oldest message):

| Approach | Implementation |
| --- | --- |
| **A — Backlog per instance (target tracking)** | CloudWatch metric math: `VisibleMessages / GroupInServiceInstances`; target tracking policy on that custom expression (e.g. target 100 messages/instance) |
| **B — Step scaling on queue depth** | Alarm when `ApproximateNumberOfMessagesVisible > T` → step policy adds instances |
| **C — Target on oldest message age** | Alarm/tracking on `ApproximateAgeOfOldestMessage` when SLA is “must process within N seconds” |

Also verify:
- ASG **max** size allows enough instances for spikes
- **Scale-out cooldown** is not overly long for bursty queues
- Consumers use **appropriate SQS visibility timeout** (≥ max processing time)
- Optional **lifecycle hook** on scale-in so instances finish in-flight work

### Wrong vs right (answer pattern)
| Option flavor | Verdict |
| --- | --- |
| Keep CPU target tracking; increase target CPU % | **Wrong** — does not fix signal |
| Add more CPU to instance type only | **Wrong** — vertical scale; ignores spike **count** of messages |
| **Create scaling policy based on SQS ApproximateNumberOfMessagesVisible or backlog per instance** | **Right** |
| Replace with Lambda SQS trigger only (if listed) | **Maybe** — valid architecture, but question usually asks to **fix ASG policy**, not rewrite app |

### Elastic Beanstalk parallel
**Elastic Beanstalk worker tier** scales on **queue depth** by design — same lesson as custom EC2+ASG: **queue-driven workers → queue metrics**.

---

## Scenario bank

### 1 — ECS Fargate API behind ALB
**Problem**: Latency rises during peak; CPU on tasks is uneven.

**Answer**: ECS service **target tracking** on **`ALBRequestCountPerTarget`** (or average response time), not only CPU.

---

### 2 — ECS on EC2, tasks stay Pending
**Problem**: Service scaled up tasks but new tasks do not start.

**Answer**: Scale **capacity provider / ASG** (cluster capacity), not only service desired count. Check **Cluster Autoscaler** on EKS; on ECS use **capacity providers**.

---

### 3 — Lambda processing SQS, throttling
**Problem**: Queue depth grows; Lambda shows throttles.

**Answer**: Increase **function reserved concurrency** or account limit; tune **batch size** and **maximum concurrency** on event source mapping — not EC2 ASG.

---

### 4 — DynamoDB hot partition, 429 errors
**Problem**: Application errors under load; EC2 ASG already scaled out.

**Answer**: **DynamoDB** on-demand or **Application Auto Scaling** on RCU/WCU; better key design — **not** more EC2 alone.

---

### 5 — Kinesis consumers falling behind
**Problem**: Consumer EC2 CPU is low but processing lag increases.

**Answer**: Increase **shard count** (split shards) and/or optimize consumers; monitor **GetRecords.IteratorAgeMilliseconds**.

---

### 6 — Predictable daily peak 9 AM–5 PM
**Problem**: Users complain app is slow first hour of business day.

**Answer**: **Scheduled scaling** (raise min capacity before peak) and/or **predictive scaling** on ASG; optionally **warm pool** for faster scale-out.

---

### 7 — Scale-in kills long-running jobs
**Problem**: ASG scales in while workers still process SQS messages.

**Answer**: **Lifecycle hook** (pause termination → drain queue / complete work → **CompleteLifecycleAction**).

---

### 8 — Aurora read-heavy reporting
**Problem**: Read queries slow; writer CPU fine.

**Answer**: **Aurora Auto Scaling** for **read replicas** (CPU/connections policy), or add replicas manually — not scale writer via ASG.

---

### 9 — API Gateway + Lambda, sudden traffic
**Problem**: Need to handle burst without 429 from Lambda.

**Answer**: **Lambda concurrency** limits and **provisioned concurrency** for steady peak; API Gateway throttling quotas — scale **function concurrency**, not EC2.

---

### 10 — Spot instances for queue workers
**Problem**: Cost optimize fault-tolerant SQS workers.

**Answer**: ASG **mixed instances policy** with Spot + On-Demand base; scaling policy still on **queue depth**, not CPU alone.

---

## “Timely manner” troubleshooting checklist
When the exam says scaling is **too slow**:

1. **Metric** — Does it reflect backlog **before** user-visible delay? (SQS visible count, ALB requests, iterator age)
2. **Policy type** — Step vs target tracking appropriate for burst shape?
3. **Cooldown / warmup** — Scale-out blocked after recent activity?
4. **Max capacity** — Hit ceiling?
5. **Boot time** — Need **warm pool** or pre-baked AMI (**Image Builder**)?
6. **Health checks** — New instances marked unhealthy before ready?
7. **Downstream limit** — Database connections, API rate limits — **more instances make it worse**

---

## Exam traps (scaling)
- **CPU** for **SQS EC2/ECS workers** — classic wrong answer.
- **ALB metrics** for **queue-only** workers with no load balancer.
- **Scale EC2** when **DynamoDB** or **Kinesis shards** are the bottleneck.
- **Cluster Autoscaler** (EKS name) vs **ECS capacity provider**.
- **Lambda** “infinite scale” — still bounded by **concurrency** and **downstream**.
- **Minimum capacity 0** on ASG for always-on queue processing — causes cold start on every burst.
- Confusing **CodeDeploy deployment** traffic shift with **capacity** auto scaling.

---

## Quick review checklist
- [ ] SQS workers → **visible messages**, **backlog per instance**, or **oldest message age**
- [ ] ALB web → **RequestCountPerTarget** / latency
- [ ] CPU target tracking only when **CPU-bound**
- [ ] Lambda + SQS → **event source mapping** concurrency
- [ ] Kinesis → **iterator age** + **shards**
- [ ] DynamoDB → **capacity mode** / Application Auto Scaling
- [ ] Scale-in → **lifecycle hooks** for workers
- [ ] Slow scale-out → metric, cooldown, max, **warm pool**

## Related notes
- **AWS ECS** — Networking, load balancing, and scaling
- **Elastic Beanstalk** — worker tier / SQS
- **Lambda configuration** — concurrency, SQS poll
- **Amazon CloudWatch** — alarms and metric math
- **Amazon Kinesis** — shards and consumers
