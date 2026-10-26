# Declarative policies in AWS Organizations
Declarative policies let you centrally define and enforce the baseline configuration for AWS services at scale. They enforce the desired configuration without relying on individual API calls—compliance is maintained even when services add new features or when actions are taken by service-linked roles.

## Authorization vs declarative (exam distinction)
| | Authorization (SCP/RCP) | Declarative |
| --- | --- | --- |
| Controls | Max permissions for principals (SCP) or resources (RCP) | Service-level settings and feature defaults |
| Grants permissions? | No (guardrail only) | No (configuration enforcement) |
| Applies to management account? | No for SCP/RCP | Yes when attached at root or inherited |
| Example | Deny `ec2:RunInstances` except approved regions | Block VPC public access org-wide |

## Inheritance
- Attach at root, OU, or account level; child OUs and accounts inherit automatically.
- New accounts joining the organization inherit applicable declarative policies.
- Unlike SCPs at the root, declarative policies **do** apply to the management account.

## Supported declarative policy types (examples)
- **Amazon EC2 / VPC / EBS**: IMDSv2 defaults, serial console access, AMI/snapshot block public access, VPC block public access, allowed AMIs, VPC encryption controls
- **Amazon S3**: Central S3 configuration baselines
- **Security Hub**, **Amazon Inspector**, **Amazon Bedrock**: Service-specific security/configuration defaults
- **Backup**, **Tag**, **Chatbot**, **Upgrade rollout**, **AI services opt-out**

## Common use cases
- Block public internet access to VPC resources org-wide
- Enforce encryption in transit for VPC traffic
- Require IMDSv2 on new EC2 instances
- Prevent non-compliant S3 or Security Hub settings regardless of who makes the change

## Management
Create and attach via Organizations console, AWS CLI, AWS CloudFormation, or AWS Control Tower.
