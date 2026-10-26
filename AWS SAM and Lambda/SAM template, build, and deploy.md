# SAM template, build, and deploy

## Minimal SAM template skeleton
```yaml
AWSTemplateFormatVersion: '2010-09-09'
Transform: AWS::Serverless-2016-10-31
Description: Example API

Globals:
  Function:
    Timeout: 30
    Runtime: python3.12
    MemorySize: 256

Resources:
  HelloFunction:
    Type: AWS::Serverless::Function
    Properties:
      Handler: app.lambda_handler
      CodeUri: hello/
      Events:
        ApiEvent:
          Type: Api
          Properties:
            Path: /hello
            Method: get

Outputs:
  HelloApi:
    Description: API Gateway endpoint URL
    Value: !Sub "https://${ServerlessRestApi}.execute-api.${AWS::Region}.amazonaws.com/Prod/hello"
```

## Common SAM resource types
| Type | Creates (simplified) |
| --- | --- |
| `AWS::Serverless::Function` | Lambda + optional events (API, schedule, SQS, …) |
| `AWS::Serverless::Api` | Amazon API Gateway **REST** API with stage |
| `AWS::Serverless::HttpApi` | API Gateway **HTTP** API (lower cost/latency) |
| `AWS::Serverless::SimpleTable` | DynamoDB table with single hash key |
| `AWS::Serverless::LayerVersion` | Lambda layer |
| `AWS::Serverless::Application` | Nested app from **Serverless Application Repository (SAR)** |

Standard CloudFormation resources (`AWS::S3::Bucket`, `AWS::DynamoDB::Table`, …) can mix with SAM resources in the same template.

## Globals
`Globals` sets **defaults** for all functions (or APIs) so you do not repeat `Runtime`, `Timeout`, `MemorySize`, `Environment`, `VpcConfig`, etc.

## Function events (triggers defined in SAM)
| Event type | Integrates with |
| --- | --- |
| `Api` / `HttpApi` | API Gateway |
| `Schedule` | EventBridge schedule (rate/cron) |
| `S3` | S3 object events |
| `SQS` | Queue poller |
| `SNSTopic` | SNS subscription |
| `DynamoDB` | Stream |
| `Kinesis` | Stream |
| `EventBridgeRule` | Custom event pattern |

SAM wires IAM permissions and event source mappings when you declare events under the function.

## Policies in SAM
Instead of hand-writing IAM JSON, use **policy templates**:

```yaml
Policies:
  - DynamoDBCrudPolicy:
      TableName: !Ref MyTable
  - S3ReadPolicy:
      BucketName: !Ref MyBucket
  - AWSLambdaVPCAccessExecutionRole
```

For custom permissions, use inline policies or `AWS::IAM::Policy` resources.

## SAM CLI workflow
| Command | Purpose |
| --- | --- |
| `sam build` | Compile dependencies (layers, Makefile, esbuild) → `.aws-sam/build` |
| `sam local invoke` | Run function locally in Docker |
| `sam local start-api` | Local API Gateway emulation |
| `sam validate` | Validate template |
| `sam package` | Upload artifacts to S3; output packaged template |
| `sam deploy` | Deploy stack (guided or `samconfig.toml`) |

### CI/CD pattern (CodeBuild example)
```text
sam build
sam package --s3-bucket artifact-bucket --output-template-file packaged.yaml
aws cloudformation deploy --template-file packaged.yaml \
  --stack-name my-app --capabilities CAPABILITY_IAM CAPABILITY_AUTO_EXPAND
```

Or **`sam deploy`** with the same capabilities configured in `samconfig.toml`.

**Exam tip**: **`sam package`** puts Lambda zip/layers in **S3**—pipeline needs S3 permissions and often **KMS** for encrypted buckets.

## Deploy capabilities
| Capability | When required |
| --- | --- |
| `CAPABILITY_IAM` | Create IAM roles without custom names |
| `CAPABILITY_NAMED_IAM` | Create IAM roles **with** explicit names |
| `CAPABILITY_AUTO_EXPAND` | SAM transform, macros, nested serverless transforms |

## Parameters, mappings, conditions, outputs
Same as CloudFormation: **Parameters** for env (`Environment=prod`), **Conditions** for optional resources, **Outputs** for URLs and ARNs (export for cross-stack references).

## Nested and shared apps
- **Nested SAM/CFN stacks** for large systems
- **`AWS::Serverless::Application`** pulls a published app from **SAR** with parameters

## Best practices (exam-aligned)
- Store secrets in **Secrets Manager** / **Parameter Store**—reference in SAM, not plaintext in Git
- Use **Globals** and **policy templates** for consistency
- Version templates in Git; deploy via **CodePipeline** with change sets in prod
- Enable **X-Ray** and structured logging for operability
- Separate **dev/staging/prod** stacks or parameters—not one `$LATEST` in prod without aliases
