# Route 53, hybrid DNS, and exam scenarios

Route 53 is AWS's global DNS service: public and private hosted zones, health-checked routing policies, and **Route 53 Resolver** for hybrid DNS between VPCs and on-premises. For SAP-C03 this maps to Skill 1.3.4 (DNS for hybrid environments: Resolver endpoints, private hosted zones, **split-horizon DNS**, **conditional forwarding**) and Skill 1.4.5 (global traffic routing with Route 53 routing policies). This file ends with the folder-wide decision table and exam scenarios.

## Routing policies
| Policy | Behaviour | Typical use |
| --- | --- | --- |
| **Simple** | One record, optionally multiple values returned in random order; no health checks | Single resource |
| **Weighted** | Split traffic by relative weight | Canary / blue-green, A/B testing |
| **Latency** | Route to Region with lowest measured latency for the user | Multi-Region active-active performance |
| **Failover** | Primary/secondary based on health check | Active-passive DR |
| **Geolocation** | Route by user's continent/country/state; needs a **default** record | Compliance, content localisation |
| **Geoproximity** | Route by distance with a **bias** to grow/shrink regions | Shift load between Regions by geography |
| **Multivalue answer** | Up to **8** healthy records returned | Simple client-side load balancing with health checks (not a load balancer) |
| **IP-based** | Route by client source **CIDR collections** | Route known ISP/corporate ranges to specific endpoints |

**Exam tip**: **Geolocation** answers "users in Germany must only be served from eu-central-1" (compliance). **Latency** answers "best performance". Do not swap them.

## Health checks
- **Endpoint** checks: HTTP/HTTPS/TCP from global health checkers; healthy when more than **18%** of checkers report healthy. String matching available for HTTP/HTTPS.
- **Calculated** checks: combine child health checks with AND/OR/at-least-N logic.
- **CloudWatch alarm-based** checks: health follows a CloudWatch alarm—use for **private resources** (health checkers are on the internet and cannot reach private IPs) or for custom metrics.
- **Evaluate target health** on alias records lets Route 53 use ELB health without a separate check.

## Alias records
- Route 53-specific extension pointing to AWS resources: ELB, CloudFront, API Gateway, S3 website, Global Accelerator, VPC interface endpoints, another record in the same zone.
- Works at the **zone apex** (CNAME cannot); queries to AWS alias targets are **free**; TTL is inherited from the target.
- Cannot alias to an EC2 instance public DNS name.

## Private hosted zones (PHZ)
- Resolve only inside associated VPCs; VPC must have **enableDnsSupport** and **enableDnsHostnames** on.
- **Cross-account association**: the PHZ-owning account creates an **association authorization** (CLI/SDK/API, not the console), the VPC-owning account **associates** the VPC, then the authorization can be deleted.
- **Route 53 Profiles** let you bundle PHZ associations, Resolver rules, and DNS Firewall rule groups and share them via RAM to many VPCs/accounts.

## Route 53 Resolver (hybrid DNS)
Every VPC has the Resolver at the **VPC base CIDR + 2**. It cannot be queried directly from on-premises—use endpoints.

```text
On-prem DNS ──conditional forward aws.corp──► Inbound endpoint (ENIs in VPC) ──► PHZ / VPC DNS
VPC workloads ──► Resolver ──forwarding rule corp.local──► Outbound endpoint ──► On-prem DNS
```
| Component | Direction | Notes |
| --- | --- | --- |
| **Inbound endpoint** | On-prem → AWS | ENIs (at least 2 AZs) that on-prem DNS forwards to |
| **Outbound endpoint** | AWS → on-prem | Used by **forwarding rules** |
| **Forwarding rules** | Domain → target IPs | Share via **RAM** to other accounts; associate with their VPCs |

**Exam tip**: Centralise endpoints in a **shared services / networking account**, share rules via RAM. Spoke VPCs need only the rule association, not their own endpoints.

### Conditional forwarding in both directions
| Side | Mechanism | Points at |
| --- | --- | --- |
| On-prem → AWS | **Conditional forwarder** on the on-prem DNS server (AD DNS, BIND, Infoblox) for the AWS domain, for example `aws.example.com` | **Inbound endpoint** IPs (at least 2, in different AZs) |
| AWS → on-prem | Resolver **forwarding rule** for the on-prem domain, for example `corp.example.com` | On-prem DNS server IPs, sent from the **outbound endpoint** |
| Carve-out | Resolver **system rule** for a subdomain, for example `aws.corp.example.com` | Resolve locally (PHZ) even though the parent domain is forwarded |

- Resolver picks the **most specific** matching domain. When a forwarding rule and a PHZ match the same name, the **forwarding rule wins**.
- Endpoints are reached over **DX or VPN**; inbound/outbound endpoint security groups must allow **TCP and UDP 53**.
- Do not point on-prem forwarders at the VPC `.2` resolver—it only answers queries from inside the VPC.

### Split-horizon DNS
The **same domain name** returns different answers depending on where the query comes from.

```text
example.com  public hosted zone   app.example.com → CloudFront / public ALB   (internet users)
example.com  private hosted zone  app.example.com → internal ALB 10.0.x.x     (associated VPCs + on-prem via inbound endpoint)
```
- Inside associated VPCs the **PHZ takes precedence**. By default, if a name is **missing from the PHZ**, Resolver returns **NXDOMAIN**—it does **not** retry public DNS. Either duplicate the public records internal clients still need, or enable the newer **public DNS fallback** setting on the PHZ.
- On-prem clients see the private view only if their forwarder sends the domain to the **inbound endpoint**; otherwise they get the public answer.
- Typical uses: internal users reach the app over DX on private IPs while internet users go through CloudFront; same name for internal and external API endpoints.

**Exam tip**: "Internal users must resolve `app.example.com` to private IPs, external users to the public endpoint, same name" → **split-horizon**: public hosted zone + private hosted zone with the same name, plus an inbound endpoint and conditional forwarder for on-prem clients.

## DNS Firewall
Filters outbound DNS queries from VPCs through the Resolver using **domain lists** (custom or AWS managed threat lists) with ALLOW, BLOCK, or ALERT actions. Configure **fail-open vs fail-closed** (availability vs security). Deploy across the organization with **Firewall Manager**. Stops DNS-based exfiltration that security groups cannot see.

## Route 53 Application Recovery Controller (ARC)
- **Routing controls**: highly available on/off switches (backed by health checks) to fail over traffic between Regions/cells, operated through a multi-Region data plane cluster.
- **Readiness checks**: verify the standby replica has matching capacity and config.
- **Zonal shift / zonal autoshift**: move traffic away from an impaired AZ for supported load balancers.

Choose ARC when the question demands **controlled, reliable failover** that does not depend on the impaired Region's control plane.

## Choose the right approach
| Requirement | Answer |
| --- | --- |
| Connectivity today, DX not yet available | **Site-to-Site VPN**, migrate to DX later |
| Consistent latency, high bandwidth to AWS | **Direct Connect** |
| Highest DX resilience for critical workload | **Maximum resiliency**: 2 locations × 2 connections |
| Cost-effective DX failover | **DX + Site-to-Site VPN backup** |
| Encrypt traffic over DX at line rate | **MACsec** (dedicated) |
| Encrypt over DX without public IPs | **Private IP VPN** over transit VIF to TGW |
| One DX reaching VPCs in multiple Regions | **Direct Connect gateway** |
| Hundreds of VPCs + on-prem, transitive routing | **Transit Gateway** (+ transit VIF) |
| Isolate prod from dev but share services | **TGW route tables** (associations/propagations) |
| VPN throughput beyond one tunnel | **TGW + ECMP** with BGP |
| SD-WAN appliances integrate with AWS | **TGW Connect** (GRE + BGP) |
| Multi-Region global network, least overhead | **Cloud WAN** (segments + tag-based attachment policies) |
| Insert inspection between Cloud WAN segments | **Cloud WAN service insertion** (send-via / send-to) |
| Centralised inspection with third-party firewalls | **GWLB** in inspection VPC + TGW appliance mode |
| Managed central firewall with domain filtering | **AWS Network Firewall** |
| Expose service to VPCs with overlapping CIDRs | **PrivateLink** |
| On-prem resolves AWS private names | **Resolver inbound endpoint** |
| AWS resolves on-prem names | **Resolver outbound endpoint** + forwarding rules shared via RAM |
| Same name, private answer inside, public answer outside | **Split-horizon**: public + private hosted zone with the same name |
| Forward a parent domain but resolve one subdomain in AWS | Forwarding rule + **system rule** for the subdomain |
| Stop paying for public IPv4, IPv6-only workloads reach IPv4 services | **DNS64** on the subnet + **NAT64** on NAT gateway |
| Health-check a private resource | **CloudWatch alarm-based** health check |
| Block DNS queries to malicious domains | **Route 53 Resolver DNS Firewall** |
| Reliable Region failover independent of control plane | **Route 53 ARC** routing controls |

## Common exam scenarios
- **Company needs AWS connectivity within days while DX is ordered** → Site-to-Site VPN now; DX takes weeks; keep VPN as backup afterwards.
- **Single DX connection is a single point of failure, budget is tight** → add Site-to-Site VPN as backup rather than a second DX.
- **Mission-critical workload requires 99.99% DX availability** → maximum resiliency model across two DX locations with separate devices.
- **50 VPCs in full-mesh peering are hard to manage** → replace with Transit Gateway; peering is non-transitive and grows quadratically.
- **Peered VPC cannot use the NAT gateway in the other VPC** → peering has no edge-to-edge routing; use TGW with centralised egress.
- **Spoke VPC traffic to the inspection firewall is dropped intermittently** → enable **appliance mode** on the TGW inspection VPC attachment.
- **Prod and dev VPCs on one TGW must not talk, both need shared services** → separate TGW route tables; propagate shared services into both, not prod into dev.
- **TGWs in two Regions need connectivity** → TGW inter-Region peering with **static routes**; or Cloud WAN for dynamic multi-Region routing.
- **Company in 12 Regions wants prod/dev isolation everywhere and new VPCs to join automatically** → Cloud WAN core network policy with segments and tag-based attachment policies; peer existing TGWs during migration.
- **SaaS provider must serve customers whose CIDRs overlap with each other** → PrivateLink endpoint service behind NLB.
- **Acquired company's VPC overlaps the corporate range and needs routed access** → private NAT gateway with routable secondary CIDR, via TGW.
- **On-prem apps must resolve names in a private hosted zone** → Resolver inbound endpoint; on-prem DNS conditional forwarder to its IPs.
- **EC2 in 30 accounts must resolve corp.example.com on-prem** → outbound endpoint in networking account; forwarding rule shared via RAM and associated with each VPC.
- **PHZ in account A must resolve from a VPC in account B** → create association authorization in A (CLI/API), associate VPC from B.
- **After adding a private hosted zone for example.com, VPC workloads can no longer resolve www.example.com** → by default the PHZ answers NXDOMAIN and does not retry public DNS; add the missing records to the PHZ (or enable public DNS fallback on the zone).
- **Employees on-prem and in AWS must reach app.example.com privately while customers use the public endpoint** → split-horizon (public + private hosted zones) with an inbound endpoint and on-prem conditional forwarder.
- **Failover record never fails over for an EC2 app in a private subnet** → endpoint health checkers cannot reach private IPs; use CloudWatch alarm-based health check.
- **Serve EU users only from EU Regions for data residency** → geolocation routing with a default record.
- **Route a slowly growing share of traffic to a new stack** → weighted routing.
- **Access S3 from on-premises over DX without traversing the internet** → public VIF, or S3 interface endpoint over private/transit VIF.
- **Remote branch VPN performance is poor over long internet path** → accelerated Site-to-Site VPN on TGW.
- **Org-wide prevention of overlapping VPC CIDRs** → VPC IPAM pools shared via RAM.
- **BGP session on private VIF keeps going down after adding sites** → more than 100 prefixes advertised; summarise routes.
