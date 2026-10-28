# API Gateway integrations, stages, deployments, and WebSocket

## Lambda integration (most common on the exam)
### Lambda proxy integration
Gateway forwards the **entire request** to Lambda as a structured event; Lambda returns `{ statusCode, headers, body }`.

SAM `Events: Api` or `HttpApi` wires:
- Method/path on Gateway
- **Lambda permission** for `apigateway.amazonaws.com` to invoke the function

**Exam trap**: Lambda **timeout** must be **less than or equal to** integration timeout. A 30s Lambda with 29s integration cap → failures at the gateway.

### Lambda non-proxy (REST)
Mapping templates transform request/response (VTL). More control, more ops burden — exam favors **proxy** for Lambda.

## HTTP integrations
| Mode | Behavior |
| --- | --- |
| **HTTP proxy** | Pass-through path/query/headers to backend URL |
| **HTTP custom** | Mapping templates on REST API |

Use for **ECS/EC2** services, legacy monoliths, or third-party HTTPS APIs.

## AWS service integrations (REST)
Direct integration without Lambda middle tier for some services, e.g.:
- **DynamoDB** GetItem/PutItem (with IAM role for Gateway)
- **SQS** SendMessage
- **Step Functions** StartExecution
- **Kinesis** PutRecord

**Exam tip**: “Start a Step Functions workflow from HTTP POST without Lambda” → **API Gateway AWS integration** to Step Functions (with correct IAM role on Gateway).

## VPC Link and private backends
```text
Public or private API Gateway
        ↓
VPC Link (managed connection into your VPC)
        ↓
Network Load Balancer (REST VPC Link classic pattern)
        ↓
Targets: IP (Fargate awsvpc) or instance
```

**HTTP API** supports private integrations to **ALB** and **NLB** in VPC.

**Private REST API** itself is reached via **interface endpoint** for `execute-api` — distinct from VPC Link (which reaches **your** backends).

| Goal | Building block |
| --- | --- |
| Gateway in AWS, backend in VPC | **VPC Link + NLB/ALB** |
| Gateway only callable from corporate VPC | **Private API** + **execute-api VPC endpoint** |

## Stages, deployments, and canary (REST)
| Step | Meaning |
| --- | --- |
| **Deploy** | Create a **deployment** — snapshot of resources/methods/integrations |
| **Stage** | Binds a name (`Prod`) to a deployment; holds logs, cache, variables |
| **Canary release** | Shift **percentage of traffic** to new deployment on same stage; **CloudWatch** alarms can trigger rollback |

```text
v1 deployment ──► Prod stage (90% traffic)
v2 deployment ──► Prod stage canary (10% traffic)
        ↓ alarm OK
Shift 100% to v2
```

**Exam tip**: “Gradual API rollout with automatic rollback on 5xx rate” → **stage canary** + **CloudWatch alarm** (not the same as **CodeDeploy Lambda linear** — that’s alias traffic shifting).

### Stage variables
Key/value pairs injected into mapping templates or backend URLs — e.g. `backendUrl` differs per stage without duplicating the API.

## Request validation (REST)
Enable **validator** on method:
- **Validate body** against JSON schema
- **Validate parameters** (required query/path/header)

Invalid requests → **400** before Lambda runs — saves cost and reduces attack surface.

## CORS (REST & HTTP)
Configure **OPTIONS** mock or Lambda response with `Access-Control-*` headers. HTTP API has simplified CORS configuration.

## WebSocket API
| Route | When invoked |
| --- | --- |
| `$connect` | Client connects — auth often here |
| `$disconnect` | Client disconnects |
| `$default` | Unmatched messages |
| **Custom routes** | e.g. `sendMessage` based on JSON `action` field |

Backend: **Lambda** or **HTTP**. Use **API Gateway Management API** (`@connections`) to post messages to connected clients.

**Exam tip**: Real-time browser updates with persistent connection → **API Gateway WebSocket**, not REST polling.

## HTTP API vs REST API (decision table)
| Feature | REST | HTTP |
| --- | --- | --- |
| Cost / latency | Higher / more features | Lower / faster |
| Usage plans & API keys | Yes | No |
| Request validation (JSON schema) | Yes | Limited / simpler model |
| WAF | Regional REST | Regional HTTP |
| Canary deployment on stage | Yes | Check current feature set — exam often ties canary to **REST** |
| Private API (VPC endpoint only) | Yes | **Private HTTP API** patterns evolve — REST private API is classic exam answer |
| JWT / Cognito | Yes | Native JWT authorizer |
| VTL mapping templates | Yes | Minimal |

When the question explicitly mentions **API keys and usage plans**, answer **REST**.

## OpenAPI and IaC
| Approach | Notes |
| --- | --- |
| **Import OpenAPI (Swagger)** | Bootstrap REST API from spec — good for contract-first CI |
| **Export OpenAPI** | Document deployed API |
| **CloudFormation / SAM** | `AWS::ApiGateway::RestApi`, `AWS::Serverless::Api`, `AWS::Serverless::HttpApi` |
| **Terraform** | `aws_api_gateway_*` resources |

Pipeline change flow:
```text
Update OpenAPI or SAM template in Git
        ↓
CloudFormation deploy (change set in prod)
        ↓
New Deployment resource or automatic stage update per template
```

**Exam trap**: Editing console without redeploying stage → callers may still hit old configuration until **deployment + stage** update.

## Mapping and transformation (REST awareness)
- **Mapping templates** (VTL) on method request/response and integration request/response.
- **Proxy integration** skips most mapping — Lambda handles logic.

## Mock integration
Return static status/body — common for **OPTIONS** CORS or health checks without backend.

## Troubleshooting (exam-relevant)
| Symptom | Likely cause |
| --- | --- |
| **403** from Gateway | IAM auth failure, resource policy deny, authorizer deny, missing **Lambda permission** |
| **502/504** | Lambda error/timeout, backend unreachable, VPC Link/NLB health |
| **429** | Throttling — stage, usage plan, or account limit |
| **403 Missing Authentication Token** | Wrong path/stage URL or undefined method |
| CORS browser failure | Missing OPTIONS or wrong `Access-Control-Allow-Origin` |
| Private API unreachable from office | No **execute-api** VPC endpoint or wrong resource policy |
| VPC Link 502 | NLB target unhealthy, SG blocks, wrong listener port |

## High-value scenarios
| Scenario | Answer |
| --- | --- |
| Partner tiers with different rate limits | **REST** + **usage plans** + **API keys** |
| Lowest-cost Lambda HTTP front door | **HTTP API** |
| Block SQLi on public API | **AWS WAF** on **Regional** API Gateway |
| Internal API only from VPC | **Private REST API** + **interface VPC endpoint** |
| Integrate on-prem HTTPS via VPC | **VPC Link** + NLB + integration |
| Canary 10% traffic to new version | **REST stage canary** |
| Bidirectional chat | **WebSocket API** |
| Validate JSON body before Lambda | **REST request validator** |

## Quick review checklist
- [ ] REST vs HTTP vs WebSocket selection
- [ ] Regional vs edge-optimized vs private endpoint
- [ ] Deployment vs stage vs canary
- [ ] Lambda proxy + permission + timeout vs integration limit
- [ ] VPC Link vs Private API (endpoint)
- [ ] Usage plans require REST + API keys
- [ ] WAF attaches to Regional API (not edge-optimized WAF on same resource — edge uses CloudFront WAF)
