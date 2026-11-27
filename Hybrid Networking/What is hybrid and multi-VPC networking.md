# What is hybrid and multi-VPC networking?

Hybrid networking connects **on-premises networks** to AWS; multi-VPC networking connects **many VPCs across accounts and Regions** to each other. SAP-C03 questions rarely ask "what is a VPC"—they give four connectivity designs and ask which one meets a constraint such as **least operational overhead**, **overlapping CIDRs**, **transitive routing**, or **lowest cost**. Knowing the limits of each option is what eliminates distractors.

**SAP-C03 mapping**: Domain 1 (Architecture Design and Implementation Built for the Cloud)—Task 1.3 *Design hybrid cloud integration patterns* and Task 1.4 *Design network architectures* (multi-VPC connectivity, subnet strategy, IPAM, network segmentation). Network cost trade-offs (TGW vs peering vs PrivateLink pricing) also appear in Domain 3, Task 3.2.

## VPC building blocks recap
| Component | What it does | Exam-relevant detail |
| --- | --- | --- |
| **Subnet** | Slice of the VPC CIDR in **one AZ** | Public = route to IGW; private = no route to IGW |
| **Route table** | Longest-prefix-match routing per subnet | One route table per subnet; many subnets per table |
| **Internet gateway (IGW)** | Bidirectional internet access | Horizontally scaled, no bandwidth limit to manage |
| **NAT gateway** | Outbound-only IPv4 internet for private subnets | **Zonal**—deploy one per AZ for resilience; charged per hour + per GB |
| **Egress-only IGW** | Outbound-only **IPv6** | IPv6 addresses are public, so NAT is not used for IPv6 (see `IPv6 and dual-stack migration.md`) |
| **Gateway endpoint** | Private route to **S3 and DynamoDB** only | **Free**; added as a route table entry; **not reachable from on-premises or peered VPCs** |
| **Interface endpoint (PrivateLink)** | ENI with private IP for an AWS or partner service | Charged per hour per AZ + per GB; **reachable over DX/VPN and peering** |

**Exam tip**: "On-premises servers must reach S3 privately over Direct Connect" → **S3 interface endpoint** (or a public VIF). A gateway endpoint cannot be used from outside the VPC.

**Exam tip**: "Reduce NAT gateway data processing charges for S3/DynamoDB traffic" → add **gateway endpoints**; they are free.

## Connectivity options overview
| Option | Connects | Transitive? | Overlapping CIDRs? | Notes |
| --- | --- | --- | --- | --- |
| **VPC peering** | VPC ↔ VPC (same/cross account, cross-Region) | **No** | **No** | No bandwidth charge within an AZ; full mesh grows as n(n-1)/2 |
| **Transit Gateway (TGW)** | Hub for VPCs, VPNs, DX, peered TGWs | **Yes** | No (routing conflicts) | Regional hub; per-attachment + per-GB charges |
| **PrivateLink** | Consumer VPC → one service behind NLB/GWLB | N/A (service exposure) | **Yes** | Unidirectional; consumer initiates only |
| **Cloud WAN** | Global network of VPCs, VPNs, DX, SD-WAN | Yes | No | Policy-driven, multi-Region managed TGW |
| **Site-to-Site VPN** | On-prem ↔ VGW or TGW | Via TGW | No | IPsec over internet; 2 tunnels per connection |
| **Client VPN** | Individual users ↔ VPC | Via routes | No | Managed OpenVPN-based remote access |
| **Direct Connect (DX)** | On-prem ↔ AWS over private circuit | Via DXGW + TGW | No | Consistent latency; weeks to provision |

**Exam tip**: VPC peering has **no edge-to-edge routing**—a peered VPC cannot use your IGW, NAT gateway, VPN, or DX. If the question needs shared egress or shared hybrid connectivity, the answer is **Transit Gateway**, not peering.

**Peering vs Transit Gateway**: peering is cheapest and has no extra hop for a **small number** of VPCs. Once you need many VPCs, transitive routing, or centralised inspection/egress, choose TGW.

## VPC sharing (AWS RAM)
The **VPC owner** shares **subnets** with other accounts in the **same AWS Organization** using **AWS Resource Access Manager (RAM)**.
- **Participants** launch resources (EC2, RDS, Lambda) into shared subnets but **cannot modify** the VPC, subnets, route tables, or NACLs.
- Each account still owns and is billed for its own resources; the owner pays for VPC-level items like NAT gateways.
- Reduces the number of VPCs, TGW attachments, and IP space consumed.
- Default VPC subnets cannot be shared.

**Exam tip**: "Many application teams need separate accounts but should share one centrally managed network with **least operational overhead** and fewest TGW attachments" → **VPC sharing** via RAM.

## Overlapping CIDRs
Overlapping address space breaks peering and TGW routing. Options:

| Approach | How it works | When to choose |
| --- | --- | --- |
| **PrivateLink** | Provider puts service behind **NLB**; consumer gets an interface endpoint with a local IP | Only specific services need to be exposed; unidirectional |
| **Private NAT gateway** | Workloads in the overlapping range are translated to the private NAT gateway's IP in a **non-overlapping (routable) subnet**, then routed via TGW/VGW | Full network-level connectivity needed from overlapping VPCs |
| **Re-IP** | Renumber one network | Long-term fix; usually highest effort |

```text
VPC A (10.0.0.0/16 overlapping) ── workload subnet
        │
        └─ routable secondary CIDR 100.64.x.x ── private NAT GW ── TGW ── on-prem / other VPCs
```

**Exam tip**: A private NAT gateway **cannot** be used with an IGW—it is for private-to-private translation. Combine it with a **secondary CIDR** that is routable across the network.

## Amazon VPC IP Address Manager (IPAM)
- Central plan, allocate, track, and audit IP addresses across accounts and Regions, integrated with **AWS Organizations**.
- Build hierarchical **pools** (top-level → Regional → environment); share pools via RAM so teams create VPCs that draw non-overlapping CIDRs automatically.
- Monitors utilisation and flags **overlapping** or non-compliant CIDRs.
- Also manages BYOIP and public IPv4 insights.

**Exam tip**: "Prevent teams from creating VPCs with overlapping CIDRs across the organization" → **IPAM pools** with allocation rules (optionally enforced with SCPs requiring IPAM-allocated CIDRs).

## Where the other Task 1.3 / 1.4 skills live
| Skill | Covered in |
| --- | --- |
| 1.3.1 Hybrid connectivity with redundancy and failover | `Direct Connect, VPN, and Transit Gateway.md` |
| 1.3.2 Hybrid data synchronization (DataSync, Storage Gateway, Transfer Family) | `Migration and Modernization/Data transfer - DataSync, Transfer Family, Storage Gateway, and Data Transfer Terminal.md` |
| 1.3.3 Legacy integration with data transformations (API Gateway, Lambda, Amazon MQ) | `Migration and Modernization/Modernization and exam scenarios.md` |
| 1.3.4 Hybrid DNS (Resolver endpoints, PHZ, split-horizon, conditional forwarding) | `Route 53, hybrid DNS, and exam scenarios.md` |
| 1.3.5 Hybrid compute (ECS/EKS Anywhere, Outposts, Local Zones) | `Edge and Performance/Hybrid compute, Outposts, Local Zones, and exam scenarios.md` |
| 1.4.4 IPv6 adoption and dual-stack migration | `IPv6 and dual-stack migration.md` |
| 1.4.5 Global traffic routing (Route 53 policies, Global Accelerator) | `Route 53, hybrid DNS, and exam scenarios.md`, `Edge and Performance/CloudFront and Global Accelerator.md` |

**Exam tip** (Skill 1.3.3): an on-premises system that speaks **AMQP, MQTT, OpenWire, or STOMP** moves to **Amazon MQ** with no code change; a legacy SOAP/XML or fixed-format interface is wrapped with **API Gateway** (mapping templates) or **Lambda** transforms so new consumers get a REST/JSON API while the backend stays untouched.

## Choose the right approach
| Requirement | Answer |
| --- | --- |
| Connect 2–3 VPCs cheaply, no transitive need | **VPC peering** |
| Connect dozens of VPCs and on-prem with central routing | **Transit Gateway** |
| Expose one service to many consumer VPCs with overlapping CIDRs | **PrivateLink** (NLB + endpoint service) |
| Global multi-Region network managed by policy | **Cloud WAN** |
| Many accounts, one central network team, fewest VPCs | **VPC sharing** via RAM |
| Private S3 access from in-VPC workloads at no charge | **Gateway endpoint** |
| Private S3 access from on-premises | **S3 interface endpoint** over DX/VPN |
| Overlapping VPCs need two-way routed access | **Private NAT gateway** + routable secondary CIDR |
| Remote employees need VPC access | **Client VPN** |
| Organization-wide IP planning and overlap detection | **VPC IPAM** |
