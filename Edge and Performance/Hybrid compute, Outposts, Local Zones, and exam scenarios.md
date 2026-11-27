# Hybrid compute, Outposts, Local Zones, and exam scenarios

When a Region is too far away, data cannot leave a site, or the company already owns on-premises hardware, the workload runs **outside the Region but is still managed from AWS**. SAP-C03 Skill 1.3.5 (*Design hybrid compute patterns*) names four options: **Amazon ECS Anywhere**, **Amazon EKS Anywhere**, **AWS Outposts**, and **AWS Local Zones**; **EKS Hybrid Nodes** is the newer EKS option that sits between them. This file then wraps up the whole `Edge and Performance` folder. On-premises connectivity (Direct Connect, VPN, Transit Gateway) is in the `Hybrid Networking` folder.

## The three questions that decide the answer
| Question | Points to |
| --- | --- |
| **Whose hardware?** Customer already owns servers/VMs | ECS Anywhere, EKS Hybrid Nodes, EKS Anywhere |
| | AWS-owned hardware installed on your premises | **Outposts** |
| | AWS-owned hardware in an AWS metro site | **Local Zones** |
| **Where is the control plane?** AWS Region (needs a reliable link) | ECS Anywhere, EKS Hybrid Nodes, Outposts, Local Zones |
| | Customer site, can run **disconnected / air-gapped** | **EKS Anywhere** |
| **Who needs to be close?** On-premises systems or data | Outposts, ECS/EKS on own hardware |
| | End users in a metro area without a Region | **Local Zones** |

## Hybrid compute options compared
| | ECS Anywhere | EKS Hybrid Nodes | EKS Anywhere | Outposts | Local Zones |
| --- | --- | --- | --- | --- | --- |
| Hardware | **Your** servers/VMs | **Your** servers/VMs | **Your** infrastructure (vSphere, bare metal, Nutanix, CloudStack, Snow) | **AWS** racks/servers in your site | **AWS** in an AWS metro site |
| Control plane | ECS in the Region | EKS in the Region (AWS-managed) | **On-prem, customer-managed** (EKS Distro) | Region (EKS local clusters can run the control plane on the Outpost) | Parent Region |
| Disconnected operation | No—needs Region link to manage | **No**—not for disconnected or intermittent sites | **Yes**, including air-gapped | Running workloads continue; no management until link returns | N/A (AWS network) |
| Pricing model | Per **managed instance-hour** | Per **vCPU-hour** of attached nodes | Free software; optional **Enterprise Subscription** per cluster for support | Outpost capacity term (racks/servers) | Regular per-resource pricing, Local Zone rates |
| Who operates it | You: hardware, OS; AWS: orchestration | You: hardware, OS, nodes; AWS: K8s control plane | **You** do everything (lifecycle, upgrades) | AWS: hardware; you: workloads | AWS |
| Best for | Simple containers on existing hardware, one control plane with the cloud | Kubernetes on existing hardware, AWS-managed control plane, burst to cloud | Kubernetes at sites with no/poor connectivity, regulated air-gapped | AWS APIs and services on-prem, data residency, low latency to plant systems | Single-digit ms to metro users |

**Exam tip**: "Use **existing** on-premises servers, manage containers from the **AWS console**, least operational overhead" → **ECS Anywhere** (or **EKS Hybrid Nodes** for Kubernetes). "Must run with **no connection** to AWS" → **EKS Anywhere**. "Need **AWS-managed hardware** and AWS services such as EBS, RDS, S3 on site" → **Outposts**. "Users in a city far from a Region" → **Local Zone**.

## Amazon ECS Anywhere
- Register on-prem servers/VMs (SSM Agent + ECS agent) to an ECS cluster as **external instances**; run tasks and services with the **`EXTERNAL` launch type** alongside EC2 and Fargate in the same cluster.
- Priced per managed on-prem instance-hour (**$0.01025** at the time of writing); EC2/Fargate capacity in the same cluster is billed normally.
- Limits that appear in distractors: **no service load balancing (ELB)**, **no service discovery**, no `awsvpc` mode (bridge/host/none only), no capacity providers, no EFS volumes. Best for **outbound-heavy or data-processing** workloads, not public web tiers.
- IAM credentials come from the SSM Agent and are refreshed when connectivity returns.

## Amazon EKS Hybrid Nodes and EKS Anywhere
- **EKS Hybrid Nodes**: on-prem physical or virtual machines join a normal **EKS cluster** in the Region; AWS runs the control plane. Connect over **DX or Site-to-Site VPN** and declare **remote node and remote pod networks** at cluster creation. Node credentials via **SSM hybrid activations** or **IAM Roles Anywhere**. One cluster can mix hybrid nodes with Regional, Local Zone, or Outposts nodes to **burst to cloud**. Not supported on EC2, Outposts, or Local Zones hardware, and not for disconnected sites.
- **EKS Anywhere**: you create and operate Kubernetes clusters on your own infrastructure using **EKS Distro** (same Kubernetes build as EKS). Runs **air-gapped**; optionally register with the **EKS Connector** to view clusters in the EKS console. Support and curated packages come from a paid **EKS Anywhere Enterprise Subscription**. Not supported on AWS Cloud or Outposts.

**Exam tip**: Hybrid Nodes = AWS manages the control plane, you need connectivity. EKS Anywhere = you manage everything, connectivity optional. Running EKS **on Outposts** is a third option when the hardware should be AWS-owned.

## AWS Outposts
| | Outposts racks | Outposts servers |
| --- | --- | --- |
| Form factor | Full 42U rack(s) | 1U or 2U server |
| Storage | EBS, S3 on Outposts | **Instance store only** (no EBS) |
| Services | Broadest set (EC2, EBS, S3, ECS, EKS, RDS, ElastiCache, EMR, ALB) | EC2, ECS |
| Network | Outpost subnet + **local gateway** to on-prem network | Local network interface to on-prem network |
| Fit | Data center scale | Retail stores, branch offices, space-constrained sites |

- Needs a reliable **service link** to the parent Region. The **control plane lives in the Region**—if the link drops, running instances keep working, but you cannot launch or manage resources until it returns. It is **not** a disconnected or air-gapped solution.
- **EKS on Outposts**: *extended clusters* keep the control plane in the Region; *local clusters* run the control plane on the Outpost to tolerate temporary disconnects.
- Capacity is fixed to what you ordered—plan headroom; there is no elastic burst on the Outpost itself.
- For an S3 API on site, use **S3 on Outposts**; to keep data in a country with an AWS-managed site, also consider **Dedicated Local Zones**.

## AWS Local Zones
- AWS-run infrastructure in **large metro areas**, extending a parent Region: opt in to the zone group, then create a **Local Zone subnet** in your VPC.
- Typical services: EC2, EBS, VPC, ECS, EKS, ALB; some zones add RDS, FSx, ElastiCache, and others—check per zone.
- Use cases: media rendering, real-time gaming, live video, low-latency trading front ends, **hybrid migration** with a Local Zone close to the existing data center (connect via DX).
- **Dedicated Local Zones**: Local Zone infrastructure dedicated to one customer or community for sovereignty requirements.

## Choose the right approach
| Requirement | Answer |
| --- | --- |
| Cache global static and dynamic web content | **CloudFront** |
| Reduce origin load from many edge locations | **CloudFront Origin Shield** |
| Two static IPs fronting multi-Region TCP/UDP app | **Global Accelerator** |
| Low-cost DNS-based multi-Region routing, failover delay acceptable | **Route 53** latency/failover routing |
| Lightweight request manipulation at the edge | **CloudFront Functions** |
| Edge logic needing network calls or origin triggers | **Lambda@Edge** |
| Fixed IPs for a regional TCP service | **NLB** with Elastic IPs |
| Private service shared across many VPCs/accounts | **NLB + PrivateLink** |
| Inline security appliances | **GWLB** |
| Lowest latency between HPC nodes | **Cluster placement group** + **EFA** |
| Cut DynamoDB read latency to microseconds | **DAX** |
| Single-digit ms for users in a metro without a Region | **Local Zone** |
| Data must stay on premises, AWS APIs and managed services required | **Outposts** |
| Small branch sites need AWS-managed local compute | **Outposts servers** |
| Containers on existing on-prem servers, AWS control plane | **ECS Anywhere** |
| Kubernetes on existing on-prem servers, AWS-managed control plane | **EKS Hybrid Nodes** |
| Kubernetes at disconnected or air-gapped sites | **EKS Anywhere** |
| One Kubernetes cluster that bursts from on-prem to the Region | **EKS Hybrid Nodes** + cloud node groups |

## Common exam scenarios
- **Global users see slow downloads of static assets from an S3 bucket in one Region** → CloudFront with OAC; S3 Transfer Acceleration helps uploads, not cached reads.
- **Online multiplayer game uses UDP and needs fastest Regional failover** → Global Accelerator; CloudFront does not carry UDP, and Route 53 failover waits on DNS TTLs.
- **Partner firewall allows only fixed IPs, app runs behind ALBs in two Regions** → Global Accelerator in front of both ALBs; traffic dials for maintenance.
- **Cache hit ratio is low after adding user cookies to forwarding** → remove cookies from the cache policy; forward them with an origin request policy only to behaviors that need them.
- **Origin is overwhelmed by cache misses from edge locations on several continents** → enable Origin Shield in the Region closest to the origin.
- **Website deploys several times a day and users get stale JavaScript** → versioned/hashed file names; invalidations cost money past the free tier and take time.
- **Premium video library must be accessible only to paying users, many files per title** → CloudFront signed cookies with a trusted key group.
- **Attackers bypass CloudFront and hit the ALB directly** → CloudFront-only prefix list on the ALB security group plus a secret custom header checked by a listener rule, or move to a VPC origin; add WAF on the distribution.
- **Custom domain on CloudFront fails to find the ACM certificate created in eu-west-1** → request or import the certificate in **us-east-1**.
- **Authenticate requests at the edge by calling a third-party IdP** → Lambda@Edge viewer request; CloudFront Functions cannot make network calls.
- **Primary S3 origin outage must not break downloads** → origin group with a replicated secondary bucket; failover covers GET/HEAD/OPTIONS only, so writes need another design.
- **SaaS provider must expose an API to hundreds of customer VPCs with overlapping CIDRs** → NLB-backed PrivateLink endpoint service, not VPC peering or Transit Gateway.
- **Weather simulation needs lowest inter-node latency and MPI** → cluster placement group in one AZ with EFA-enabled instances.
- **Kafka cluster must survive rack failures with replicas on separate hardware** → partition placement group; spread is capped at 7 instances per AZ.
- **Scale-out takes 10 minutes because of application initialization** → Auto Scaling warm pool (stopped or hibernated instances), plus predictive scaling for known peaks.
- **T3 instances throttle or bill high surplus credits under steady load** → move to M or C family; burstable instances suit spiky, low-average CPU.
- **Hospital must process imaging data on site for regulatory reasons but wants AWS APIs and managed databases** → Outposts rack with EBS/S3 on Outposts and RDS on Outposts; plan a resilient service link.
- **Company has recently refreshed on-prem servers and wants to run batch containers on them, managed from the same ECS console as the cloud** → ECS Anywhere with the `EXTERNAL` launch type; no new hardware to buy.
- **ECS Anywhere web service needs a load balancer in front of on-prem tasks** → ECS Anywhere has no service load balancing; use EKS Hybrid Nodes, a self-managed on-prem load balancer, or move the tier to the Region.
- **Platform team wants Kubernetes on on-prem VMs without operating etcd and the API server** → EKS Hybrid Nodes over DX/VPN; AWS manages the control plane.
- **Mining sites run Kubernetes with no reliable connectivity, sometimes air-gapped** → EKS Anywhere on local infrastructure; Hybrid Nodes, ECS Anywhere, and Outposts all depend on the Region link.
- **Retailer needs small AWS-managed compute in 300 stores for point-of-sale processing** → Outposts servers (instance store only; design for local data loss).
- **Media studio in a city without an AWS Region needs single-digit ms rendering workstations and storage** → Local Zone subnet in the existing VPC, DX to the studio.
- **Kubernetes workloads on-prem must burst to AWS during month-end peaks under one cluster** → EKS Hybrid Nodes plus managed node groups or Fargate in the Region.
