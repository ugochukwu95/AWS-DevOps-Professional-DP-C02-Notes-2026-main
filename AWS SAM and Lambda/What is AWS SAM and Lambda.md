# What is AWS SAM and Lambda?

## AWS Lambda
**Lambda** runs code **without provisioning servers**. You upload a **handler** (or container image); Lambda scales execution in response to **events** or **direct invocation**.

| Concept | Meaning |
| --- | --- |
| **Function** | Your code + runtime + configuration |
| **Execution role** | IAM role Lambda assumes to call AWS APIs and write logs |
| **Event source** | Service that triggers the function (API Gateway, SQS, EventBridge, …) |
| **Concurrency** | Number of simultaneous executions (account/Region limits apply) |

Lambda is **stateless** between invocations (use DynamoDB, ElastiCache, S3, or `/tmp` for state).

## AWS SAM (Serverless Application Model)
**SAM** is an **IaC extension for serverless apps** on top of **CloudFormation**. You write a concise `template.yaml`; SAM **transforms** it into a full CloudFormation template with Lambda, API Gateway, IAM, and related resources.

```text
template.yaml (SAM)
        ↓ Transform: AWS::Serverless-2016-10-31
Expanded CloudFormation template
        ↓ sam deploy / CloudFormation stack
Running Lambda, API, queues, tables, …
```

**Exam tip**: SAM is **not** a separate deployment engine—it always becomes **CloudFormation**. Deploy with **`CAPABILITY_AUTO_EXPAND`** (and **`CAPABILITY_IAM`** / **`CAPABILITY_NAMED_IAM`** when roles are created).

## SAM vs related tools
| Tool | Role |
| --- | --- |
| **SAM** | YAML serverless templates, local test, package/deploy CLI |
| **CloudFormation** | Underlying stack engine for SAM |
| **CDK** | Code (TypeScript/Python) → synthesizes CloudFormation (can include SAM patterns) |
| **Terraform** | Separate IaC; not SAM transform |
| **Serverless Framework** | Third-party; not AWS-native exam focus |

## When the exam points to SAM + Lambda
- Define **Lambda + API + DynamoDB + IAM** in one versioned template
- **CI/CD**: `sam build` → `sam package` → deploy stack in CodePipeline/CodeBuild
- **Controlled Lambda releases** with traffic shifting → **CodeDeploy** + **aliases** (often defined in SAM/CodeDeploy pipeline)
- **Local validation** before pipeline → `sam local invoke` / `sam local start-api`

See also: `AWS Cloudformation/` notes (transform, capabilities, nested stacks).
