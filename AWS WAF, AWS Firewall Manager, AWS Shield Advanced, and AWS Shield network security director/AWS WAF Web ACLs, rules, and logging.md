# AWS WAF Web ACLs, rules, and logging

## Web ACL
A **Web ACL** is a container for **rules** evaluated in **priority order** (lowest number first). The first matching rule whose action applies determines the outcome (unless overridden by default action).

| Setting | Purpose |
| --- | --- |
| **Default action** | `Allow` or `Block` for requests that match no rule |
| **Rules** | Custom rules, rule groups, managed rule groups |
| **Resource association** | Attach ACL to CloudFront, ALB, API Gateway, etc. |
| **Capacity** | **WCU** (Web ACL capacity units) — managed rule groups consume WCUs |

```text
Request → Web ACL
            ├── Rule 1 (priority 0) → match? → action
            ├── Rule 2 (priority 1) → match?
            └── default action
```

## Rule types
| Type | Use |
| --- | --- |
| **Regular rule** | Your conditions (IP, geo, headers, body size, regex, rate limit) |
| **Rule group** | Reusable set of rules (custom or managed) |
| **Managed rule group** | AWS or marketplace vendor maintained (Core rule set, SQLi, Bot Control, etc.) |

## Rule actions (exam-relevant)
| Action | Behavior |
| --- | --- |
| **Allow** | Forward request to protected resource |
| **Block** | Return 403 (or custom response) |
| **Count** | Count matches but do not block — **testing/tuning** |
| **CAPTCHA / Challenge** | Bot control flows (where supported) |

**Exam tip**: Roll out new managed rules with **Count** first, then switch to **Block** after reviewing metrics.

## Common rule patterns
| Requirement | WAF feature |
| --- | --- |
| Block specific countries | **Geo match** statement |
| Limit requests per IP | **Rate-based rule** |
| Block known bad User-Agents | **String match** on header |
| Block large request bodies | **Size constraint** |
| Allow only corporate IP range | **IP set match** + Allow; default Block |
| SQLi / XSS | **AWS Managed Rules** (e.g. Core rule set, Known bad inputs) |

## Scope-down statements
Inside a **managed rule group**, a **scope-down statement** **narrows** which requests the managed rules evaluate.

Example intent: Apply the Core rule set **only** to `/api/*`, not static assets.

```text
Managed rule group: AWSManagedRulesCommonRuleSet
    └── scope-down: URI path starts with /api/
```

Without scope-down, managed rules apply to all requests matching the Web ACL association.

**Exam tip**: "Apply OWASP rules only to dynamic API paths" → **managed rule group + scope-down**.

## IP sets and regex pattern sets
- **IP set** — reusable CIDR collections for allow/block lists.
- **Regex pattern set** — reusable patterns for headers, query strings, URI paths.

Update sets centrally; all referencing rules use new definitions.

## AWS Managed Rules (examples)
| Rule group | Purpose |
| --- | --- |
| **Core rule set (CRS)** | Common OWASP-style protections |
| **Known bad inputs** | Exploit strings |
| **SQL database** | SQLi patterns |
| **Linux/Windows/PHP/WordPress** | OS/CMS-specific |
| **Bot Control** | Bot management (additional cost tier) |
| **Account takeover prevention** | Login abuse |

Verify **scope** (CloudFront vs Regional) and **WCU** limits when stacking multiple groups.

## Association and deployment in CI/CD
- Web ACLs are **infrastructure** — manage with **CloudFormation**, **Terraform**, **CDK**.
- Associate Web ACL to ALB/API Gateway/CloudFront in IaC pipelines.
- Use **Count** mode in non-prod; promote rule changes through review.

Cross-account ALB + WAF: Web ACL and ALB must be in compatible scope/Region (Regional WAF with Regional ALB; CloudFront uses global ACL in `us-east-1` for CloudFront resource association — exam awareness: CloudFront WAF ACLs are created in **us-east-1**).

## Logging and monitoring
WAF can log every inspected request (filtered by logging configuration).

| Destination | Notes |
| --- | --- |
| **Amazon CloudWatch Logs** | Log group name **must** start with `aws-waf-logs-` |
| **Amazon Kinesis Data Firehose** | Stream to S3, OpenSearch, Splunk, etc. |
| **S3** (via Firehose) | Long-term analysis, Athena |

```text
Web ACL (logging enabled)
        ↓
Firehose delivery stream  OR  CloudWatch Logs
        ↓
S3 / OpenSearch / SIEM
```

**Exam traps**:
- One WAF log record ≈ one Firehose record — size Firehose for **peak request rate** or logs may be dropped.
- **Count** action still generates logs/metrics for tuning.
- WAF logs are not a substitute for **CloudTrail** (API audit) or **ALB access logs** (complete request log format differs).

## Metrics and alarms
CloudWatch metrics include `AllowedRequests`, `BlockedRequests`, `CountedRequests`, and per-rule metrics.

Create **CloudWatch alarms** on blocked request spikes; route to **SNS** or **EventBridge** for incident response.

## WAF vs security group (exam favorite)
| | **AWS WAF** | **Security group** |
| --- | --- | --- |
| Layer | **L7** HTTP/S inspection | **L3/L4** port/protocol |
| Inspects | Headers, body, URI, geo | IP + port allow/deny |
| Attach to | CloudFront, ALB, API GW, … | ENI/instance |
| Block SQLi in query string | **Yes** | **No** |

Use **both**: SG restricts who can reach the load balancer; WAF filters malicious HTTP content.

## Troubleshooting
| Issue | Check |
| --- | --- |
| All traffic blocked | Default action Block; rule priority; IP allowlist |
| Managed rule false positive | **Count** mode; **scope-down**; custom exclusion |
| No logs in S3 | Firehose IAM, capacity, logging filter, destination errors |
| WAF not applied | Web ACL association missing or wrong Region |
| 413 / body rules | Size constraint rules on large uploads |

## WAF exam scenarios
| Scenario | Answer |
| --- | --- |
| Block SQL injection on public ALB | **WAF** managed SQL/CRS on **ALB** |
| Test rule before enforcing | **Count** action |
| Limit login endpoint abuse | **Rate-based rule** on URI path |
| Protect CloudFront distribution globally | **CloudFront-scoped Web ACL** |
| Centralize rule updates across accounts | **Firewall Manager** (not manual per account) |
| Archive WAF logs for compliance | Logging → **Firehose** → **S3** |
