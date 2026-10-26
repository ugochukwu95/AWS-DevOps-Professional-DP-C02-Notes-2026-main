# The six pillars (design principles and AWS themes)

Each pillar has **design principles** (official AWS wording summarized below) and **review questions** in the Well-Architected Tool. Use this file as a study map; run the tool against a real workload for the full question set.

---

## 1. Operational excellence

**Goal**: Run systems to deliver business value, learn from operations, and improve procedures and automation.

### Design principles (summary)
| Principle | Meaning |
| --- | --- |
| **Perform operations as code** | Deployments, runbooks, and infra changes are scripted and versioned (IaC, pipelines). |
| **Make frequent, small, reversible changes** | Reduce blast radius; enable fast rollback (blue/green, canaries, feature flags). |
| **Refine operations procedures frequently** | Playbooks and on-call docs evolve with the system. |
| **Anticipate failure** | Game days, failure injection, pre-mortems. |
| **Learn from operational failures** | Blameless postmortems; feed fixes into automation and guardrails. |

### Typical AWS capabilities
- **CI/CD**: CodePipeline, CodeBuild, CodeDeploy, GitHub Actions on AWS
- **IaC**: CloudFormation, CDK, Terraform (with change sets / plan)
- **Operations**: Systems Manager (Run Command, Automation, Session Manager, Patch Manager)
- **Observability**: CloudWatch (metrics, logs, alarms, dashboards, synthetics/canaries)
- **Incident workflow**: EventBridge, SNS, OpsCenter, PagerDuty integrations
- **Documentation**: Confluence/wiki + template parameters, README for runbooks

### Questions reviewers ask
- Can you deploy without manual console steps?
- Do you know **workload health** (SLIs/SLOs) and alarm on customer impact?
- Are runbooks and ownership clear for on-call?

---

## 2. Security

**Goal**: Protect information, systems, and assets while delivering business value through risk assessments and mitigation.

### Design principles (summary)
| Principle | Meaning |
| --- | --- |
| **Implement a strong identity foundation** | Centralized identity, least privilege, no long-term keys where avoidable. |
| **Enable traceability** | Log and monitor actions; integrate with SIEM where needed. |
| **Apply security at all layers** | Network, host, application, data—defense in depth. |
| **Automate security best practices** | Config rules, SCPs, pipeline security scans, automated remediation. |
| **Protect data in transit and at rest** | TLS, KMS, encryption defaults. |
| **Keep people away from data** | Break-glass only; prefer role-based access and tooling over direct data access. |
| **Prepare for security events** | IR plan, forensics readiness, contact trees. |

### Typical AWS capabilities
- **Identity**: IAM, IAM Identity Center (SSO), roles, permission boundaries, SCPs (Organizations)
- **Network**: VPC, security groups, NACLs, PrivateLink, WAF, Shield
- **Secrets**: Secrets Manager, Parameter Store (SecureString), KMS
- **Detection**: GuardDuty, Security Hub, Macie, CloudTrail, Config
- **Governance**: Control Tower, Firewall Manager, Resource Access Manager (controlled sharing)

### Questions reviewers ask
- Is **least privilege** enforced and reviewed?
- Is **encryption** default-on for sensitive data?
- Can you detect and respond to **misconfiguration or compromise**?

---

## 3. Reliability

**Goal**: A workload performs its intended function correctly and consistently, and recovers quickly from failure to meet demand.

### Design principles (summary)
| Principle | Meaning |
| --- | --- |
| **Automatically recover from failure** | Health checks, Auto Scaling, multi-AZ, managed services with built-in redundancy. |
| **Test recovery procedures** | Restore backups; failover drills; validate RTO/RPO. |
| **Scale horizontally to increase availability** | Avoid single points of failure; shard where appropriate. |
| **Stop guessing capacity** | Load test; use auto scaling and queues to absorb spikes. |
| **Manage change through automation** | Controlled deployments; avoid unplanned manual prod edits. |
| **Use fault isolation** | Separate accounts/OUs, bulkheads, cell-based designs for large systems. |

### Typical AWS capabilities
- **Compute resilience**: Multi-AZ EC2/RDS, ASG, ECS/EKS across AZs, Lambda (Regional service)
- **Data**: RDS/Aurora backups, S3 versioning/replication, DynamoDB global tables (where needed)
- **Routing**: Route 53 health checks and failover, ALB/NLB across AZs
- **Messaging**: SQS buffering, DLQs, idempotent consumers
- **DR**: Pilot light, warm standby, backup and restore—**defined RTO/RPO**

### Questions reviewers ask
- What happens when an **AZ or dependency** fails?
- Are **backups** tested restores, not just snapshots?
- Are quotas and **service limits** monitored before scale events?

---

## 4. Performance efficiency

**Goal**: Use computing resources efficiently and adapt as requirements change and technologies evolve.

### Design principles (summary)
| Principle | Meaning |
| --- | --- |
| **Democratize advanced technologies** | Use managed services (ML, streaming, search) instead of building undifferentiated stacks. |
| **Go global in minutes** | CloudFront, Global Accelerator, multi-Region when latency or resilience requires it. |
| **Use serverless architectures** | Remove undifferentiated scaling work where the model fits. |
| **Experiment more often** | Cheap experiments with new instance types, Graviton, storage tiers. |
| **Consider mechanical sympathy** | Match access patterns to data stores (cache, columnar, object, relational). |
| **Review and optimize over time** | Performance is not “set once at launch.” |

### Typical AWS capabilities
- **Right-sizing**: Compute Optimizer, CloudWatch metrics, load testing
- **Caching**: ElastiCache, CloudFront, DAX, API Gateway caching
- **Compute choice**: Lambda, Fargate, Graviton, Spot for fault-tolerant batch
- **Data**: Aurora, DynamoDB, OpenSearch, Kinesis—chosen by access pattern
- **Network**: Placement groups (HPC), Enhanced Networking, Global Accelerator

### Questions reviewers ask
- Do architecture choices match **read/write patterns** and latency targets?
- Is there **over-provisioning** without measurement?
- Can the design **scale down** as well as up?

---

## 5. Cost optimization

**Goal**: Run systems to deliver business value at the lowest price point—not by cutting corners, but by matching spend to need.

### Design principles (summary)
| Principle | Meaning |
| --- | --- |
| **Implement cloud financial management** | FinOps: ownership, budgets, showback/chargeback, optimization culture. |
| **Adopt a consumption model** | Pay for what you use; scale to zero where possible. |
| **Measure overall efficiency** | Unit economics (cost per transaction, per user). |
| **Stop spending on undifferentiated heavy lifting** | Managed services vs self-managed clusters when TCO favors managed. |
| **Analyze and attribute expenditure** | Tags, Cost Explorer, cost allocation tags, CUR. |
| **Use managed services to reduce cost of operations** | Less ops labor often beats slightly cheaper raw compute. |

### Typical AWS capabilities
- **Visibility**: Cost Explorer, AWS Budgets, Cost Anomaly Detection, CUR + Athena
- **Pricing models**: Savings Plans, Reserved Instances, Spot
- **Lifecycle**: S3 Intelligent-Tiering/Glacier, EBS snapshot policies, idle resource cleanup
- **Architecture**: Serverless, Graviton, S3 vs EBS for static assets, NAT gateway design
- **Governance**: SCPs to restrict expensive Regions/instance types in non-prod

### Questions reviewers ask
- Are resources **tagged** and costs attributed to owners?
- Are **idle** or legacy resources decommissioned?
- Are **commitment discounts** used appropriately for steady-state load?

---

## 6. Sustainability

**Goal**: Minimize the environmental impacts of running cloud workloads—primarily energy use and associated carbon footprint.

### Design principles (summary)
| Principle | Meaning |
| --- | --- |
| **Understand your impact** | Measure workload efficiency; know which components drive usage. |
| **Establish sustainability goals** | Set targets (e.g. reduce compute minutes, improve utilization). |
| **Maximize utilization** | Right-size; consolidate; avoid always-on waste. |
| **Anticipate and adopt new hardware and software** | Graviton and newer instance generations often improve performance per watt. |
| **Use managed services** | Shared multi-tenant services can improve average utilization. |
| **Reduce downstream impact** | Efficient data transfer, edge caching, fewer redundant copies. |
| **Region selection** | Consider user proximity **and** grid carbon intensity where business allows. |

### Typical AWS capabilities
- **Efficient compute**: Graviton (ARM), right-sizing, Spot for flexible batch, Lambda/Fargate for variable load
- **Storage efficiency**: Lifecycle policies, compression, delete unused snapshots/AMIs
- **Data movement**: CloudFront to reduce origin load; optimize cross-Region replication
- **Reporting**: Customer Carbon Footprint Tool (account-level emissions data)
- **Scheduling**: Instance Scheduler, auto scaling min=0 where safe

### Questions reviewers ask
- Is **utilization** low on large fixed fleets?
- Can workloads shift to **more efficient instance families** or serverless?
- Are **data retention and replication** justified by business need?

---

## Cross-pillar trade-offs (study examples)
| Scenario | Tension | Balanced approach |
| --- | --- | --- |
| Real-time fraud detection | Performance vs cost | Managed streaming + auto scaling; cache hot paths |
| Regulated data | Security vs ops velocity | Pipeline scans, SCPs, separate accounts; still automate deploys |
| Global video | Performance vs sustainability | CloudFront edge + efficient codecs; right-size origin |
| Batch analytics | Cost vs reliability | Spot with checkpointing; SQS/DLQ for retries |

---

## Quick pillar → “first service to think of” (mnemonic aid)
| Pillar | DevOps-oriented anchor |
| --- | --- |
| Operational excellence | **Pipeline + runbooks + alarms** |
| Security | **IAM + KMS + CloudTrail** |
| Reliability | **Multi-AZ + backups + health checks** |
| Performance efficiency | **Metrics + cache + right instance/store** |
| Cost optimization | **Tags + Budgets + Savings Plans/Spot** |
| Sustainability | **Utilization + Graviton + lifecycle** |

---

## Using these notes with the Well-Architected Tool
1. Create a workload in the tool matching one of your study architectures (e.g. three-tier VPC app with CodePipeline).
2. Walk each pillar; mark **improvement needed** where your design is intentionally simplified for learning.
3. Read generated **HRIs** and map each to a concrete AWS action (SCP, backup plan, canary, budget alarm).

That closes the loop between abstract pillars and the services in the rest of this repository.
