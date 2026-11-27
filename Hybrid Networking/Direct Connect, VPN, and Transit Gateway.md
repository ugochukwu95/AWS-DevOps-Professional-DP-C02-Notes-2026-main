# Direct Connect, VPN, and Transit Gateway

These three services form the backbone of most SAP-C03 hybrid designs (Skill 1.3.1, hybrid connectivity with redundancy and failover): **Direct Connect** for private, consistent bandwidth; **Site-to-Site VPN** for fast, encrypted, internet-based connectivity or backup; **Transit Gateway** as the Regional hub that ties VPCs, VPNs, and DX together.

## Direct Connect connection types
| | Dedicated connection | Hosted connection |
| --- | --- | --- |
| Ordered from | AWS (physical port at a DX location) | AWS Direct Connect **Partner** |
| Speeds | 1, 10, 100, 400 Gbps | Sub-1 Gbps (from 50 Mbps) up to 10 Gbps, partner-dependent |
| Virtual interfaces | Multiple VIFs per connection | **One VIF** per hosted connection |
| LAG / MACsec | Supported (MACsec on selected high-speed ports) | Not supported |

**Lead time**: new DX connections typically take **weeks** (LOA-CFA, cross-connect, partner circuit). If the question needs connectivity **immediately**, start with **Site-to-Site VPN** and migrate to DX later.

## Virtual interfaces (VIFs)
| VIF | Reaches | Attach to |
| --- | --- | --- |
| **Private VIF** | VPC private IPs | VGW, or **Direct Connect gateway** → VGWs |
| **Public VIF** | AWS public endpoints (S3, DynamoDB, public service IPs) in all Regions | Public AWS network—not the internet |
| **Transit VIF** | Many VPCs via Transit Gateway | **Direct Connect gateway** → TGW |

- **Direct Connect gateway (DXGW)**: global object; one private/transit VIF can reach VGWs or TGWs in **any Region** (except China). It does **not** route between the VPCs attached to it.
- **BGP** is mandatory on every VIF. Influence path selection with **AS_PATH prepending**, **local preference communities**, and more-specific prefixes.
- Private VIF accepts at most **100 prefixes** advertised from on-premises; exceeding it puts the BGP session down. Summarise routes.

**Exam tip**: "Single DX connection must reach VPCs in several Regions" → **DXGW**. "Many VPCs behind TGW over DX" → **transit VIF** to DXGW associated with the TGW.

## LAG and MACsec
- **Link aggregation group (LAG)**: bundles multiple **dedicated** connections of the **same speed** at the **same DX location** into one logical link (LACP). Set *minimum links* to fail the LAG if too few members are up. LAG adds bandwidth, not location resilience.
- **MACsec**: IEEE 802.1AE Layer 2 encryption between your router and the AWS DX device, on supported dedicated high-speed connections.

## Encryption over Direct Connect
DX is private but **not encrypted** by default.

| Option | How |
| --- | --- |
| **MACsec** | Layer 2, line-rate, dedicated connections only |
| **VPN over public VIF** | IPsec Site-to-Site VPN to the public VPN endpoints, carried over the public VIF |
| **Private IP VPN** | IPsec VPN using **private IP** addresses over a **transit VIF** to a **TGW**—no public IPs needed |

## Resiliency models
| Model | Design | Use |
| --- | --- | --- |
| **Maximum resiliency** | 2 DX locations × 2 connections on separate devices (4 connections) | Critical workloads; highest SLA (99.99%) |
| **High resiliency** | 1 connection at each of **2 DX locations** | Critical workloads (99.9% SLA) |
| **Development and test** | 2 connections on separate devices at **1** location | Non-critical; no location resilience |
| **DX + VPN backup** | DX primary, Site-to-Site VPN as failover | **Cost-effective** resilience when a second DX is too expensive |

**Exam tip**: For DX primary + VPN backup to the same VGW/TGW, AWS prefers the DX path for the same prefix. Make sure the VPN advertises the same (not more specific) prefixes, otherwise traffic goes over VPN.

## Site-to-Site VPN
- Each VPN connection has **two IPsec tunnels** terminating in different AZs; each tunnel supports up to roughly **1.25 Gbps**.
- Terminates on a **virtual private gateway (VGW)** (one VPC) or a **Transit Gateway** (many VPCs).
- **BGP (dynamic)** gives automatic failover and is required for ECMP; **static** routing for devices without BGP.
- **IPv6**: IPv6 inside the tunnels and IPv6 **outer** tunnel IPs are supported only on **TGW or Cloud WAN**, not a VGW. One connection carries IPv4 *or* IPv6 inner traffic, not both—see `IPv6 and dual-stack migration.md`.

| | VGW | Transit Gateway |
| --- | --- | --- |
| VPCs reachable | One | Many |
| **ECMP** across tunnels/connections | No (active/passive) | **Yes** with BGP—aggregate bandwidth beyond one tunnel |
| **Accelerated VPN** (Global Accelerator edge) | No | **Yes** |

**Exam tip**: "Need more than ~1.25 Gbps over VPN" → multiple VPN connections to a **TGW with ECMP** and BGP. "Unreliable internet path from a distant branch" → **accelerated Site-to-Site VPN** (TGW only).

## Transit Gateway
- Regional hub; attachments: **VPC, VPN, DXGW, TGW peering, Connect**, and (newer) Network Firewall.
- **Route tables**: each attachment is **associated** with exactly one TGW route table (which table it uses for lookups) and can **propagate** its routes into one or more tables.
- **Segmentation**: separate route tables (for example *prod*, *dev*, *shared services*) so prod and dev can both reach shared services but not each other.
- **Blackhole routes** explicitly drop traffic to a CIDR.
- **Inter-Region peering**: TGW-to-TGW across Regions on the AWS backbone, encrypted; uses **static routes only** (no propagation).
- **Connect attachment**: **GRE tunnel + BGP** over a VPC or DX transport attachment for **SD-WAN** appliances—higher bandwidth than IPsec and dynamic routing.
- **Appliance mode**: on the inspection VPC attachment, keeps both directions of a flow on the **same AZ** appliance—required for **stateful** firewalls.
- **Multicast**: supported natively (IGMP or static group membership)—VPC itself does not support multicast otherwise.
- Sharing: share the TGW to other accounts via **RAM**.

## AWS Cloud WAN
Managed global WAN built on Network Manager and **newly in scope for SAP-C03**. A JSON **core network policy** defines the whole network; AWS deploys a **core network edge (CNE)** in each Region you list and routes between them dynamically over the AWS backbone.

| Concept | What it does |
| --- | --- |
| **Core network policy** | Versioned JSON document: Regions (edge locations), segments, attachment policies, segment actions; change sets are reviewed then applied |
| **Segment** | Global isolated routing domain (for example *prod*, *dev*, *shared*)—like a TGW route table that spans every Region |
| **Attachment policy** | Maps attachments to segments automatically from **tags** (for example `segment=prod`), optionally requiring acceptance |
| **Segment actions** | **Share** routes between segments (shared services), add static routes, or **send-via / send-to** traffic through an inspection VPC (**service insertion** with network function groups) |
| **Attachments** | VPC, Site-to-Site VPN, Connect (SD-WAN, GRE/BGP), Direct Connect gateway, and **TGW route table** attachments via TGW peering |

| | Transit Gateway (+ peering) | Cloud WAN |
| --- | --- | --- |
| Scope | Regional hub; you peer hubs | One global network |
| Inter-Region routing | **Static routes** on peering attachments | **Dynamic**, automatic between CNEs |
| Segmentation | Route tables per TGW, kept consistent by you | Segments defined once in policy, global |
| Onboarding a VPC | Attach, associate, propagate per TGW | Tag the attachment; policy places it |
| Best for | One or a few Regions, fine-grained control | Many Regions, many accounts, central policy, SD-WAN integration |

**Exam tip**: "Global network across many Regions, consistent segmentation, **least operational overhead**, new VPCs join by tagging" → **Cloud WAN**. Existing TGWs do not need to be replaced: **peer the TGWs to Cloud WAN** and migrate gradually. Cloud WAN still uses non-overlapping CIDRs—overlap remains a PrivateLink / private NAT problem.

## Centralized egress and inspection
```text
Spoke VPCs ──► TGW (spoke RT: 0.0.0.0/0 → inspection) ──► Inspection VPC
                                                     (GWLB endpoint / Network Firewall endpoint, appliance mode)
                                                              │
                                                     Egress VPC: NAT GW ──► IGW ──► internet
```
- **Centralized egress**: one egress VPC with NAT gateways per AZ; spokes default-route to TGW. Saves NAT gateway cost across many VPCs, but adds TGW data processing charges.
- **AWS Network Firewall**: managed stateful firewall (Suricata-compatible rules, domain allow/deny lists); deploy endpoints per AZ; manage across accounts with **Firewall Manager**.
- **Gateway Load Balancer (GWLB)**: Layer 3 load balancer for **third-party virtual appliances**, using **GENEVE (port 6081)**; GWLB endpoints are route targets.

**Exam tip**: "Use existing third-party firewall appliances, scale transparently" → **GWLB**. "Managed AWS-native firewall with least operational overhead" → **Network Firewall**. Forgetting **appliance mode** causes asymmetric routing and dropped flows.
