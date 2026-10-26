# CodeDeploy CI/CD, rollback, and exam scenarios

## CodePipeline integration
```text
Stage: Build (CodeBuild)
    Output artifact: appspec.yml + application files (+ taskdef for ECS)
        ↓
Stage: Deploy (CodeDeploy)
    Configuration:
      - ApplicationName
      - DeploymentGroupName
      - DeploymentConfigName (optional override)
        ↓
CreateDeployment
```

### EC2 pipeline requirements
- Artifact in S3 (via pipeline artifact store)
- `appspec.yml` at revision root
- Instances tagged/matched to **deployment group**
- **CodeDeploy agent** running and healthy
- **Service role** allows `codedeploy:*` and S3 read

### ECS pipeline requirements
- New **task definition** with updated ECR image (often created in CodeBuild or CloudFormation step)
- CodeDeploy ECS deployment group linked to **service + cluster + target groups**
- **Blue/green** deployment type selected on deployment group

### Lambda pipeline requirements
- Published version + alias
- Deployment configuration for traffic shifting

## CodeBuild → CodeDeploy artifact pattern
CodeBuild `buildspec` packages:
```text
output/
  appspec.yml
  scripts/
  app binaries
```
Zip to pipeline artifact — CodeDeploy action references revision from artifact bucket.

For **ECS**, artifact may contain `imagedefinitions.json` or taskdef template per pipeline design.

## Cross-account deployment
CodeDeploy supports cross-account with:
- Artifact bucket policy in **tools account**
- **IAM roles** in target account trusting pipeline/CodeDeploy
- ECS/ASG/ALB in target account

Same pattern as CloudFormation cross-account in your IAM/CodePipeline notes.

## Monitoring and notifications
| Tool | Use |
| --- | --- |
| **CodeDeploy console/API** | Deployment status per instance/target |
| **EventBridge** | Deployment state change events |
| **SNS** | Notifications on success/failure |
| **CloudWatch alarms** | Trigger **rollback**; alert on error rates during bake |
| **CloudWatch Logs** | Agent hook script logs (EC2) |

Route failed prod deployments to **EventBridge → Step Functions** for incident runbooks if exam asks multi-step response beyond SNS.

## On-premises deployments
- Register instances with CodeDeploy (tags, agent)
- Revisions from S3 same as EC2
- Useful for hybrid — exam awareness

## Troubleshooting
| Symptom | Check |
| --- | --- |
| `Missing credentials / agent not running` | Install/start CodeDeploy agent; IAM instance profile |
| `HEALTH_CONSTRAINTS` | Minimum healthy hosts; failed ValidateService |
| ECS blue/green stuck | Target group health checks, security groups, task port |
| Lambda traffic shift failed | Alias permissions, deployment config name |
| S3 access denied | Service role bucket/KMS policy |
| Hook timeout | Increase timeout; fix script; check logs |
| No instances in deployment group | Tags/ASG mismatch |

## High-value exam scenarios
| Scenario | Correct approach |
| --- | --- |
| Rolling deploy to EC2 ASG behind ALB | **CodeDeploy** in-place + hooks |
| Blue/green ECS with gradual traffic | **CodeDeploy for ECS** + linear/canary config |
| Lambda prod alias canary release | **CodeDeploy Lambda** + canary config |
| Run script after files copied, before start | **AfterInstall** hook |
| Integration test before traffic to new tasks | **BeforeAllowTraffic** Lambda |
| Auto revert failed deploy | **Automatic rollback** on deployment group |
| Revert if error rate alarm after release | **CloudWatch alarm** + CodeDeploy rollback |
| Full CI/CD from commit to EC2 | CodePipeline → CodeBuild → **CodeDeploy** |
| EKS blue/green with ALB shift | **CodeDeploy for EKS** (not plain kubectl rolling alone when hooks specified) |
| Simple ECS service update only | CodePipeline **ECS deploy action** may suffice |
| Deploy static files only | **S3 deploy** — not CodeDeploy |

## Exam traps
- **CodeDeploy** does not **build** — needs CodeBuild artifact or task definition from prior step.
- **Agent required** for EC2/on-prem — not for Lambda/ECS (agentless).
- **Beanstalk** deploy action ≠ **CodeDeploy** action.
- **AllAtOnce** on critical prod EC2 — usually wrong vs **OneAtATime** or **blue/green**.
- **ValidateService** failure fails deployment — design idempotent scripts.
- Confusing **CodeDeploy ECS** with **CodePipeline ECS provider** — hooks/traffic shift → CodeDeploy.
- **AppSpec missing** from artifact — common pipeline failure.
- **iam:PassRole** for ECS task execution role when task definition changes.

## CodeDeploy + CodePipeline + CodeBuild map
```text
CodePipeline  ─ orchestrates
CodeBuild     ─ compile, test, package revision / push ECR
CodeDeploy    ─ release to EC2 / ECS / Lambda / EKS
CloudFormation─ infra (separate stage, often before first deploy)
```

## Security best practices
- Least-privilege **service role** per application/environment
- Separate **deployment groups** for dev/staging/prod
- **Manual approval** in pipeline before prod CodeDeploy action
- Encrypted **S3 artifacts** (KMS)
- **Automatic rollback** + alarms on prod
- No secrets in AppSpec scripts — pull from **Parameter Store/Secrets Manager** at runtime

## Review checklist
- [ ] Platforms: EC2 (agent) vs ECS/Lambda (agentless)
- [ ] In-place vs blue/green
- [ ] Deployment configs: OneAtATime, Canary, Linear
- [ ] EC2 hooks vs traffic hooks (BeforeAllowTraffic)
- [ ] AppSpec role in artifact
- [ ] Alarm-based rollback
- [ ] CodePipeline deploy action vs ECS deploy action
- [ ] vs Elastic Beanstalk / CloudFormation / EKS GitOps
- [ ] IAM service role + instance profile
