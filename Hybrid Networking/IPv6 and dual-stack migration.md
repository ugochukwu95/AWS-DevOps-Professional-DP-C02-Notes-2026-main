# IPv6 and dual-stack migration

SAP-C03 Skill 1.4.4 asks you to **design IPv6 adoption and dual-stack migration strategies**. Questions describe a constraint—private IPv4 space is exhausted, the public IPv4 bill is growing, a regulator mandates IPv6, or EKS pods run out of IPs—and ask which combination of dual-stack, IPv6-only, egress-only IGW, and DNS64/NAT64 solves it with the least disruption.

## Why IPv6
| Driver | Detail |
| --- | --- |
| **IPv4 exhaustion** | Private RFC 1918 space runs out in large multi-account estates and EKS clusters; overlapping CIDRs block connectivity |
| **Public IPv4 cost** | Since **1 February 2024** AWS charges **$0.005 per hour** for **every public IPv4 address**, in use or idle (EC2, RDS, EKS nodes, NAT gateways, load balancers, Global Accelerator, Site-to-Site VPN tunnels). BYOIP addresses are not charged |
| **Mandates** | Government and telecom IPv6-only requirements |
| **Simpler addressing** | Globally unique addresses, no NAT, no overlap between VPCs |

**Exam tip**: "Find and reduce public IPv4 spend" → **IPAM Public IP Insights** / Cost and Usage Report to locate addresses, then move internet-facing entry points to **dual-stack** and private workloads behind IPv6 or shared NAT.

## VPC addressing models
| | IPv4-only | **Dual-stack** | **IPv6-only subnet** |
| --- | --- | --- | --- |
| VPC CIDRs | IPv4 | IPv4 + IPv6 (Amazon-provided **/56**, IPAM pool, or BYOIPv6) | Same dual-stack VPC—a VPC always keeps an IPv4 CIDR |
| Subnet | IPv4 | IPv4 + IPv6 **/64** | IPv6 /64 only, no IPv4 |
| Instances | Any | Any | **Nitro-based** only |
| Reaching IPv4-only services | Direct / NAT | Native IPv4 | **DNS64 + NAT64** |
| Use when | Legacy | **Default migration step** | IPv4 exhaustion, greenfield, cost |

## Internet access for IPv6
| Need | IPv4 | IPv6 |
| --- | --- | --- |
| Inbound and outbound | IGW, route `0.0.0.0/0` | IGW, route `::/0` |
| Outbound only | NAT gateway | **Egress-only internet gateway (EIGW)**—stateful, free to attach, no NAT |
| IPv6 host → IPv4-only destination | — | **DNS64** on the subnet + route `64:ff9b::/96` → **NAT gateway (NAT64)** |

- **DNS64** is a subnet attribute: Route 53 Resolver synthesizes an AAAA record by prefixing `64:ff9b::/96` to the IPv4 answer when no AAAA exists.
- **NAT64** is built into every NAT gateway (nothing to enable). It translates to IPv4 and forwards via IGW, VGW, or TGW—so it also reaches **IPv4-only on-premises** systems, with Resolver outbound endpoints using IPv4.
- IPv6 addresses are globally unique; "private" means **no inbound route** (EIGW) and security groups, not NAT.

**Exam tip**: "IPv6-only workloads must call an IPv4-only third-party API" → enable **DNS64** on the subnet, add `64:ff9b::/96` → **NAT gateway**, `::/0` → **EIGW**. An EIGW alone cannot reach IPv4.

## Security and visibility
- Security groups and NACLs treat IPv4 and IPv6 as **separate rules**: a rule for `0.0.0.0/0` does not cover `::/0`. Custom NACLs need explicit IPv6 allow rules (and ephemeral port ranges) for both directions.
- Route tables need `::/0` and on-prem IPv6 prefixes added explicitly.
- VPC Flow Logs, Network Firewall, WAF, and Security Hub controls handle IPv6—review allowlists, SIEM parsers, and log queries that assume IPv4 formats.

## Service support to know
| Service | IPv6 behaviour |
| --- | --- |
| **ALB / NLB** | `dualstack` IP address type adds AAAA records; ALB also offers **`dualstack-without-public-ipv4`** (IPv6-only from the internet, no public IPv4 charge). ALB built-in **Cognito/OIDC authentication needs public IPv4** to reach the IdP |
| **CloudFront** | IPv6 for viewers (per-distribution setting); **IPv6-only or dual-stack custom origins** (not S3 or VPC origins) for end-to-end IPv6 |
| **Global Accelerator** | **Dual-stack accelerators** add static IPv6 anycast addresses |
| **Route 53** | AAAA and alias AAAA records; Resolver endpoints can be IPv4, IPv6, or dual-stack |
| **Transit Gateway / Cloud WAN** | Route IPv6 between VPC, peering, DX, and VPN attachments; enable IPv6 on the VPC attachment subnets |
| **Direct Connect** | Add an **IPv6 BGP peer** to private, transit, or public VIFs (dual-stack VIF) |
| **Site-to-Site VPN** | IPv6 inner traffic and IPv6 outer tunnel IPs **only on TGW or Cloud WAN**, not VGW; one connection carries IPv4 *or* IPv6, so run separate connections; cannot convert an existing connection |
| **EKS** | **IPv6 cluster family** chosen **at creation and immutable**; pods and services get IPv6 only (pod IP exhaustion disappears), nodes stay dual-stack, Nitro/Fargate only, no Windows; AWS Load Balancer Controller in **IP mode** |
| **ECS** | Tasks in `awsvpc` mode get IPv6 in dual-stack subnets; IPv6-only subnets supported |

## IPAM and BYOIPv6
- **IPAM IPv6 pools**: allocate Amazon-provided or BYOIP IPv6 CIDRs to VPCs across the organization, with allocation rules and compliance monitoring—same model as IPv4 pools.
- **BYOIPv6**: bring your own IPv6 prefix and advertise it from AWS (keeps allowlisted addresses during migration); provision into IPAM, then allocate per Region.
- Plan the hierarchy: one /56 per VPC, /64 per subnet, Regional pools sized for growth.

## Migration phases
```text
1. Plan       IPAM IPv6 pools, inventory IPv4-only dependencies, update SG/NACL/firewall policies
2. Edge       Dual-stack CloudFront / Global Accelerator / ALB / NLB, AAAA records (clients see IPv6 first)
3. Network    IPv6 CIDRs on VPCs and subnets, ::/0 → EIGW, TGW / DX / VPN IPv6 routing
4. Workloads  Dual-stack instances, containers, databases; fix hard-coded IPv4 in apps and logs
5. IPv6-only  New subnets and EKS clusters IPv6-only with DNS64/NAT64 for IPv4 stragglers
6. Retire     Release public IPv4 (dualstack-without-public-ipv4 ALB, IPv6 VPN outer IPs)
```

**Exam tip**: Migrate **outside-in**: make the edge dual-stack first (no client or backend change), then the network, then workloads. A "big bang" switch to IPv6-only breaks IPv4-only dependencies.

## Gotchas
- A VPC cannot be IPv6-only—an IPv4 CIDR is always required, even if every subnet is IPv6-only.
- An existing EKS IPv4 cluster cannot switch to IPv6—create a new cluster and migrate workloads (blue/green).
- Some AWS service endpoints and third-party dependencies are still IPv4-only—check before choosing IPv6-only subnets; DNS64/NAT64 bridges the gap but NAT gateway data processing charges apply.
- Interface endpoints have their own IP address type (IPv4, dual-stack, IPv6)—set dual-stack or IPv6 for IPv6 clients, and the service must support it.

## Choose the right approach
| Requirement | Answer |
| --- | --- |
| Start IPv6 adoption with no app change | **Dual-stack** load balancers / CloudFront / Global Accelerator at the edge |
| Outbound-only internet for IPv6 instances | **Egress-only IGW** |
| IPv6-only workloads reach IPv4-only services | **DNS64** + **NAT64** (NAT gateway) |
| EKS cluster running out of pod IPs | New **IPv6 EKS cluster** (immutable choice) |
| Cut public IPv4 charges on an internet ALB | **`dualstack-without-public-ipv4`** ALB (or IPv6 origin behind CloudFront) |
| End-to-end IPv6 through the CDN | CloudFront with **IPv6 / dual-stack custom origin** |
| Keep corporate IPv6 addresses partners allowlist | **BYOIPv6** via IPAM |
| Org-wide IPv6 CIDR governance | **IPAM IPv6 pools** shared via RAM |
| IPv6 between on-prem and many VPCs | **TGW** or **Cloud WAN** + IPv6 BGP on DX VIF or IPv6 VPN |

## Common exam scenarios
- **Monthly bill shows thousands of dollars of public IPv4 charges for EC2 instances behind ALBs** → remove instance public IPs, use private subnets with NAT or IPv6 + EIGW; consider dual-stack ALB without public IPv4.
- **IPv6-only containers fail to call a partner's IPv4-only API** → DNS64 on the subnet, `64:ff9b::/96` route to a NAT gateway.
- **Private IPv6 instances must download patches but never accept inbound connections** → egress-only IGW; a NAT gateway is not used for IPv6-to-IPv6.
- **After adding IPv6, clients connect but traffic is dropped** → security group and NACL rules only allow `0.0.0.0/0`; add `::/0` / IPv6 prefixes.
- **EKS pods exhaust the 10.0.0.0/16 range** → IPv6 cluster for new workloads (cannot convert the old one); custom networking with 100.64.0.0/10 is the IPv4 alternative.
- **Branch office needs IPv6 over VPN to a single VPC on a VGW** → move the VPN to a Transit Gateway; VGW does not support IPv6 VPN.
- **Regulator mandates IPv6 for public endpoints with minimal change** → dual-stack CloudFront / ALB and AAAA alias records in Route 53.
- **ALB using Cognito authentication breaks after switching to dualstack-without-public-ipv4** → ALB authentication needs public IPv4 to reach the IdP; keep `dualstack`.
