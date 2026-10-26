# What is AWS CloudFormation?

AWS CloudFormation is the **native AWS Infrastructure as Code (IaC)** service. You declare **templates** (YAML or JSON); CloudFormation **creates, updates, and deletes** stacks of AWS resources in a safe, repeatable order.

CloudFormation answers: **"How do we version, review, and deploy AWS infrastructure the same way every time?"**

## Core concepts
| Concept | Purpose |
| --- | --- |
| **Template** | Declarative document describing desired resources |
| **Stack** | Live instance of a template in one **Region** |
| **Stack resource** | Each AWS resource CloudFormation manages |
| **Stack event** | Log of create/update/delete progress |
| **Change set** | Preview of stack updates before execution |
| **Drift** | Difference between template and actual resource configuration |

```text
Template (Git) → Create/Update stack → AWS resources
                      ↓
              Events, drift detection, rollback
```

## Template building blocks
| Section | Purpose |
| --- | --- |
| **Resources** | **Required** — AWS resources to create (`AWS::S3::Bucket`, …) |
| **Parameters** | User inputs at deploy time (instance type, env name) |
| **Mappings** | Static lookup tables (Region → AMI) |
| **Conditions** | Conditional create/update (e.g. `CreateProdResources`) |
| **Outputs** | Values after deploy; can **export** for other stacks |
| **Metadata** | Template metadata (e.g. interface grouping) |
| **Transform** | Pre-process template (**AWS::Serverless** for SAM, macros) |

Minimal skeleton:
```yaml
AWSTemplateFormatVersion: '2010-09-09'
Description: Example stack

Parameters:
  Environment:
    Type: String
    Default: dev

Resources:
  MyBucket:
    Type: AWS::S3::Bucket
    Properties:
      BucketEncryption:
        ServerSideEncryptionConfiguration:
          - ServerSideEncryptionByDefault:
              SSEAlgorithm: AES256

Outputs:
  BucketName:
    Value: !Ref MyBucket
    Export:
      Name: !Sub '${AWS::StackName}-BucketName'
```

## Intrinsic functions (exam-relevant)
| Function | Use |
| --- | --- |
| `Ref` | Reference parameter or resource logical ID |
| `Fn::GetAtt` | Resource attribute (e.g. bucket ARN, subnet ID) |
| `Fn::Sub` | String substitution with variables |
| `Fn::Join` / `Fn::Split` | String manipulation |
| `Fn::Select` / `Fn::GetAZs` | AZ lists |
| `Fn::FindInMap` | Mapping lookup |
| `Fn::ImportValue` | Import **exported** output from another stack (same Region) |
| `Fn::If` / `And` / `Or` / `Equals` | Conditions |
| `Fn::Cidr` | Subnet CIDR calculation |

YAML shorthand: `!Ref`, `!GetAtt`, `!Sub`, `!If`, `!Join`.

## Pseudo parameters
Built-in values: `AWS::AccountId`, `AWS::Region`, `AWS::StackName`, `AWS::StackId`, `AWS::NotificationARNs`, `AWS::NoValue`.

## Deletion and update policies
| Policy | Effect |
| --- | --- |
| **DeletionPolicy: Retain** | Keep resource when stack deleted |
| **DeletionPolicy: Snapshot** | Snapshot then delete (RDS, ElastiCache) |
| **DeletionPolicy: Delete** | Default — delete with stack |
| **UpdateReplacePolicy** | Retain/Snapshot when replacement would delete old physical resource |

**Exam tip**: "Keep S3 bucket when stack is destroyed" → **DeletionPolicy: Retain**.

## Dynamic references
Pull values at deploy time without hardcoding secrets:
```yaml
Password: '{{resolve:secretsmanager:mysecret:SecretString:password}}'
AmiParam: '{{resolve:ssm:/aws/service/ami-amazon-linux-latest/al2023-ami-kernel-default-x86_64}}'
```

Supports **SSM Parameter Store**, **Secrets Manager**, **SSM SecureString**.

## Related IaC on AWS
| Tool | Relationship |
| --- | --- |
| **AWS CDK** | Defines infra in code; **synthesizes CloudFormation templates** |
| **AWS SAM** | Serverless transform on CloudFormation (`Transform: AWS::Serverless-2016-10-31`) |
| **Terraform** | Separate engine/state; can coexist — exam may compare |
| **Elastic Beanstalk** | Generates CloudFormation for environments |
| **Service Catalog** | Provisions **products** from CloudFormation templates |

## CloudFormation vs Terraform (exam)
| | **CloudFormation** | **Terraform** |
| --- | --- | --- |
| Engine | AWS-native | Multi-cloud |
| State | AWS holds stack state | Terraform state file (S3 + lock) |
| Preview | **Change sets** | `terraform plan` |
| Drift | **Drift detection** built-in | `terraform plan -refresh` |
| Multi-account at scale | **StackSets** | Workspaces, multiple providers |

## Capabilities (IAM in templates)
Creating IAM users/roles/policies requires acknowledging:
- `CAPABILITY_IAM`
- `CAPABILITY_NAMED_IAM` (named IAM resources)
- `CAPABILITY_AUTO_EXPAND` (macros, nested stacks, SAM transforms)

**Exam trap**: Pipeline/CLI deploy fails without required **capabilities**.

## Service role
CloudFormation uses a **service role** (optional but common) to create resources with permissions beyond the caller — especially for **custom resources**, **nested stacks**, or restricted operator IAM.

Separate from **CloudFormation execution role** in CodePipeline (see CI/CD file).

## When CloudFormation appears on DevOps CO2
- **Change sets** before prod deploy
- **StackSets** for Organizations
- **Drift** and remediation
- **CodePipeline** CloudFormation action
- **Proactive hooks** (Control Tower) vs SCP vs Config
- **Nested stacks**, **exports/imports**
- **Custom resources** (Lambda)

See `Stacks, updates, drift, and nested stacks.md` and `StackSets, CI-CD, hooks, and exam scenarios.md`.
