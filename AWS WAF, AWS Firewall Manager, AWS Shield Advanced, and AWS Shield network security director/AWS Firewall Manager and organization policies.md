# AWS Firewall Manager and organization policies

## What Firewall Manager does
**AWS Firewall Manager** simplifies **administration of security policies across multiple accounts and Regions** in AWS Organizations.

Without it: security teams manually create WAF ACLs, security groups, and Network Firewall rules in every account.

With it: define a **policy once**; Firewall Manager **automatically deploys and maintains** rules on resources in scope.

```text
Organizations management account
        │ enable trusted access
        ▼
Delegated administrator (security / network account)
        │ creates Firewall Manager policy
        ▼
Member accounts — resources auto-associated (new + existing in scope)
```

## Prerequisites (exam)
1. **AWS Organizations** with **all features** enabled
2. **Enable trusted access** for Firewall Manager
3. Register **delegated administrator** account
4. Configure policies from the **administrator account** (not from every member account)

Same pattern as GuardDuty, Security Hub, and Config organization admin.

## Policy types
| Policy type | What it governs |
| --- | --- |
| **WAF policy** | Regional or CloudFront Web ACLs — preconfigured rule groups on ALB, API Gateway, etc. |
| **Security group policy** | Baseline or audit security groups (common: restrict risky ports like 22/3389 from 0.0.0.0/0) |
| **Network Firewall policy** | AWS Network Firewall rule groups and firewall endpoints in VPCs |
| **Shield Advanced policy** | Automatic Shield Advanced protection for resources in scope |

## Policy scope
Policies apply to resources in:
- Specified **organizational units (OUs)** and/or accounts
- **Resource tags** (where supported)
- **Resource types** (e.g. all Application Load Balancers in OU)

**New accounts** in a governed OU inherit policies automatically — key exam point for landing zones and Control Tower environments.

## WAF policies in Firewall Manager
Typical enterprise pattern:
```text
Firewall Manager WAF policy
    ├── AWS Managed Rules Core rule set
    ├── Known bad inputs
    └── Optional custom rule group (IP blocklist)
            ↓
Auto-associate Web ACL with new ALBs / API Gateways in OU
```

Benefits:
- Prevent teams from launching public ALBs **without** WAF
- Central team updates rule groups; members cannot disable org-mandated baseline (depending on IAM/SCP design)

## Security group policies
Two common modes (exam awareness):
| Mode | Intent |
| --- | --- |
| **Audit** | Report violations of policy (e.g. SSH open to world) |
| **Remediation / common baseline** | Enforce or restore approved SG rules |

**Exam tip**: "Detect any security group allowing 0.0.0.0/0 on port 22 across all accounts" → **Firewall Manager security group policy**, not manual Config rule alone (though Config can detective-check too).

## Network Firewall policies
For **VPC-level** traffic inspection (L3–L7), **AWS Network Firewall** works with Firewall Manager to deploy consistent rule stacks across VPCs in the org.

Distinguish from WAF:
- **WAF** → HTTP/S on CloudFront/ALB/API GW
- **Network Firewall** → VPC traffic paths, egress filtering, IDS/IPS domains

## Shield Advanced policies
Firewall Manager can automate **Shield Advanced protections** for in-scope resources (CloudFront, ALB, etc.) so new resources get Advanced protections without manual enrollment.

Pair with **Shield Advanced subscription** and DRT access for incident response.

## Relationship to SCPs and Control Tower
| Mechanism | Role |
| --- | --- |
| **SCP** | Prevent disallowed APIs (e.g. disable WAF removal, restrict public access) |
| **Firewall Manager** | **Deploy and maintain** desired WAF/SG/firewall configuration |
| **Control Tower** | Landing zone; detective/preventive controls; accounts in OUs |
| **Config** | Detect drift from desired configuration |

Defense in depth: SCP prevents disabling logging; Firewall Manager ensures WAF exists; Config detects noncompliance.

## IAM and administration
- Administer policies from **delegated administrator** account.
- Firewall Manager creates **service-linked roles** in member accounts to manage resources.
- Least-privilege: only security platform team edits policies; workload teams deploy apps within guardrails.

## Monitoring
- **Firewall Manager dashboard** — policy compliance, violations, resources out of scope.
- Integrate with **Security Hub** for centralized findings (where supported).
- **CloudWatch** metrics and notifications for policy deployment failures.

## Troubleshooting
| Issue | Check |
| --- | --- |
| Policy not applied to new ALB | OU scope, tags, resource type filter, account excluded |
| Member changed WAF manually | Policy **remediation** settings; re-sync |
| Cannot create policy | Trusted access, delegated admin registration |
| Conflict with local Web ACL | Policy design — single org ACL association model |

## Firewall Manager exam scenarios
| Scenario | Answer |
| --- | --- |
| Enforce same WAF rules on all ALBs in prod OU | **Firewall Manager WAF policy** |
| New accounts must inherit security baseline | Firewall Manager + **OU scope** |
| Central team manages org; workload accounts deploy freely within guardrails | **Delegated admin** + FMS |
| Block SQLi on one ALB only | **WAF** on that ALB — FMS is for **org-wide** patterns |
| Organization-wide SSH exposure check | **FMS security group policy** (audit/remediate) |
