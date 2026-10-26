# What is AWS Config?

AWS Config continuously assesses, audits, and evaluates the configurations and relationships of supported AWS resources. It provides resource inventory, configuration history, compliance evaluation, and automated remediation.

AWS Config answers questions such as:
- What did this resource's configuration look like at a specific time?
- Which security group was attached when an incident occurred?
- Which resources violate an organizational policy?
- What changed immediately before an outage?

AWS Config does **not** block API calls. It records configuration and evaluates compliance after a resource exists or changes. Use SCPs, IAM policies, Control Tower preventive controls, or CloudFormation hooks when prevention is required.

## Core components
| Component | Purpose |
| --- | --- |
| Configuration recorder | Detects and records supported resource configurations |
| Configuration item (CI) | Point-in-time representation of a resource, metadata, tags, and relationships |
| Delivery channel | Sends snapshots/history to S3 and notifications to SNS |
| Config rule | Evaluates whether resource configurations are compliant |
| Conformance pack | Deploys a collection of rules and remediation actions |
| Remediation configuration | Invokes an SSM Automation runbook manually or automatically |
| Configuration aggregator | Provides a multi-account, multi-Region compliance view |
| Advanced query | Queries current resource configuration using SQL-like syntax |

## How AWS Config works
```text
Resource created or changed
        ↓
Configuration recorder creates a configuration item
        ↓
History/snapshot delivered to S3; optional SNS notification
        ↓
Applicable Config rules evaluate the resource
        ↓
COMPLIANT / NON_COMPLIANT result
        ↓
Optional Systems Manager Automation remediation
```

## Configuration recorder
AWS Config is a **Regional** service. Enable and configure a recorder in every Region that contains resources you need to track.

Recording strategies:
- **Continuous recording**: Records supported configuration changes as they occur.
- **Daily recording**: Records the latest configuration state periodically and can reduce cost for suitable resource types.

Choose:
- All supported current and future resource types
- Specific resource types
- All types with selected exclusions

For global resources, choose an intentional recording Region to avoid duplicate configuration items where AWS Config permits it. Some newer global resource types have service-specific recording behavior.

## Configuration items and timelines
A configuration item commonly includes:
- Resource ID, ARN, type, Region, and account
- Configuration attributes
- Tags
- Relationships to other resources
- Capture time and status

The resource timeline combines configuration changes and compliance events. Use it to investigate when a resource changed and how its relationships evolved.

AWS Config can retain configuration data from 30 days up to 7 years; the default is generally 7 years.

## Delivery and notifications
- The **delivery channel** sends configuration snapshots and history files to an S3 bucket.
- SNS can notify subscribers when snapshots are delivered or configuration/compliance changes occur.
- Use EventBridge for rule-based routing of Config compliance events to Lambda, SNS, SQS, or Step Functions.
- Protect the S3 bucket with least-privilege policies, encryption, lifecycle rules, and—when required—Object Lock.

## Advanced queries
Advanced queries use a SQL `SELECT` syntax to query the **current configuration state**, for example:
```sql
SELECT
  resourceId,
  resourceName,
  configuration.instanceType
WHERE
  resourceType = 'AWS::EC2::Instance'
```

Use a configuration aggregator to query resources across accounts and Regions. Advanced queries are for inventory/current-state analysis; use resource timelines or delivered history for historical investigation.

## Integrations
- **AWS Organizations**: Organization rules, conformance packs, and aggregators
- **Systems Manager Automation**: Remediate noncompliant resources
- **Control Tower**: Detective controls implemented with Config rules
- **Security Hub**: Security controls often evaluate configuration and aggregate findings
- **CloudTrail**: Correlate configuration changes with the API caller
- **EventBridge**: Route compliance changes into operational workflows

## Related services—exam distinctions
| Requirement | Service |
| --- | --- |
| Resource configuration history and compliance | **AWS Config** |
| Who made an API call and from which IP | **AWS CloudTrail** |
| Metrics, logs, dashboards, and alarms | **Amazon CloudWatch** |
| Inventory inside operating systems | **Systems Manager Inventory** |
| Block disallowed account-level API permissions | **AWS Organizations SCP** |
| Prevent noncompliant CloudFormation resources | **CloudFormation hook / Control Tower proactive control** |

**Exam tip**: Use Config to determine **what changed** and CloudTrail to determine **who changed it**.
