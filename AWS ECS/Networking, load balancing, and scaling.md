# ECS networking, load balancing, and scaling

## Network modes (task definition)
| Mode | Launch types | Exam note |
| --- | --- | --- |
| **awsvpc** | Fargate (required), EC2 | Each task gets its own **ENI** and **security groups** |
| **bridge** | EC2 only | Dynamic host port mapping to container port |
| **host** | EC2 only | Container uses host network namespace directly |

**Default for Fargate and modern EC2 designs**: **awsvpc**.

```text
VPC
├── Public subnets → ALB
├── Private subnets → ECS tasks (awsvpc ENIs)
│   ├── Task SG: allow traffic from ALB SG on app port
│   └── Task SG: allow egress to NAT/VPC endpoints
└── NAT gateway or VPC endpoints for ECR, CloudWatch Logs, Secrets Manager
```

**Exam tip**: Tasks in **private subnets** need **NAT** or **VPC interface endpoints** to pull from ECR and send logs unless using VPC endpoints for those services.

## Load balancing patterns
| Pattern | When to use |
| --- | --- |
| **Application Load Balancer (ALB)** | HTTP/HTTPS, path/host routing, WebSockets, target type **IP** (awsvpc) |
| **Network Load Balancer (NLB)** | TCP/UDP, static IP, extreme performance, TLS passthrough |
| **No load balancer** | Internal workers, queue consumers, scheduled jobs |
| **Service discovery (Cloud Map)** | Microservices call each other by **DNS name** inside VPC |

### ALB + ECS service (classic)
1. Service defines **load balancer** attachment: target group, container name, container port.
2. ECS registers task **private IP** with target group (target type **ip**).
3. Health checks: ALB → task; optional **container health check** in task definition.

**Exam trap**: Security group on **tasks** must allow inbound from **ALB security group** on the **container port**, not only port 443 on the ALB.

### CodeDeploy blue/green (ECS)
CodeDeploy creates **two target groups** (blue/green) and **two task sets** on the same service.

Traffic shifts on the **listener** (ALB or NLB) using **Canary**, **Linear**, or **AllAtOnce** deployment configuration.

Requires service with load balancer configured for CodeDeploy controller — not the same as a simple rolling ECS service update.

## Service discovery and Service Connect
| Feature | Purpose |
| --- | --- |
| **Cloud Map service registry** | ECS creates DNS records (`api.local`) for tasks |
| **ECS Service Connect** | Built-in naming, connectivity, and observability between services in a cluster/namespace |

**Exam tip**: “Services need to discover each other without hard-coded IPs” → **AWS Cloud Map** registry on the ECS service, or **Service Connect** when the question mentions AWS-managed connect/metrics between services.

## Security groups and IAM (network layer)
| Layer | Controls |
| --- | --- |
| **Task ENI (awsvpc)** | Task security groups — east-west and ALB → task |
| **ALB** | Listener rules, WAF association, TLS certificates (ACM) |
| **NACLs** | Subnet-level; rarely the first ECS fix in exam scenarios |

PrivateLink and **VPC endpoints** reduce exposure of traffic to the public internet for AWS API calls.

## Logging and metrics (operational networking)
| Approach | Notes |
| --- | --- |
| **`awslogs` driver** | CloudWatch Logs group per container; execution role needs `logs:CreateLogStream` |
| **FireLens** | Sidecar forwards to CloudWatch, Kinesis, OpenSearch, partner — common on **Fargate** (no DaemonSet) |
| **Container Insights** | Cluster/service/task metrics and diagnostics in CloudWatch |

**Exam trap**: Enabling Container Insights ≠ automatic log shipping; you still configure log drivers or FireLens.

## Scaling — two layers
Exam questions often conflate these; separate them deliberately.

### 1 — Service auto scaling (task count)
Scales **number of tasks** in a service.

| Policy type | Behavior |
| --- | --- |
| **Target tracking** | e.g. average CPU 70%, ALB **RequestCountPerTarget**, custom metric |
| **Step scaling** | Steps based on CloudWatch alarm breach |
| **Scheduled scaling** | Predictable traffic (business hours) |

Requires **Application Auto Scaling** registered on the ECS service desired count.

```text
ALB RequestCountPerTarget rises
        ↓
Target tracking policy
        ↓
ECS service desired count increases
        ↓
New tasks register to target group when healthy
```

**Exam tip**: “Scale out when requests per target increase” → **target tracking** on **ALB metric**, not CPU alone.

### 2 — Capacity provider / cluster scaling (EC2 hosts)
When tasks cannot be placed (insufficient CPU/memory on container instances):

| Mechanism | Action |
| --- | --- |
| **EC2 capacity provider + managed scaling** | ASG adds EC2 instances |
| **Fargate** | AWS adds capacity automatically — you scale **service desired count** only |

```text
Pending tasks (cannot place)
        ↓
Capacity provider managed scaling
        ↓
Auto Scaling group launches EC2 instances
        ↓
ECS agent registers instance → tasks placed
```

**Exam trap**: **Cluster Autoscaler** is **EKS** terminology. On ECS use **capacity providers** with ASG **managed scaling**.

### Fargate Spot
**FARGATE_SPOT** capacity provider reduces cost; tasks can be interrupted with 2-minute notice.

Use for fault-tolerant workloads; combine with **multiple AZs** and **capacity provider strategy** weights (On-Demand + Spot).

## Placement (EC2 launch type)
| Strategy | Goal |
| --- | --- |
| **spread** | Balance across AZs/instances (HA) |
| **binpack** | Pack tasks to minimize instance count (cost) |
| **random** | Simple distribution |

**Placement constraints**: `memberOf` on attributes (instance type, AZ custom attributes).

Not applicable to Fargate — AWS chooses infrastructure.

## High availability
- Run service across **multiple subnets in multiple AZs**.
- ALB is **Regional** across AZs; tasks should match.
- Use **minimum healthy 100%** / **maximum 200%** carefully for zero-downtime rollouts (allows new tasks before old drain).
- **Deployment circuit breaker** stops bad releases and rolls back automatically.

## Storage networking
| Volume | Use |
| --- | --- |
| **EFS** | Shared read/write many tasks (content, uploads) |
| **EBS** | Single-task attach (EC2; not Fargate for classic Docker volumes) |
| **FSx** | Windows/Lustre specialized workloads |

Mount requires task definition volume + mount point; security groups must allow NFS for EFS.

## Troubleshooting (exam-relevant)
| Symptom | Likely cause |
| --- | --- |
| Tasks stuck **PROVISIONING** | Fargate limits, subnet IP exhaustion (awsvpc uses ENI per task) |
| **CannotPullContainerError** | ECR URI, tag, **execution role**, or no route to ECR |
| Target **unhealthy** | Wrong container port, app not listening on `0.0.0.0`, health check path, SG |
| Service scaled but no new tasks | **Capacity** — EC2 cluster full; ASG max, insufficient capacity provider |
| Inter-service calls fail | Missing Cloud Map, wrong DNS namespace, SG blocks east-west |
| Logs missing | Execution role, log group name, VPC without logs endpoint/NAT |

## High-value exam scenarios
| Scenario | Answer |
| --- | --- |
| Fargate tasks in private subnet pull ECR | **NAT** or **ECR VPC endpoints** + execution role |
| HTTP API with path-based routing | **ALB + ECS service (awsvpc)** |
| Scale tasks on request rate | **Target tracking** on **RequestCountPerTarget** |
| Scale EC2 instances when tasks pending | **Capacity provider** + ASG managed scaling |
| Microservice DNS discovery | **Cloud Map** or **Service Connect** |
| No host management | **Fargate** launch type / capacity provider |
| Blue/green with 10% traffic/minute | **CodeDeploy for ECS** + **Linear** config |

## Quick review checklist
- [ ] awsvpc ENIs, task SGs, ALB target type **ip**
- [ ] Private subnet egress (NAT vs endpoints)
- [ ] Service auto scaling vs capacity provider scaling
- [ ] ALB vs NLB vs service discovery
- [ ] Fargate vs EC2 placement and DaemonSet limitation (use FireLens)
- [ ] CodeDeploy dual target groups vs rolling update min/max %
