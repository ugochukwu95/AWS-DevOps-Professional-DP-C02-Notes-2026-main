# Containers, service mesh, and ingress

SAP-C03 skills 1.1.6–1.1.10 and 1.1.12.

Container mechanics (task definitions, pods, IRSA, capacity providers) live in the **AWS ECS**, **AWS EKS**, **Kubernetes** and **ECR** folders; ingress basics in **API Gateway**; scaling basics in **AWS Scaling**. SAP-C03 adds new expectations: pick the **service-to-service networking** layer now that **App Mesh is discontinued**, secure the **image supply chain**, and choose the right **ingress** and **real-time** pattern.

## ECS vs EKS vs Fargate
| Decision factor | **ECS** | **EKS** |
| --- | --- | --- |
| Team skills | AWS-native, no Kubernetes knowledge | Existing Kubernetes skills, Helm, operators |
| Portability | AWS only | Kubernetes API portable (EKS Anywhere, other clouds) |
| Control plane cost | No charge | Per-cluster hourly fee |
| Ecosystem | AWS integrations (Service Connect, CodeDeploy blue/green) | CNCF ecosystem (Karpenter, Argo, Gateway API, Istio) |
| Ops overhead | Lowest | Higher (upgrades, add-ons); reduced with **EKS Auto Mode** |

**Data plane** is a separate choice for both:
- **Fargate**: no nodes to patch, per-task isolation, pay per vCPU/memory—best for spiky or small fleets; **Fargate Spot** for interruptible work.
- **EC2** (ECS capacity providers, EKS managed node groups/Karpenter): GPUs, daemon-heavy workloads, large steady fleets with Savings Plans/Spot, custom AMIs.

**Exam tip**: "Least operational overhead, no Kubernetes requirement" → **ECS on Fargate**. "Must keep Kubernetes manifests/Helm charts from on premises" → **EKS** (Fargate or Auto Mode for low ops).

## Service-to-service networking
| | **VPC Lattice** | **ECS Service Connect** | **PrivateLink** | **App Mesh** |
| --- | --- | --- | --- | --- |
| Scope | Services across **VPCs and accounts** (EC2, ECS, EKS pods, Lambda, ALB, IP targets) | ECS services only, same Region | One service exposed to many consumer VPCs | ECS/EKS/EC2 with Envoy sidecars |
| Sidecar | None (managed data plane) | Managed Service Connect agent | None | Self-managed Envoy |
| Cross-VPC | Yes, **no peering/TGW needed**, overlapping CIDRs OK | Needs VPC connectivity (peering/TGW) | Yes, overlapping CIDRs OK | Needs connectivity |
| Cross-account | Share services/service networks via **AWS RAM** | Share Cloud Map namespace via **AWS RAM** (2025) | Endpoint service allow-list | Mesh sharing |
| AuthZ | **IAM auth policies** (SigV4) on service network and service | TLS via AWS Private CA | Endpoint policy + SGs | mTLS |
| L7 routing | Path/header/weighted rules | Short names, retries, outlier detection | L4 only | Full Envoy routing |
| Status | Strategic | Strategic for ECS | Mature | **Discontinued 30 Sept 2026**—migrate |

VPC Lattice building blocks: **service network** (logical boundary; associate VPCs and services), **services** (listeners, rules, target groups), **auth policies** (layered: service network coarse, service fine-grained), **resource configurations + resource gateway** to expose TCP resources such as an RDS database, and **service-network VPC endpoints** for on-premises access over Direct Connect/VPN. Security groups apply to the VPC association; traffic stays AZ-local where possible with no inter-AZ data charges.

**Exam tip**: "Hundreds of microservices across many accounts and VPCs with overlapping CIDRs, IAM-based authorization, no sidecars" → **VPC Lattice**. "ECS-only, want service discovery, retries and metrics with minimal change" → **ECS Service Connect**. Any answer that introduces App Mesh for a new design is wrong.

## ECR image security and lifecycle
| Feature | What it does |
| --- | --- |
| **Basic scanning** | OS-package CVE scan on push or manual |
| **Enhanced scanning** (Amazon Inspector) | Continuous rescans as new CVEs publish, OS **and** language packages, findings in Inspector/Security Hub, EventBridge events |
| **Lifecycle policies** | Expire untagged images or keep last N per tag prefix—controls storage cost |
| **Tag immutability** | Prevents overwriting `prod` tags—needed for reproducible deployments |
| **Managed signing** (Nov 2025) | ECR signs on push using an **AWS Signer** profile; verify with Notation, Kubernetes admission controllers or ECS lifecycle-hook Lambda |
| **Replication** | Cross-Region/cross-account registry replication for DR and latency |
| **Pull-through cache** | Cache public/upstream registries privately |

Pipeline pattern: build → push → enhanced scan finding via EventBridge → fail promotion on CRITICAL → sign → deploy only signed, scanned, immutable digests.

## Autoscaling for containers and serverless
| Layer | Mechanism |
| --- | --- |
| Lambda | **Reserved concurrency** (cap and guarantee per function, protects downstream), **provisioned concurrency** (pre-initialised, removes cold starts; scale it with Application Auto Scaling on schedule or utilisation) |
| ECS services | **Service auto scaling** via **Application Auto Scaling**: target tracking (CPU, memory, ALB requests per target), step, scheduled; SQS backlog-per-task custom metric |
| ECS cluster capacity | **Capacity providers** with managed scaling (EC2) or Fargate/Fargate Spot weights |
| EKS pods | **HPA** (CPU/memory/custom metrics), **KEDA** for event-driven (SQS depth) |
| EKS nodes | **Cluster Autoscaler** (scales node groups, fixed instance types) vs **Karpenter** (provisions right-sized instances directly, Spot diversification, consolidation); **EKS Auto Mode** runs Karpenter for you |
| Others | Application Auto Scaling also covers DynamoDB, Aurora replicas, SageMaker endpoints, Spot Fleet |

**Exam tip**: "Node scaling is slow and wastes capacity due to fixed node groups" → **Karpenter**. "Downstream database overwhelmed by Lambda bursts" → **reserved concurrency** (or SQS buffer).

## Ingress patterns
| Option | Use when |
| --- | --- |
| **ALB** | HTTP/HTTPS, path/host routing, gRPC, OIDC/Cognito auth, WAF, Lambda targets |
| **NLB** | TCP/UDP/TLS, static IPs/Elastic IPs, extreme throughput, PrivateLink endpoint service front |
| **API Gateway REST** | API keys, **usage plans**, request validation, caching, WAF, private APIs, edge-optimised |
| **API Gateway HTTP API** | Cheaper/lower latency proxy, JWT authorizers, VPC link to ALB/NLB/Cloud Map |
| **AWS Load Balancer Controller** (EKS) | Ingress → ALB, Service type LoadBalancer → NLB, IP targets to pods; **Gateway API** support is GA (HTTPRoute/GRPCRoute → ALB, TCP/UDP/TLSRoute → NLB) |
| **AWS Gateway API Controller** | Kubernetes Gateway API objects → **VPC Lattice** services for east-west traffic |

Cost angle: share one ALB across many services with listener rules or `IngressGroup`; prefer HTTP API over REST when no REST-only feature is needed.

## Real-time: WebSocket and pub/sub
```text
Client --wss--> API Gateway WebSocket API --$connect--> Lambda --> DynamoDB (connectionId, userId, TTL)
Backend event --> Lambda --> query DynamoDB --> POST @connections/{connectionId} (API Gateway Management API)
                                              410 GoneException --> delete stale connectionId
```
- Routes: `$connect` (authorize here), `$disconnect` (best effort—also use TTL), `$default`, custom routes by `routeSelectionExpression`.
- Verified quotas: **2-hour** max connection, **10-minute** idle timeout, **128 KB** message (32 KB frames), integration timeout 29 seconds, 500 new connections/second per account per Region by default. Clients must reconnect and send heartbeats.
- Broadcast to many clients = fan-out loop over stored connection IDs (or SNS/EventBridge → Lambda workers).
- **AppSync** subscriptions / **AppSync Events** (serverless WebSocket channels) are an alternative, but AppSync is not on the SAP-C03 in-scope list—expect API Gateway WebSocket as the answer. **IoT Core is out of scope** for SAP-C03.

## Choose the right approach
| Requirement | Answer |
| --- | --- |
| Cross-account, cross-VPC microservice calls with IAM authZ | **VPC Lattice** + RAM-shared service network |
| ECS-only service discovery and traffic metrics | **ECS Service Connect** |
| Migrating off App Mesh | Service Connect (ECS-only) or VPC Lattice (mixed/cross-VPC) |
| Expose one SaaS endpoint privately to customer VPCs | **PrivateLink** (NLB endpoint service) |
| Continuous CVE scanning incl. language packages | ECR **enhanced scanning** (Inspector) |
| Only deploy trusted images | ECR **managed signing** + admission verification |
| Per-client throttling and quotas on an API | **API Gateway REST** usage plans + API keys |
| Push server updates to browsers | **API Gateway WebSocket** + DynamoDB connection table |

## Common exam scenarios
- **WebSocket clients silently disconnect after ~10 minutes of inactivity** → idle timeout; send client heartbeats and reconnect logic (also expect a hard 2-hour limit).
- **ECR storage cost grows from thousands of untagged CI images** → lifecycle policy expiring untagged images and keeping the last N releases.
- **Old base image gains a new critical CVE weeks after push** → only enhanced (continuous) scanning catches it; basic scan-on-push does not rescan.
