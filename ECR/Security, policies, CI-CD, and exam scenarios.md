# ECR security, policies, CI-CD, and exam scenarios

## Authorization model
Access requires **both** (when cross-account or resource policy used):
1. **Identity-based IAM policy** on the caller (user, role, CodeBuild)
2. **Repository policy** (optional) — resource-based policy on the repository

Same-account pull often works with IAM alone; **cross-account pull** typically needs **repository policy** + consumer IAM.

### Repository policy example (conceptual)
Allow Account B to pull:
```json
{
  "Version": "2012-10-17",
  "Statement": [{
    "Sid": "AllowCrossAccountPull",
    "Effect": "Allow",
    "Principal": { "AWS": "arn:aws:iam::222233334444:role/EcsTaskRole" },
    "Action": [
      "ecr:BatchGetImage",
      "ecr:GetDownloadUrlForLayer"
    ]
  }]
}
```

Consumer still needs `ecr:GetAuthorizationToken` and pull actions on the repository ARN in **their** IAM policy.

### KMS with encrypted repositories
- Repository uses **customer managed CMK**.
- Key policy must allow ECR service and **consumer roles** (ECS task execution role, CodeBuild, etc.) to decrypt.

**Exam trap**: Cross-account pull fails with KMS error → fix **key policy**, not only repository policy.

## IAM roles by workload
| Workload | Role that pulls from ECR |
| --- | --- |
| **ECS task** | **Task execution role** (pull) + task role (app AWS APIs) |
| **EKS pod** | Node role (avoid) — prefer **IRSA/Pod Identity** for app; node still needs pull for kubelet |
| **Lambda container** | **Lambda execution role** needs ECR pull on image URI |
| **CodeBuild** | Service role — push and pull for build cache |
| **CodePipeline** | Service role — ECR source action |

ECS **task execution role** must include `ecr:GetAuthorizationToken` and pull permissions on the repository.

## PrivateLink / VPC endpoints
Pull images without public internet:
- **ECR API** interface endpoint (`com.amazonaws.region.ecr.api`)
- **ECR DKR** endpoint (`com.amazonaws.region.ecr.dkr`)
- **S3 gateway** endpoint (layers stored in S3)

Common in private subnet ECS/EKS/CodeBuild.

## CI/CD patterns

### CodeBuild → ECR
```bash
aws ecr get-login-password --region $AWS_REGION | \
  docker login --username AWS --password-stdin $ECR_URI

docker build -t $ECR_URI:$IMAGE_TAG .
docker push $ECR_URI:$IMAGE_TAG
```

- Enable **privileged mode** on CodeBuild for Docker builds.
- Tag with **git commit SHA** for traceability.
- Optional: scan gate before promoting tag to `prod`.

### CodePipeline
| Pattern | Flow |
| --- | --- |
| **Build and deploy** | Source → CodeBuild (push ECR) → ECS/CodeDeploy/EKS |
| **ECR source trigger** | New image in repo → pipeline execution → deploy to staging |

ECR source action watches repository/tag filters.

### GitOps / EKS
- Pipeline updates image tag/digest in manifest repo **or** direct `kubectl set image`.
- Cluster pulls from ECR via node/instance profile or pull secrets (less common on EKS with proper node IAM).

### Lambda container image
Package as container → push ECR → Lambda function references `imageUri`.

Function role needs pull; Lambda service pulls on cold start/update.

## EventBridge integration
React to:
- **ECR image action** (push, delete)
- **Scan findings** (critical vulnerability detected)

```text
ECR scan finds CRITICAL
        ↓
EventBridge rule
        ↓
SNS alert OR Lambda blocks pipeline promotion
```

Pairs with **DevSecOps** exam scenarios.

## Security best practices
- **Private repositories** only for proprietary images.
- **Least-privilege** IAM — build role push to specific repos; prod ECS pull only.
- **Scan on push** + fail CI on critical CVEs.
- **Lifecycle policies** — remove vulnerable stale images.
- **Immutable tags** or **digest** deploys.
- **Replication** instead of wide cross-account pull where possible.
- Audit **CloudTrail** for `PutImage`, `DeleteRepository`, policy changes.
- Use **Organizations SCPs** to deny unencrypted repos or public pull policies (where applicable).

## Performance (exam awareness)
- **Layer caching** in CodeBuild speeds rebuilds.
- **Same Region** pull for ECS/EKS tasks as cluster.
- **Replication** reduces cross-Region pull latency.
- **Blob mounting** reduces storage for duplicate layers across repos in one registry.

## Troubleshooting
| Symptom | Likely cause |
| --- | --- |
| `no basic auth credentials` | Missing `docker login` / get-login-password |
| `AccessDenied` on pull | Task execution role, repository policy, or SCP |
| KMS decrypt error | CMK key policy missing ECS/CodeBuild role |
| `CannotPullContainerError` on ECS | Wrong URI, tag missing, or IAM |
| Scan never completes | Scanning disabled; image too large; unsupported manifest |
| Replication not working | Filter mismatch; destination permissions |
| Pull through cache 404 | Upstream name mismatch; auth to private upstream |

## High-value exam scenarios
| Scenario | Correct approach |
| --- | --- |
| Private store for Docker images for ECS | **Amazon ECR** private repository |
| CI pushes image after build | **CodeBuild** + ECR login + push |
| Deploy when new image tagged `release-*` | **CodePipeline** ECR source |
| Share images from build account to prod account | **Repository policy** + IAM + KMS |
| Multi-Region same image | **ECR replication** |
| Auto-remove untagged failed builds | **Lifecycle policy** |
| Scan images for CVEs on push | **ECR scanning** (enhanced/basic) |
| Cache Docker Hub in AWS | **Pull through cache** |
| Prevent overwriting production tag | **Tag immutability** |
| ECS task cannot start | **Task execution role** ECR permissions |
| EKS app pulls private ECR | Node/kubelet IAM or correct pull secret; IRSA for app AWS APIs |
| Block deploy on critical scan | **EventBridge** + pipeline/approval gate |

## Exam traps
- **ECR stores images; ECS/EKS runs them** — don't pick ECS for registry.
- **GetAuthorizationToken** required for any pull/push — separate from repo-level actions.
- **Cross-account** needs repository policy **and** identity policy **and** KMS if encrypted.
- **CodeArtifact** is for npm/Maven/pypi — not container images.
- **ECR Public** vs **private** — exam scenarios about company IP → **private ECR**.
- Deleting repo **does not** stop running tasks already started — but new deploys fail.
- **Image Builder** outputs AMIs/containers — can publish **container** images to ECR (related service).

## ECR + related services map
```text
CodeBuild ──push──► ECR ◄──pull── ECS / EKS / Lambda
                      │
                      ├── scanning → EventBridge → SNS
                      ├── lifecycle → cost cleanup
                      └── replication → other Region/account
```

## Review checklist
- [ ] GetAuthorizationToken + pull/push actions
- [ ] Repository policy vs IAM for cross-account
- [ ] KMS encryption and key policy
- [ ] ECS task execution role for ECR pull
- [ ] Scan on push vs enhanced (Inspector)
- [ ] Lifecycle vs manual delete
- [ ] Replication vs re-build per Region
- [ ] Pull through cache purpose
- [ ] Tag immutability and digest pinning
- [ ] CodePipeline ECR source vs CodeBuild push
