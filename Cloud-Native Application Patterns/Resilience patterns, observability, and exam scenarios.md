# Resilience patterns, observability, and exam scenarios

SAP-C03 skills 5.3.1, 5.3.2, 5.3.6, 5.3.7, 5.4.2 and 5.4.4, plus folder-wide review.

Distributed systems fail partially: one dependency slows down, retries pile up, and the whole system collapses. SAP-C03 now names the **safety patterns** explicitly (circuit breakers, rate limits, bulkheads, exponential backoff) and expects observability built on **standardised instrumentation** with **SLOs** rather than ad-hoc dashboards. CloudWatch fundamentals are in the **Amazon CloudWatch** folder; DR strategy is in **Disaster Recovery**.

## Resilience patterns
| Pattern | Problem it solves | AWS implementation |
| --- | --- | --- |
| **Retry with exponential backoff + jitter** | Transient errors; synchronized retries cause thundering herd | AWS SDK standard/adaptive retry modes; Step Functions `Retry` (`BackoffRate`, `MaxAttempts`, `JitterStrategy: FULL`) |
| **Timeouts** | Slow dependency holds threads/concurrency forever | SDK/HTTP client timeouts; Lambda timeout; Step Functions `TimeoutSeconds`/heartbeat; keep Lambda timeout well below SQS visibility timeout |
| **Circuit breaker** | Keep calling a failing dependency, amplifying outage | In code (Powertools/resilience libraries), or Step Functions checking a DynamoDB circuit state; Service Connect outlier detection ejects bad endpoints |
| **Bulkhead** | One workload exhausts shared capacity | Separate queues, Lambda **reserved concurrency** per function, separate ECS services/node pools, cells, account-per-tenant |
| **Rate limiting / throttling** | Clients overload the service | API Gateway throttling and usage plans, WAF rate-based rules, SQS buffering, token bucket in ElastiCache |
| **Load shedding** | Accepting work you cannot finish raises latency for everyone | Return 429/503 early, drop low-priority requests, cap queue age, ALB/API Gateway throttles |
| **Queue-based levelling** | Bursty producers, fragile consumers | SQS between tiers; scale consumers on backlog per task |

**Exam tip**: Retries without backoff, jitter and a cap make outages **worse**. Pair retries with **idempotency** (see `Event-driven and workflow architectures.md`).

## Automated failure recovery
| Component | Mechanism |
| --- | --- |
| **EC2 Auto Scaling** | EC2 status checks by default; enable **ELB health checks** so app-level failures trigger replacement; set a health check grace period; lifecycle hooks for drain |
| **ECS tasks** | Service scheduler replaces tasks failing **container health checks** or ALB target health; maintains desired count across AZs |
| **ECS deployment circuit breaker** | Rolling deployment that cannot reach steady state is stopped and **automatically rolled back**; optionally roll back on CloudWatch alarms |
| **Lambda async** | Retries (0–2), maximum event age, **on-failure destination** (SQS, SNS, Lambda, EventBridge) or DLQ (SQS/SNS) |
| **Lambda + SQS** | Redrive policy to DLQ after `maxReceiveCount`; `ReportBatchItemFailures` so one bad message does not retry the batch |
| **Lambda + Kinesis/DynamoDB Streams** | Bisect batch, max retry attempts, max record age, on-failure destination |
| **EKS** | Liveness/readiness probes, ReplicaSets, PodDisruptionBudgets, Karpenter replaces unhealthy nodes |

## Standardised instrumentation
- **AWS Distro for OpenTelemetry (ADOT)**: AWS-supported OpenTelemetry SDKs, auto-instrumentation agents and collector. Instrument once, export traces/metrics to **X-Ray**, **CloudWatch**, Amazon Managed Service for Prometheus or third parties—vendor neutral.
- **AWS X-Ray**: distributed traces, service map, segment/subsegment latency, sampling rules. Accepts OpenTelemetry data; prefer OpenTelemetry for new instrumentation.
- **CloudWatch embedded metric format**: write structured logs that become metrics (cheap custom/per-tenant metrics).

## Container monitoring
| Option | Gives you |
| --- | --- |
| **Container Insights** (ECS/EKS) | Cluster, service, task/pod metrics and performance logs |
| **Container Insights with enhanced observability** | Container-level granularity, restart counts, state transitions, curated dashboards and drill-down from cluster to container; enabled per account or cluster (ECS) or via the **CloudWatch Observability EKS add-on** |
| **Service Connect / VPC Lattice metrics** | Request counts, latency, errors between services without sidecars |
| **Amazon Managed Prometheus + Grafana** | Kubernetes-native metric stack when teams already use PromQL |

## SLOs with CloudWatch Application Signals
- **Application Signals** auto-discovers services (ECS, EKS, EC2, Lambda) instrumented via ADOT/CloudWatch agent and shows standard **SLIs**: latency, availability/fault rate, call volume per operation and dependency.
- **SLO** = SLI + threshold + **attainment goal** over an interval (e.g. 99.9% of requests under 300 ms over 28 days). **Period-based** (fraction of good periods) or **request-based** (good/total requests); type cannot change after creation.
- **Error budget** = allowed failure (100% − goal). **Burn rate** = observed error rate ÷ baseline error rate; burn rate > 1 means the budget will run out before the interval ends.
- Create **burn-rate alarms** with short and long look-back windows (fast page for sudden spikes, ticket for slow burns), combined in composite alarms → SNS/Systems Manager Incident Manager.

**Exam tip**: "Alert on user-impacting reliability, not CPU" → SLO with burn-rate alarm. "Reduce alert fatigue from static thresholds" → multi-window burn rate or anomaly detection.

## User experience monitoring
| | **CloudWatch Synthetics** | **CloudWatch RUM** |
| --- | --- | --- |
| Data source | Scripted **canaries** on a schedule (heartbeat, API, broken link, visual, UI workflows) | JavaScript snippet in real users' browsers |
| Detects | Outages **before users report them**, even with zero traffic; private endpoints via VPC canaries | Real page load times, Core Web Vitals, JS/HTTP errors, by geography/browser |
| Pair with | X-Ray traces, alarms | X-Ray traces from browser to backend |

## Multi-account observability
| | **CloudWatch cross-account observability** | **Log subscription to central account** |
| --- | --- | --- |
| How | Observability Access Manager **sink** in monitoring account, **links** from source accounts (org-wide via StackSets/policies) | Subscription filters (account-level or per log group) → cross-account **destination** → Kinesis Data Streams/Firehose → S3 |
| Data copied? | **No**—query metrics, logs, traces, Application Signals in place | **Yes**—central copy you own |
| Best for | Live troubleshooting, dashboards, alarms across accounts | Long-term retention, immutable archive (S3 Object Lock, Glacier tiers), SIEM/OpenSearch, compliance |

**Exam tip**: "Operators need one console to search logs and traces across 50 accounts" → cross-account observability. "Retain all logs for 7 years in a security account that workload admins cannot delete" → subscription to central account + S3 with lifecycle and Object Lock. Many designs use both.

## Choose the right approach (folder-wide)
| Requirement | Answer |
| --- | --- |
| Ordered, deduplicated per-customer processing | **SQS FIFO** (MessageGroupId) or Kinesis partition key |
| Event fan-out across accounts/Regions | **EventBridge** bus-to-bus or direct cross-account targets |
| Exactly-once, long-running, auditable workflow | **Step Functions Standard** |
| High-volume short workflows at lowest cost | **Step Functions Express** |
| Workflow as code inside Lambda, long waits without paying compute | **Lambda durable functions** |
| Microservices across VPCs/accounts without sidecars | **VPC Lattice** |
| Secure image supply chain | ECR enhanced scanning + managed signing + tag immutability |
| Right-sized EKS node scaling | **Karpenter** / EKS Auto Mode |
| Real-time push to browsers | **API Gateway WebSocket** + DynamoDB connections |
| Pooled SaaS data isolation | ABAC session tags + LeadingKeys / RLS / S3 prefixes |
| Failed deployment must roll back automatically | **ECS deployment circuit breaker** |
| Vendor-neutral tracing standard | **ADOT** → X-Ray/CloudWatch |
| Measure reliability against business target | **Application Signals SLOs** + burn-rate alarms |
| Detect outage with no real traffic | **Synthetics** canaries |

## Common exam scenarios
- **Payment step must never run twice, workflow waits up to 3 days for fraud review** → Step Functions Standard with task token callback; Express cannot exceed 5 minutes.
- **Millions of short telemetry transformations per day, cost is the priority** → Step Functions Express (or Lambda directly); Standard per-transition pricing is the distractor.
- **Team wants saga logic as plain Python code in Lambda, pausing for human approval without paying while idle** → Lambda durable functions with `waitForCallback`.
- **Bank needs per-account transaction order but high total throughput** → SQS FIFO with MessageGroupId = account ID; avoid a single message group.
- **Duplicate shipments when consumers retry** → idempotency key stored with DynamoDB conditional write (Powertools idempotency).
- **Click-stream analytics with SQL, no servers** → Kinesis Data Streams → Firehose (Parquet) → S3 → Glue Data Catalog → Athena.
- **Events from 200 accounts must reach a central security tooling account** → EventBridge rules targeting a central bus with `aws:PrincipalOrgID` resource policy.
- **App Mesh-based ECS platform needs a migration path before end of support** → ECS Service Connect (ECS-only) via blue/green service recreation; VPC Lattice if traffic spans VPCs/accounts or non-ECS compute.
- **Microservices in 30 accounts with overlapping CIDRs need IAM-authorised calls** → VPC Lattice service network shared through AWS RAM with auth policies.
- **Kubernetes manifests must be portable, minimal node management** → EKS with Auto Mode or Fargate; ECS is the distractor.
- **Lambda burst exhausts RDS connections** → reserved concurrency (bulkhead), RDS Proxy, or SQS buffering.
- **Chat app must push messages to connected users** → API Gateway WebSocket, connection IDs in DynamoDB, `@connections` POST, clean up on 410 GoneException.
- **Enterprise tenant demands dedicated infrastructure and separate audit trail** → account-per-tenant silo vended by Control Tower; pool for smaller tiers (bridge overall).
- **Pooled DynamoDB table must block cross-tenant access even with buggy code** → tenant-scoped STS credentials with session tag + `dynamodb:LeadingKeys` condition.
- **Offboarded tenant's data must be provably unrecoverable** → KMS key per tenant, schedule key deletion.
- **One noisy tenant delays everyone in a shared SQS queue** → SQS fair queues with MessageGroupId = tenant ID, or per-tier queues.
- **New ECS task definition crash-loops in production** → deployment circuit breaker with automatic rollback.
- **Retries during a partial outage turn into a full outage** → exponential backoff with jitter, retry caps, circuit breaker, and load shedding.
- **Business wants alerts only when customer experience degrades** → Application Signals SLO with multi-window burn-rate alarms.
- **Detect checkout failures at 3 a.m. when there is no traffic** → CloudWatch Synthetics canary scripting the checkout flow.
- **Central team needs to troubleshoot traces and logs across accounts without copying data** → CloudWatch cross-account observability (OAM sink and links).
