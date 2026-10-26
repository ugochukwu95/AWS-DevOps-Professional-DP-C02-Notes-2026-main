# AWS Config rules, conformance packs, and remediation

## Config rules
A Config rule represents a desired resource configuration. AWS Config evaluates in-scope resources and reports compliance; the rule itself does not deny or modify a resource.

### Rule types
| Type | Implementation | Use |
| --- | --- | --- |
| AWS managed rule | Prebuilt and maintained by AWS | Common checks such as encryption or restricted ports |
| Custom Lambda rule | AWS Lambda evaluation code | Complex checks requiring SDK calls or custom logic |
| Custom policy rule | AWS Config Guard policy | Declarative checks against configuration-item data |

Use a managed rule when it satisfies the requirement. Use a Guard custom policy for configuration-only logic and Lambda when evaluation requires external data or API calls.

### Evaluation triggers
- **Configuration change**: Evaluates when an in-scope resource changes.
- **Periodic**: Evaluates on a schedule, useful when compliance depends on data outside the configuration item.
- A custom Lambda rule can support both where configured.

Scope rules by:
- Resource type
- Specific resource ID
- Tag key/value
- All resources supported by the rule

### Compliance states
| State | Meaning |
| --- | --- |
| `COMPLIANT` | Resource meets the rule |
| `NON_COMPLIANT` | Resource violates the rule |
| `NOT_APPLICABLE` | Rule does not apply to the resource |
| `INSUFFICIENT_DATA` | Config cannot determine compliance |

Rules can annotate evaluations with a concise reason for the result.

## Managed-rule examples
- `s3-bucket-public-read-prohibited`
- `encrypted-volumes`
- `restricted-ssh`
- `cloudtrail-enabled`
- `rds-storage-encrypted`
- `iam-password-policy`

Always verify rule parameters and supported resource types. A similarly named rule may check only one part of a broader requirement.

## Remediation
AWS Config remediation invokes a Systems Manager Automation runbook for a noncompliant resource.

| Mode | Behavior |
| --- | --- |
| Manual | Operator chooses when to remediate |
| Automatic | Config invokes remediation after noncompliance is detected |

Configure:
- Automation document and parameters
- Remediation IAM role
- Automatic-remediation retry count and retry interval
- Resource ID mapping, typically using the noncompliant resource ID

Example:
```text
Config rule: s3-bucket-public-read-prohibited
        ↓ NON_COMPLIANT
SSM Automation runbook removes public access
        ↓
Config reevaluates bucket
        ↓ COMPLIANT
```

### Important remediation behavior
- Automatic remediation can act on stale compliance data if a resource changes again before remediation starts.
- A successful Automation execution does not guarantee final compliance; Config must reevaluate the resource.
- A failed automatic remediation can create a remediation exception after retry limits are exceeded.
- Use least-privilege roles and test remediation against canary resources before broad deployment.
- Prefer idempotent runbooks that are safe to retry.

## Conformance packs
A conformance pack is a YAML template containing a group of Config rules and, optionally, remediation configurations. It provides repeatable compliance baselines such as operational best practices or regulatory mappings.

Use conformance packs to:
- Deploy related rules as one unit
- Standardize controls across accounts and Regions
- Track compliance at rule, resource, and pack level
- Package custom and managed rules with input parameters

Conformance packs do **not**:
- Guarantee compliance
- Prevent resource creation
- Automatically remediate unless remediation is explicitly configured
- Replace formal risk assessment or audit evidence

### Organization conformance packs
From the management or delegated administrator account, deploy packs across AWS Organizations accounts. You can target the organization and exclude selected accounts where supported. New member accounts receive organization-managed configurations automatically after service access is established.

## Config rule vs conformance pack vs Control Tower control
| Requirement | Use |
| --- | --- |
| One compliance check | Config rule |
| Reusable group of compliance checks | Conformance pack |
| Prescriptive landing-zone governance with dashboard | Control Tower control |
| Prevent API action before it succeeds | SCP/IAM policy |
| Validate resource before CloudFormation provisions it | Proactive control / CloudFormation hook |

## Deployment as code
Manage rules and packs with CloudFormation, CDK, Terraform, CLI, or APIs.

Common CloudFormation resources:
- `AWS::Config::ConfigurationRecorder`
- `AWS::Config::DeliveryChannel`
- `AWS::Config::ConfigRule`
- `AWS::Config::RemediationConfiguration`
- `AWS::Config::ConformancePack`
- `AWS::Config::ConfigurationAggregator`

## Exam scenarios
- Detect unencrypted EBS volumes → managed Config rule
- Automatically encrypt/remediate a supported violation → Config rule + SSM Automation
- Deploy PCI-oriented checks to many accounts → organization conformance pack
- Write a declarative custom check against CI properties → Config custom policy rule
- Evaluate using external API data → Lambda custom rule
- Stop a noncompliant API call before creation → Config is insufficient; use preventive controls
