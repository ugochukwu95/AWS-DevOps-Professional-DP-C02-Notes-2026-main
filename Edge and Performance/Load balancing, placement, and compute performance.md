# Load balancing, placement, and compute performance

SAP-C03 performance questions (Skill 1.1.10 ingress patterns, rightsizing in Domain 3, scaling in Domain 5) usually hinge on one discriminating detail: **static IPs**, **protocol layer**, **PrivateLink**, **latency between instances**, or **failure isolation**. These notes cover the Elastic Load Balancing family, EC2 placement and networking, instance selection, and where caching fits. Scaling policies are covered in the `AWS Scaling` folder; ElastiCache engines and patterns are in the `Amazon ElastiCache` folder.

## Elastic Load Balancing comparison
| | ALB | NLB | GWLB | CLB |
| --- | --- | --- | --- | --- |
| Layer | 7 (HTTP/HTTPS, gRPC, WebSocket) | 4 (TCP, UDP, TLS) | 3 (IP packets, **GENEVE** port 6081) | 4/7 (legacy) |
| Static IP | No (DNS name only) | **One static IP per AZ**; can attach **Elastic IPs** | No | No |
| TLS | Terminates; SNI multi-cert; **mTLS** | Terminates (TLS listener) or passes through (TCP) | Not applicable—transparent | Basic |
| Targets | Instance, IP, **Lambda** | Instance, IP, **ALB** | Instance, IP (appliances) | Instance |
| Source IP | `X-Forwarded-For` header | **Preserved** (instance targets) | Preserved | `X-Forwarded-For` / proxy protocol |
| Routing | Host, path, header, query string, method, source IP | Port-based | Flow hash to appliances | Basic |
| Use cases | Microservices, containers, auth (Cognito/OIDC) | Extreme throughput, non-HTTP, fixed IPs, **PrivateLink** | Third-party firewalls/IDS inline | Avoid—previous generation |

- **PrivateLink endpoint services** must sit behind an **NLB** (or a **GWLB** for appliance insertion). An ALB cannot be the front of an endpoint service directly—put an NLB with an ALB-type target group in front.
- **Need static IPs and HTTP routing** → NLB with ALB target, or **Global Accelerator** in front of the ALB.
- NLB now supports **security groups**; older designs relied only on target security groups.

**Exam tip**: "Expose a service to hundreds of consumer VPCs/accounts without VPC peering or overlapping CIDR issues" → **NLB + PrivateLink endpoint service**.

## Cross-zone load balancing
| LB | Default | Inter-AZ data charge |
| --- | --- | --- |
| ALB | **On** (can turn off per target group) | No charge |
| NLB | **Off** | **Charged** when enabled |
| GWLB | **Off** | **Charged** when enabled |
| CLB | On when created in the console, off via API/CLI | No charge |

With cross-zone off, each LB node only sends to targets in its own AZ—uneven target counts per AZ cause uneven load.

## Target behaviour settings
- **Sticky sessions**: ALB uses duration-based (`AWSALB` cookie) or application-based cookies; NLB uses source IP stickiness. Stickiness causes uneven load—prefer externalizing session state (ElastiCache, DynamoDB).
- **Deregistration delay** (connection draining): default **300 s**, range 0–3600 s. Lower it for short requests to speed deployments.
- **Slow start** (ALB): ramps new targets up over 30–900 s—useful for apps with cold caches or JIT warm-up.
- **Routing algorithms** (ALB): round robin, **least outstanding requests** (uneven request cost), weighted random.

## EC2 placement groups
| Strategy | Layout | Limits | Use when |
| --- | --- | --- | --- |
| **Cluster** | Packed close together in **one AZ** | Single AZ; launch all at once with same type for best chance of capacity | **Lowest latency, highest throughput** between nodes (HPC, tightly coupled) |
| **Spread** | Each instance on distinct hardware/rack | **7 running instances per AZ** per group; can span AZs | Small number of critical instances that must not fail together |
| **Partition** | Groups of instances on separate racks | Up to **7 partitions per AZ**; hundreds of instances | Large distributed, topology-aware systems (HDFS, HBase, Cassandra, Kafka) |

**Exam tip**: Cluster placement improves performance but **reduces availability** (one AZ, shared rack risk). If a question needs both low latency and fault tolerance for a big fleet, look for **partition**. "Insufficient capacity" in a cluster group → stop and relaunch all instances together, or use a capacity reservation.

## Networking performance
- **Enhanced Networking (ENA)**: SR-IOV, higher bandwidth and PPS, lower latency; on by default for current-generation Nitro instances. Bandwidth scales with instance size.
- **Elastic Fabric Adapter (EFA)**: ENA plus **OS-bypass** for **MPI and NCCL** workloads (HPC, distributed ML training). Use with a **cluster placement group**; OS-bypass traffic does not route across subnets.
- **Nitro System**: offloads networking, storage, and security to dedicated hardware—enables bare-metal instances, high EBS/network throughput, **Nitro Enclaves** for isolated processing of sensitive data.

## Instance selection
| Family | Optimized for |
| --- | --- |
| M, T | General purpose (T = burstable) |
| C | Compute (batch, web, gaming, encoding) |
| R, X | Memory (in-memory DBs, caches, SAP HANA on X/High Memory) |
| I, D | Storage (high local IOPS / dense HDD) |
| P, G, Inf, Trn | Accelerated (GPU training, graphics, Inferentia inference, Trainium training) |
| Hpc | HPC-optimized with EFA |

- **Graviton** (Arm, `g` suffix such as `m7g`, `c7g`): best **price performance** for workloads that run on Arm—Linux, containers, interpreted languages, open-source databases. Managed services (RDS, ElastiCache, Lambda, Fargate) offer Graviton with no code change.
- **Burstable T family**: earns **CPU credits** below baseline, spends them above. **Unlimited mode** (default for T3/T4g) bills surplus credits instead of throttling. Sustained high CPU on T instances → move to M/C.

## Auto Scaling for performance
See the `AWS Scaling` folder for policy types and metrics. The SAP-relevant features:
- **Warm pools**: pre-initialized instances held **stopped, hibernated, or running** to cut scale-out time for apps with long boot/initialization.
- **Predictive scaling**: forecasts load from history and launches capacity **ahead** of recurring daily/weekly peaks; combine with target tracking for unexpected load.
- **Lifecycle hooks**: pause instances in `Pending:Wait` / `Terminating:Wait` (default heartbeat 1 hour) to bootstrap, register, or drain and ship logs.
- **Mixed instances policy** with Spot and multiple instance types; **capacity rebalancing** for Spot interruptions.

## Caching layers
```text
Users → CloudFront (edge) → API Gateway cache → App tier → ElastiCache / DAX → DB read replicas → Primary DB
```

| Layer | Caches | Notes |
| --- | --- | --- |
| **CloudFront** | HTTP responses, static assets | Closest to user; cheapest per request |
| **API Gateway cache** | REST API responses per stage | **REST APIs only** (not HTTP APIs); default TTL 300 s |
| **ElastiCache** (Redis OSS/Valkey/Memcached) | Arbitrary objects, sessions, query results | Requires app code (lazy loading / write-through) |
| **DAX** | DynamoDB reads | **Microsecond** reads; API-compatible with DynamoDB—minimal code change |
| **Read replicas** | Full DB reads | Aurora up to 15 replicas; eventual consistency (replica lag) |

**Exam tip**: "DynamoDB read latency in microseconds with least code change" → **DAX**, not ElastiCache. "Relational read-heavy reporting queries" → **read replicas**. "Same results requested repeatedly from an RDS-backed API" → **ElastiCache** or API Gateway caching.

## Choose the right approach
| Requirement | Answer |
| --- | --- |
| Fixed IP per AZ for firewall allowlisting | **NLB** with Elastic IPs |
| Path/host-based routing to containers | **ALB** |
| Inline third-party firewall fleet for all VPC traffic | **GWLB** + GWLB endpoints |
| Share a service privately across accounts | **NLB + PrivateLink** |
| Tightly coupled HPC, lowest inter-node latency | **Cluster placement group** + **EFA** |
| Few critical instances isolated from hardware failure | **Spread placement group** |
| Cassandra/Kafka cluster aware of rack failures | **Partition placement group** |
| Long boot time hurts scale-out | **Warm pool** |
| Predictable morning traffic spike | **Predictive scaling** (or scheduled scaling) |
| Lower compute cost for Linux containers | **Graviton** instances / Fargate on Arm |
