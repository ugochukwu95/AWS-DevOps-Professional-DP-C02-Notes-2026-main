# Deployments, CI-CD, and exam scenarios

## Lambda deployment options
| Approach | When to use |
| --- | --- |
| **Direct update** (`UpdateFunctionCode`) | Simple dev; no traffic shifting |
| **Publish version + update alias** | Manual prod cutover |
| **CodeDeploy for Lambda** | **Canary**, **linear**, or **all-at-once** traffic shift with hooks |
| **SAM/CloudFormation stack update** | IaC-managed infra + code (packaged artifact in S3) |

## CodeDeploy for Lambda (exam-critical)
Uses **aliases** and **deployment configurations**:

| Config (examples) | Behavior |
| --- | --- |
| `CodeDeployDefault.LambdaCanary10Percent5Minutes` | 10% traffic to new version, wait 5 min, then rest |
| `CodeDeployDefault.LambdaLinear10PercentEvery1Minute` | +10% per minute |
| `CodeDeployDefault.LambdaAllAtOnce` | Immediate 100% to new version |

**AppSpec** names function, **alias**, current/target **versions**, and optional hooks:

| Hook | Purpose |
| --- | --- |
| **BeforeAllowTraffic** | Pre-traffic tests (metrics, synthetics) on new version |
| **AfterAllowTraffic** | Post-shift validation, notifications |

Hooks are often **Lambda functions** invoked by CodeDeploy.

```text
CodePipeline (build) → artifact (template + zip)
        ↓
CloudFormation / SAM deploy → new published version
        ↓
CodeDeploy deployment group → shift alias weights → hooks → complete or rollback
```

**Exam tip**: "Gradually shift 10% every minute to new Lambda" → **CodeDeploy linear** + **alias**, not API Gateway stage alone.

## SAM in CodePipeline
Common patterns:

### 1. CodeBuild builds and packages
```text
Source (CodeCommit/GitHub) → CodeBuild (sam build && sam package)
        ↓
Deploy stage: CloudFormation action with packaged template from S3
```

### 2. CloudFormation deploy action
- Template = output of `sam package`
- Capabilities: `CAPABILITY_IAM`, `CAPABILITY_AUTO_EXPAND` (+ `NAMED_IAM` if needed)
- **Change sets** in production for review

### 3. Separate build and deploy roles
- CodeBuild role: S3 artifact upload, ECR push (images), logs
- CloudFormation **execution role**: create/update Lambda, API Gateway, IAM
- Pipeline role: pass roles, start builds/deployments

## Rollback
| Mechanism | Effect |
| --- | --- |
| **CodeDeploy failure** | Stops traffic shift; alias weights revert per deployment config |
| **CloudFormation stack rollback** | Reverts stack to previous template state on failed update |
| **Manual alias update** | Point alias back to last good **version** number |

## Choose the right approach
| Requirement | Answer |
| --- | --- |
| Define API + Lambda + table in Git | **SAM** → CloudFormation |
| Deploy needs SAM macro expansion | **`CAPABILITY_AUTO_EXPAND`** |
| Canary release for Lambda | **CodeDeploy** + **alias** |
| Run integration tests before prod traffic | **BeforeAllowTraffic** hook |
| Schedule Lambda every hour | **EventBridge schedule** (SAM `Schedule` event) |
| Process queue with backpressure | **SQS event source mapping** + batch size |
| Lambda must reach private RDS | **VPC config** + SG + subnets + endpoints/NAT |
| Avoid cold starts on steady traffic | **Provisioned concurrency** on alias |
| Cap noisy neighbor function | **Reserved concurrency** |
| Failed async events retained | **DLQ** or on-failure **destination** |
| Local test before push | **`sam local invoke`** / **`sam local start-api`** |
| Blue/green for EC2 not Lambda | **CodeDeploy EC2/ECS**—different AppSpec |

## SAM / Lambda vs other compute (traps)
| Trap | Reality |
| --- | --- |
| "SAM deploys without CloudFormation" | Always **CloudFormation stack** |
| "Point prod API at `$LATEST`" | Use **alias** + versions for safe deploy |
| "Lambda in VPC has internet by default" | Needs **NAT** or **endpoints** for most AWS APIs |
| "Synchronous invoke retries forever" | Caller handles retry; **async** has Lambda retry + DLQ |
| "CodeBuild replaces SAM" | CodeBuild **runs** `sam build`; SAM defines **what** to deploy |

## Common exam scenarios
- **Pipeline deploys serverless microservice from repo** → CodeBuild `sam build`/`package` → CloudFormation deploy with auto-expand.
- **10% canary then full cutover for Lambda** → CodeDeploy canary deployment configuration on alias **PROD**.
- **Pre-traffic synthetic check** → CodeDeploy **BeforeAllowTraffic** Lambda hook.
- **Function times out processing large batch** → increase **timeout** and **memory** (more CPU) or break work across SQS messages.
- **Throttling under load spike** → raise concurrency limit, **provisioned concurrency**, or buffer with **SQS**.
- **Secrets in Lambda** → **Secrets Manager** / **Parameter Store** with execution role `GetSecretValue` + KMS.
- **Cross-stack API URL** → CloudFormation **Outputs** / **Exports** from SAM stack.
- **Compliance: IAM roles in template** → acknowledge **`CAPABILITY_NAMED_IAM`** in deploy.
- **Incident: bad version in prod** → move **alias** to previous **version** or rollback CodeDeploy/CFN stack.

## Troubleshooting checklist
1. **Deploy failed capabilities** → add `CAPABILITY_IAM` / `AUTO_EXPAND` / `NAMED_IAM`.
2. **Package failed** → CodeBuild role S3/KMS; artifact bucket policy.
3. **Lambda AccessDenied at runtime** → **execution role**, not deploy user.
4. **API 502** → function error, timeout, or wrong handler; check **CloudWatch Logs**.
5. **VPC Lambda cannot reach AWS or DB** → routes, SG, NAT/endpoints, RDS SG allows Lambda SG.
6. **CodeDeploy stuck** → hook Lambda failed; CloudWatch logs for hook; AppSpec version/alias mismatch.
