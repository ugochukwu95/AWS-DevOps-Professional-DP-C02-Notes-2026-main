# API Gateway DevOps integrations, security, and exam scenarios

## CI/CD and infrastructure as code

### SAM / CloudFormation (serverless pipeline)
```text
Git push
        ↓
CodePipeline: Source → CodeBuild
        ↓
sam build && sam package → S3 artifact template
        ↓
CloudFormation deploy action (Change set + approval for prod)
        ↓
Lambda + API Gateway REST/HTTP updated; invoke permissions created
        ↓
Output: https://{api-id}.execute-api.{region}.amazonaws.com/Prod/
```

SAM creates:
- `AWS::Serverless::Function` with `Events: Api` or `HttpApi`
- Implicit **RestApi** or **HttpApi** + stage (often `Prod`)
- **Lambda::Permission** for API Gateway invoke

**Exam tip**: “Infrastructure and API defined in one template with Lambda” → **SAM** or **CloudFormation**, not manual console-only workflow.

### OpenAPI-driven pipelines
Contract-first teams store **OpenAPI 3** in Git; pipeline **imports** or updates API via CloudFormation `Body`/`DefinitionBody` on `AWS::ApiGateway::RestApi`.

Use when question mentions **API contract review in PR** separate from Lambda code.

### CodeDeploy vs API Gateway canary vs Lambda alias
| Mechanism | What shifts |
| --- | --- |
| **API Gateway stage canary** | Traffic between **deployments** on an API **stage** |
| **CodeDeploy Lambda linear/canary** | Traffic between Lambda **alias** versions |
| **Both in one system** | Possible in advanced setups — exam usually tests **one** lever per question |

Wording “**API** canary with CloudWatch alarm rollback” → **API Gateway stage canary**.  
Wording “**10% every minute to new Lambda version**” → **CodeDeploy** + **alias**, not stage alone.

## Security layers
```text
Client
   ↓
[Optional: CloudFront + WAF]  ← edge-optimized REST
   ↓
[Regional WAF on API Gateway] ← Regional REST/HTTP
   ↓
AuthN: IAM | Cognito | JWT | Lambda authorizer
AuthZ: IAM policy / authorizer context / scopes
   ↓
Request validation (REST)
   ↓
Integration (Lambda with least-privilege role)
```

### AWS WAF
Associate **Regional Web ACL** with **Regional REST API** or **HTTP API** in the same Region.

**Firewall Manager** can enforce baseline WAF on API Gateway across an organization.

Related: **WAF Web ACLs** note — API Gateway is a standard attach point.

### Resource policies (REST)
Attach policy to API to:
- Allow/deny by **source IP**
- Allow **cross-account** invoke
- Restrict **Private API** to specific **VPC endpoints** / VPCs

### IAM authentication
Caller signs with **SigV4**; method has `AWS_IAM` authorization. Common for **internal microservices** and **SigV4-aware SDK** clients.

### Cognito user pools
Users authenticate to Cognito; API method uses **COGNITO_USER_POOLS** authorizer with JWT.

### Lambda authorizer
- **Token-based** — validates bearer token, returns policy + context.
- **Request-based** — inspects headers/query for signing.

Authorizer **cache TTL** reduces Lambda invocations — tradeoff when revoking tokens.

### mTLS (awareness)
Mutual TLS on **custom domains** for REST/HTTP — clients present certificates; used in B2B APIs.

### Secrets and backend credentials
- Do not embed secrets in mapping templates in Git.
- Use **Secrets Manager** / **Parameter Store** referenced from Lambda (not Gateway VTL with plaintext).

## Observability

### CloudWatch metrics (`AWS/ApiGateway`)
| Metric | Use |
| --- | --- |
| **Count** | Request volume |
| **4XXError / 5XXError** | Client vs server errors — canary rollback alarms |
| **Latency** | End-to-end Gateway latency |
| **IntegrationLatency** | Backend time |
| **CacheHitCount / CacheMissCount** | REST cache effectiveness |

### Logging
| Log type | Content |
| --- | --- |
| **Access logs** | Who called what (CLF/custom format) — to CloudWatch Logs or Kinesis |
| **Execution logs** | Request/response details (REST) — debug; mind **PII** and cost |

Enable on **stage**; requires **IAM role** for API Gateway to write logs.

**Exam trap**: Metrics exist by default; **access/execution logs are not on by default** — must configure.

### AWS X-Ray
Enable tracing on stage/method; traces through Gateway to Lambda (and downstream if SDK instrumented).

## Multi-account and cross-account
| Pattern | Needs |
| --- | --- |
| **Central API account** | Resource policy allowing caller accounts; or IAM roles in caller |
| **Shared VPC private API** | VPC endpoint + resource policy allowing principal accounts |
| **CloudFormation StackSets** | Deploy same API pattern to many accounts/Regions |

Pipeline in **tools account** deploys stack into **workload account** via **CloudFormation cross-account role** (same pattern as other IaC notes).

## Integration with other AWS services (DevOps)
| Service | Pattern |
| --- | --- |
| **Lambda** | Sync invoke via proxy integration |
| **Step Functions** | Start execution from HTTP; or async workflow after API returns 202 |
| **EventBridge** | API → Lambda → PutEvents (exam: “emit domain event”) |
| **SQS** | Decouple: API → Lambda → queue → worker |
| **Cognito** | User auth for public APIs |
| **Certificate Manager** | TLS on custom domain |
| **Route 53** | Alias record to regional or edge domain name |

## Rate limiting and resilience
- **Throttling** at stage and usage-plan level — protect backends during deploys or abuse.
- **Idempotent APIs** for safe retries when clients see 429/503.
- **Dead-letter** patterns belong **behind** Gateway (Lambda DLQ, SQS), not on Gateway itself.

## High-value exam scenarios
| Scenario | Correct approach |
| --- | --- |
| Expose Lambda over HTTPS with minimal ops | **API Gateway** (HTTP or REST) or **Function URL** if no usage plans/WAF needs |
| SaaS API with bronze/silver/gold rate limits | **REST API** + **usage plans** + **API keys** |
| Block OWASP Top 10 on public REST API | **WAF** on **Regional** API Gateway |
| API only from corporate network VPC | **Private REST API** + **execute-api VPC endpoint** |
| Call ECS service in private subnets | **VPC Link** + NLB + HTTP/REST integration |
| Gradual API deployment with alarm rollback | **REST stage canary** + **CloudWatch** |
| Deploy API + Lambda in one pipeline | **SAM** + **CodePipeline** + **CloudFormation** |
| Real-time notifications to browser | **WebSocket API** |
| Service-to-service with AWS credentials | **IAM authorization** on method |
| Mobile app users with JWT | **Cognito user pool** authorizer |
| Custom OAuth token validation | **Lambda authorizer** |
| Reduce load on read-heavy GET | **REST API caching** on stage |
| Long-running report generation | **202 Accepted** + async worker (SQS/Step Functions) — not 60s sync Lambda |

## Exam traps
- **HTTP API** does not support **usage plans / API keys** — use **REST** for partner throttling tiers.
- **Private API** ≠ **VPC Link** — private = who can reach **Gateway**; VPC Link = how Gateway reaches **your VPC backends**.
- **Edge-optimized** REST uses CloudFront; **WAF for CloudFront** is in **CloudFront scope**, not Regional WAF on the same logical “edge” resource — know **Regional vs CloudFront WAF** attach points.
- **Lambda permission** required for API invoke — missing → 403/502 class errors.
- **Integration timeout** caps synchronous waits — long jobs need async design.
- **Config** tracks API Gateway **resource configuration**; it does not replace **WAF** or **authorizers** for security enforcement.
- **ALB** vs **API Gateway** — container **ECS** HTTP often **ALB**; **serverless Lambda HTTP** usually **API Gateway** (unless question says Function URL).

## Related notes in this repo
- **AWS SAM and Lambda** — `Api`, `HttpApi`, deploy outputs
- **AWS WAF** — Regional association, Firewall Manager
- **Amazon CloudWatch** — access logs, metrics, alarms for canary
- **AWS IAM** — SigV4, resource policies, cross-account
- **CodePipeline / CloudFormation** — deploy stages, change sets
- **Step Functions** — orchestration behind async APIs

## Quick review checklist
- [ ] REST vs HTTP vs WebSocket
- [ ] Private API + VPC endpoint vs VPC Link to NLB
- [ ] Usage plans + API keys (REST only)
- [ ] Stage deployment + canary + CloudWatch rollback
- [ ] WAF on Regional API Gateway
- [ ] Auth: IAM, Cognito, Lambda authorizer, JWT (HTTP)
- [ ] SAM/CloudFormation CI/CD pattern
- [ ] Logs/metrics/X-Ray enablement
- [ ] Integration timeout vs Lambda timeout vs async pattern
