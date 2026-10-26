# Shield Advanced, Network Security Director, and exam scenarios

## AWS Shield recap

### Shield Standard (automatic)
- Included at **no extra charge** for all AWS customers.
- Protects against common **network and transport layer (L3/L4)** DDoS attacks for:
  - **Amazon CloudFront**
  - **Amazon Route 53**
  - **AWS Global Accelerator**
  - **Elastic Load Balancing** (ALB, NLB, GLB/CLB where applicable)
  - **Amazon Elastic IP** addresses

Always on — no setup required for baseline DDoS mitigation on eligible resources.

### Shield Advanced (subscription)
Enhanced protection for organizations with higher DDoS risk or strict availability requirements.

| Benefit | Detail |
| --- | --- |
| **Advanced mitigation** | Specialized support for complex/large attacks |
| **DRT (DDoS Response Team)** | 24/7 access to AWS experts during attacks |
| **Advanced metrics & alarms** | Detailed attack visibility in CloudWatch |
| **Cost protection** | Credits for scaling charges during DDoS on protected resources (exam awareness — specific eligibility rules apply) |
| **WAF cost** | **No additional WAF charges** for Web ACLs used on Shield Advanced protected resources (exam distractor vs buying WAF separately) |
| **Integration** | Works with WAF, CloudFront, Route 53, ALB, Global Accelerator, EIP |

**Protected resource types** (register/enroll): CloudFront distributions, Route 53 hosted zones, ALB/NLB/ELB, EIPs associated with EC2, Global Accelerator accelerators.

```text
Attack traffic
    ↓
Shield Standard (always) / Advanced (enhanced)
    ↓
Edge / load balancer
    ↓
AWS WAF (application-layer rules)
    ↓
Application
```

## When to choose Shield Advanced (exam)
Choose **Advanced** when the question mentions:
- **Dedicated DDoS response team** / 24/7 incident support
- **Cost protection** during attack-related scale-out
- **Advanced attack diagnostics** and proactive engagement
- Enterprise **always-on** DDoS program on CloudFront/ALB

Choose **Standard** (implicit) for basic "AWS protects CloudFront from DDoS" statements — Standard is automatic.

**WAF alone** does not provide DRT or DDoS cost protection — it filters application requests.

## Shield Advanced operational patterns
1. Subscribe to **Shield Advanced** in the account (often **security tooling** or **network** account).
2. **Register** protected resources (or use **Firewall Manager** Shield Advanced policy for auto-protection).
3. Configure **CloudWatch alarms** and **EventBridge** for attack notifications.
4. Associate **WAF Web ACL** with fine-grained L7 rules.
5. Engage **DRT** during active attacks (runbooks, contact procedures).

Combine with **Route 53 health checks**, **CloudFront origin failover**, and **multi-AZ** architectures for resilience.

## AWS Shield network security director
**Network Security Director** focuses on **visibility and governance of network security posture** across multi-account environments.

Exam-level understanding:
- Discovers and analyzes **network exposure** and security configuration across accounts
- Helps teams prioritize remediation (works alongside **Firewall Manager**, **Network Firewall**, **VPC** design)
- **Not** an inline traffic filter — does not replace WAF or security groups

Use when a question describes **understanding network risk across the organization**, not blocking a specific HTTP exploit.

## DevOps and CI/CD considerations
| Practice | Service |
| --- | --- |
| Deploy Web ACL in IaC with ALB/CloudFront stack | **WAF** + CloudFormation/Terraform |
| Ensure new ALBs in prod OU get WAF automatically | **Firewall Manager** |
| Log WAF to centralized S3 in log-archive account | **Firehose** cross-account or centralized bucket |
| Pipeline fails if WAF removed from prod ALB | **Config rule** + remediation or SCP |
| DDoS runbook with AWS experts | **Shield Advanced** + DRT |

Do not disable WAF or Shield protections in deployment pipelines without governance review.

## Logging cross-reference (high exam value)
| Log type | Purpose |
| --- | --- |
| **WAF logs** | Allow/block decisions, matched rules |
| **ALB access logs** | Request-level access to load balancer |
| **CloudFront access logs** | Edge requests |
| **CloudTrail** | Who changed WAF/Web ACL API configuration |
| **Shield Advanced metrics** | DDoS event detection |

Centralize in **log-archive account** (Control Tower pattern) via Firehose or S3 replication.

## High-value exam scenarios
| Scenario | Correct approach |
| --- | --- |
| Block XSS/SQLi on HTTP API behind ALB | **AWS WAF** on **ALB** |
| Same WAF baseline on every account's API Gateway | **Firewall Manager** |
| Automatic DDoS protection for CloudFront | **Shield Standard** (always) |
| DDoS with 24/7 AWS response team + cost protection | **Shield Advanced** |
| Rate limit 2000 requests/5 min per IP | **WAF rate-based rule** |
| Test managed rule before blocking traffic | **Count** action |
| Apply CRS only to `/api/*` | **Scope-down** on managed rule group |
| Org-wide detect open SSH to internet | **Firewall Manager** SG policy |
| VPC egress domain filtering | **Network Firewall** (+ FMS policy) |
| Who deleted a WAF rule? | **CloudTrail** |
| WAF logs to S3 for Athena | **WAF logging → Firehose → S3** |
| Multi-account network exposure dashboard | **Network Security Director** (awareness) |

## Exam traps
- **WAF** ≠ **Shield** — application rules vs DDoS mitigation.
- **Firewall Manager** requires **Organizations** — not for single-account only setups.
- **Shield Standard** is automatic — no "enable Standard" step in exam answers.
- **NLB** scenarios often point to **Network Firewall** or architecture change, not classic WAF-on-NLB patterns.
- **GuardDuty** detects threats; it does **not** inline-block HTTP attacks like WAF.
- **NACL/SG** do not inspect SQL injection in HTTP bodies.
- **Proactive Control Tower** blocks bad **CloudFormation** — different from WAF.
- Firehose for WAF must handle **peak RPS** or logs drop.
- CloudFront **Web ACL** is associated in **`us-east-1`** (global resource).

## Quick comparison table
| Service | Inline block? | Scope | Primary exam hook |
| --- | --- | --- | --- |
| **WAF** | Yes (HTTP/S) | Resource (ALB, CF, API GW) | SQLi, geo, rate limit |
| **Shield Standard** | Yes (DDoS L3/L4) | Eligible AWS edge/LB | Automatic protection |
| **Shield Advanced** | Enhanced DDoS | Registered resources | DRT, cost protection |
| **Firewall Manager** | Via deployed policies | **Organization** | Consistent WAF/SG across accounts |
| **Network Security Director** | No | Organization visibility | Posture / exposure |
| **Network Firewall** | Yes (VPC traffic) | VPC | Egress/inspection |

## Review checklist
- [ ] WAF attach points (CloudFront, ALB, API Gateway)
- [ ] Rule actions: Allow, Block, Count
- [ ] Managed rules + scope-down
- [ ] WAF logging: `aws-waf-logs-` or Firehose capacity
- [ ] Shield Standard vs Advanced
- [ ] Firewall Manager prerequisites (Org, trusted access, delegated admin)
- [ ] FMS policy types: WAF, SG, Network Firewall, Shield Advanced
- [ ] WAF vs SG vs Network Firewall vs GuardDuty
- [ ] Network Security Director = visibility, not WAF replacement
