# AWS Config multi-account operations and exam patterns

## Configuration aggregators
A configuration aggregator collects resource inventory and compliance data from:
- Multiple AWS accounts
- Multiple Regions
- An entire AWS Organizations organization

An aggregator provides a centralized, **read-only** view. It does not:
- Turn on configuration recorders in source accounts
- Deploy Config rules
- Remediate resources

Every source account and Region must still enable recording and the required rules separately.

## Aggregation models
| Model | Setup |
| --- | --- |
| Individual accounts | Source accounts explicitly authorize an aggregator account |
| AWS Organizations | Organization aggregator discovers current and future member accounts through trusted access |

For organization-wide operation:
1. Enable trusted access between AWS Config and Organizations.
2. Optionally register a delegated administrator.
3. Deploy recorders/rules using CloudFormation StackSets, organization rules, conformance packs, Control Tower, or Systems Manager Quick Setup.
4. Create an organization aggregator in a central security/compliance account.
5. Query and monitor compliance centrally.

Use the delegated administrator or security tooling account instead of running daily operations from the Organizations management account.

## Organization Config rules
Organization rules deploy a Config rule across member accounts.
- Use an AWS managed rule, custom Lambda rule, or custom policy rule as supported.
- New accounts inherit the organization rule automatically.
- Exclude selected accounts where supported.
- The rule still evaluates independently in each account and Region.

The management/delegated account needs permission and trusted access to create organization rules. Member accounts generally cannot modify organization-managed rules.

## Recommended architecture
```text
Organizations management account
        │ enables trusted access / delegates Config admin
        ▼
Central security account
        ├── Organization aggregator
        ├── Organization rules / conformance packs
        └── Central EventBridge, SNS, and reporting
                 ▲
                 │ aggregated configuration/compliance
        ┌────────┴─────────┐
 Member account A     Member account B
 Config recorders     Config recorders
 S3 delivery          S3 delivery
 Local evaluations    Local evaluations
```

## Event-driven compliance workflow
```text
Config changes resource to NON_COMPLIANT
        ↓
EventBridge rule matches compliance event
        ├── SNS notification / ticket
        ├── Lambda enrichment
        ├── Step Functions workflow
        └── SSM Automation remediation
```

Use native Config remediation for direct runbook execution. Use EventBridge and Step Functions when the workflow requires enrichment, approvals, branching, or multiple services.

## Operational best practices
- Enable Config in every governed account and Region before relying on compliance dashboards.
- Record all supported resource types unless cost or policy requires a scoped strategy.
- Centralize data in a security account and protect delivery buckets from member-account modification.
- Apply S3 lifecycle rules to historical snapshots while respecting audit-retention requirements.
- Use customer-managed KMS keys where organizational policy requires them.
- Deploy recorders, rules, packs, and aggregators as infrastructure as code.
- Monitor recorder and delivery-channel failures.
- Test custom Lambda rules for oversized configuration items and deleted resources.
- Review Config costs: configuration items, rule evaluations, and conformance-pack evaluations are chargeable.

## Troubleshooting

### No resources appear
1. Verify the configuration recorder exists and is started.
2. Confirm the resource type is supported and included.
3. Check the recorder IAM role or service-linked role.
4. Confirm you are viewing the correct account and Region.

### No snapshots arrive in S3
1. Verify the delivery channel.
2. Check bucket policy, KMS permissions, and Region configuration.
3. Confirm the recorder is running.
4. Inspect Config service errors and CloudTrail API history.

### Rule shows `INSUFFICIENT_DATA`
- The recorder may not have captured the resource yet.
- The resource may be deleted, unsupported, or outside rule scope.
- A custom rule may not have returned a valid evaluation.

### Aggregator is empty
- Aggregation does not enable source recording.
- Verify account authorization or Organizations trusted access.
- Confirm selected source Regions and the delegated administrator configuration.

## High-value exam scenarios
| Scenario | Correct approach |
| --- | --- |
| Find the configuration of a security group yesterday | Config resource timeline/history |
| Identify who changed the security group | CloudTrail |
| Central compliance view across an organization | Organization configuration aggregator |
| Force new accounts to receive compliance rules | Organization rules or conformance packs |
| Correct noncompliant resources automatically | Config remediation with SSM Automation |
| Notify a team when compliance changes | EventBridge → SNS |
| Run an approval workflow before remediation | EventBridge → Step Functions/Automation |
| Query all unencrypted resources across accounts | Aggregator advanced query |
| Block creation of a public resource | SCP, IAM, resource policy, or proactive control—not Config |
| Record software installed inside EC2 | Systems Manager Inventory—not Config |

## Config, Security Hub, and Control Tower
- **Config** evaluates resource configuration using rules.
- **Security Hub** aggregates and prioritizes security findings across services and standards; many controls depend on Config recording.
- **Control Tower detective controls** use Config rules and surface governance status in the Control Tower dashboard.

When a Security Hub or Control Tower control depends on Config, disabling the recorder can produce unknown or failed control status rather than proving compliance.
