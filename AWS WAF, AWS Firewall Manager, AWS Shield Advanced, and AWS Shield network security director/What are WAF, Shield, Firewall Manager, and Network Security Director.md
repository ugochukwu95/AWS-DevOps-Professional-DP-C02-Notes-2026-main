# What are AWS WAF, Shield, Firewall Manager, and Network Security Director?

Four related services protect applications and networks at different layers and scopes. DevOps CO2 questions usually test **which service fits the scenario** and **where rules attach**.

## One-line purpose
| Service | Purpose |
| --- | --- |
| **AWS WAF** | **Layer 7** web application firewall — block/allow HTTP(S) requests (SQLi, XSS, geo, rate limits) |
| **AWS Shield** | **DDoS protection** — Standard (free, automatic) and **Advanced** (enhanced L3/L7, DRT, cost protection) |
| **AWS Firewall Manager** | **Central governance** — deploy and enforce WAF, security group, Network Firewall, Shield Advanced policies across an **organization** |
| **AWS Shield network security director** | **Network security visibility** — discover and assess network exposure/posture across accounts (awareness-level on exam) |

## Defense in depth (typical stack)
```text
Internet
    ↓
AWS Shield (DDoS — Standard or Advanced)
    ↓
CloudFront / ALB / API Gateway / AppSync / etc.
    ↓
AWS WAF Web ACL (application-layer rules)
    ↓
Your application
```

**Exam tip**: **WAF** filters **application requests**. **Shield** mitigates **DDoS floods**. They complement each other; Shield Advanced often pairs with WAF on protected resources.

## Where AWS WAF attaches (regional vs global)
| Resource | WAF scope | Notes |
| --- | --- | --- |
| **Amazon CloudFront** | **Global** Web ACL (CloudFront scope) | Edge; protect multiple origins |
| **Application Load Balancer (ALB)** | **Regional** Web ACL | Common for web apps in VPC |
| **Amazon API Gateway** (REST/HTTP/WebSocket) | Regional | Protect APIs |
| **AWS AppSync** | Regional | GraphQL |
| **Amazon Cognito user pool** | Regional | Auth endpoints |
| **AWS App Runner** | Regional | Container web services |
| **Amazon Verified Access** | Regional | Zero-trust access |

**Exam traps**:
- **Classic Load Balancer (CLB)** and **NLB** — WAF integrates with **ALB**, not NLB in the classic exam pattern (use **AWS Network Firewall** or other controls for different L4 patterns).
- WAF is for **HTTP/HTTPS** application traffic on supported integrations — not a replacement for **security groups** (stateful firewall at ENI level).

## AWS Shield Standard vs Advanced
| | **Shield Standard** | **Shield Advanced** |
| --- | --- | --- |
| Cost | Included for all customers | Paid subscription |
| Protection | Automatic baseline L3/L4 for CloudFront, Route 53, Global Accelerator, ALB/ELB/EIP | Enhanced detection/mitigation, 24/7 **DRT** access |
| WAF | Use WAF separately | **WAF fees waived** for Web ACLs on protected resources (exam awareness) |
| Metrics/response | Basic | Advanced metrics, attack notifications, **cost protection** for scaling charges during attacks |
| Eligible resources | Same family | CloudFront, Route 53, ALB, NLB/CLB/ELB, EIP, Global Accelerator |

**Exam tip**: "Large-scale DDoS on CloudFront/ALB with dedicated response team and cost protection" → **Shield Advanced**, not WAF alone.

## AWS Firewall Manager role
Without Firewall Manager, you configure WAF Web ACLs **per account/Region**.

With **Firewall Manager** (Organizations):
```text
Security / network admin account (delegated administrator)
        ↓
Firewall Manager policy (WAF / SG / Network Firewall / Shield Advanced)
        ↓
Automatically applied to new accounts / resources in scope (OUs, tags)
        ↓
Member accounts cannot easily drift from org baseline
```

Requires:
- **AWS Organizations** (all features)
- **Trusted access** for Firewall Manager
- **Delegated administrator** account (typically security tooling account)

## Shield network security director (awareness)
Helps organizations **discover and understand network security posture** (exposure, misconfigurations, recommendations) across multi-account environments — complements Firewall Manager and Network Firewall governance.

For DP-C02: know it as **network security visibility/governance at org scale**, not a replacement for WAF request filtering.

## Service selection cheat sheet
| Scenario | Service |
| --- | --- |
| Block SQL injection on ALB | **AWS WAF** managed rule group on ALB |
| Rate-limit requests per IP | **WAF rate-based rule** |
| Same WAF rules on all ALBs in 50 accounts | **Firewall Manager** WAF policy |
| Mitigate volumetric DDoS on CloudFront | **Shield Standard** (always) + **Advanced** if question needs DRT/cost protection |
| Central deny-all-public-SSH security groups | **Firewall Manager** security group policy |
| Inspect VPC east-west traffic | **AWS Network Firewall** (not WAF) — Firewall Manager can govern it |
| Audit who changed a security group | **CloudTrail** + **Config** — not WAF |
| Stream WAF logs to S3 for analysis | **WAF logging** → Kinesis **Firehose** or CloudWatch Logs |

## Related services (exam boundaries)
| Service | Layer / scope |
| --- | --- |
| **Security groups** | Instance/ENI firewall — allow/deny ports |
| **NACLs** | Subnet stateless filter |
| **AWS Network Firewall** | VPC L3/L4/L7 firewall, IDS/IPS, domain filtering |
| **GuardDuty** | Threat detection from logs/DNS/flow — does not block inline |
| **AWS Config** | Detective compliance on resource config |

See `AWS WAF Web ACLs, rules, and logging.md`, `AWS Firewall Manager and organization policies.md`, and `Shield Advanced, NS Director, and exam scenarios.md`.
