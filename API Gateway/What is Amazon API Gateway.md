# What is Amazon API Gateway?

Amazon API Gateway is a **managed front door** for HTTP/WebSocket APIs. It handles **routing**, **authentication/authorization**, **throttling**, **request/response transformation**, and **integration** with backends (Lambda, HTTP endpoints, AWS services, VPC resources).

On DOP-C02 it appears with **serverless CI/CD (SAM/CloudFormation)**, **Lambda**, **WAF**, **CloudWatch**, **private VPC APIs**, and **canary deployments**.

## Three API types (exam-critical)
| Type | Use | Notes |
| --- | --- | --- |
| **REST API** | Full-featured APIs, fine-grained control | Stages, usage plans, API keys, request validation, VTL mapping, WAF (Regional), **canary** on stage |
| **HTTP API** | Lower cost/latency, simpler | Lambda & HTTP integrations, JWT/Cognito, **no** usage plans/API keys (exam); SAM `AWS::Serverless::HttpApi` |
| **WebSocket API** | Bidirectional, persistent connections | `$connect`, `$disconnect`, `$default` routes; Lambda or HTTP backends |

```text
Client
   ↓
API Gateway (REST / HTTP / WebSocket)
   ↓
Integration: Lambda | HTTP | AWS service | Mock | VPC Link → private NLB/ALB
```

**Exam tip**: Need **usage plans + API keys + throttling tiers for partners** → **REST API**. Need **cheap fast Lambda proxy** → **HTTP API**. Need **live chat / streaming over WebSocket** → **WebSocket API**.

## REST API endpoint types
| Endpoint | Behavior |
| --- | --- |
| **Regional** | API deployed in one Region; clients hit that Region’s `execute-api` hostname |
| **Edge-optimized** | CloudFront in front for lower latency to geographically distributed clients |
| **Private** | Accessible only from your VPC via **interface VPC endpoint** (`execute-api`); resource policy restricts VPCs/VPs |

**Exam tip**: “API must not be reachable from the public internet” → **Private REST API** + **VPC endpoint** + restrictive **resource policy**.

## Core REST concepts
| Concept | Purpose |
| --- | --- |
| **Resource / method** | URL path + HTTP verb (GET, POST, …) |
| **Integration** | How Gateway calls the backend (Lambda proxy, HTTP proxy, AWS, custom) |
| **Method request/response** | Validation, auth, headers, mapping |
| **Deployment** | Immutable snapshot of API configuration |
| **Stage** | Named pointer to a deployment (`dev`, `prod`) + stage variables + logs/throttle settings |

You **deploy** configuration changes, then **point a stage** at the new deployment (or use canary on the stage).

## Common integration patterns
| Backend | Pattern |
| --- | --- |
| **AWS Lambda** | **Lambda proxy integration** (passes full request as event) — most common in SAM |
| **HTTP/HTTPS URL** | On-premises or EC2/ECS service |
| **AWS service** | Direct integration (e.g., DynamoDB, SQS, Step Functions start execution) |
| **Private VPC** | **VPC Link** → **NLB** (REST) or **ALB/NLB** (HTTP API private integrations) |
| **Mock** | Return fixed response (CORS preflight, testing) |

**Integration timeout**: REST API synchronous integrations have a **maximum integration timeout** (historically **29 seconds** for many integrations — **verify current quotas** in docs). Long work → **async** (202 + SQS/EventBridge/Step Functions), not a blocking API call.

## Authentication and authorization (overview)
| Mechanism | Typical use |
| --- | --- |
| **IAM (SigV4)** | Service-to-service, AWS SDK callers |
| **Amazon Cognito user pools** | Mobile/web users (JWT) |
| **Lambda authorizer** | Custom token validation (REST & HTTP) |
| **JWT authorizer** | HTTP API native JWT validation |
| **Resource policy** | IP allowlists, cross-account invoke, **private API** VPC restriction |

**Exam trap**: **Lambda authorizer** returns IAM policy allowing/denying routes; **Cognito** issues tokens validated by Gateway — different setup paths.

## Throttling and quotas
| Layer | Control |
| --- | --- |
| **Account/Region** | Default steady-state and burst limits (adjustable via Service Quotas) |
| **Stage** | Stage-level throttle settings |
| **Usage plan** (REST) | Per **API key** — rate and burst caps for customers/tiers |

429 responses when limits exceeded — design clients with backoff; use **usage plans** for SaaS partner tiers on **REST**.

## Caching (REST)
Enable **stage caching** on method responses to reduce backend load (TTL per method). Invalidate cache on deploy or explicitly.

**Exam tip**: “Reduce repeated DynamoDB/Lambda reads for identical GETs” → **API Gateway cache** (REST) or **CloudFront** in front of edge-optimized API.

## Custom domains and TLS
- **ACM certificate** in same Region (Regional/Private) or **us-east-1** for edge-optimized.
- Map **custom domain** → stage; optional **base path mapping** for multiple APIs.

## API Gateway vs Application Load Balancer
| Requirement | Prefer |
| --- | --- |
| Serverless Lambda HTTP with auth/throttle/API management | **API Gateway** |
| Long-lived HTTP connections, WebSockets to EC2 (non-Gateway WS API), path routing to many targets | **ALB** |
| Container targets on ECS/EKS with L7 routing | **ALB** |
| Built-in usage plans & API keys | **REST API Gateway** |

**Lambda Function URL** is a simpler public HTTPS entry without Gateway features (no usage plans, lighter auth story).

## DevOps touchpoints (reference)
```text
OpenAPI/SAM/CloudFormation defines API
        ↓
CodeBuild: sam package / cfn deploy
        ↓
CloudFormation updates API + Lambda permissions
        ↓
New Deployment → Stage (optional canary %)
        ↓
CloudWatch access/execution logs + WAF on Regional REST/HTTP
```

Related notes: **SAM and Lambda**, **CloudFormation**, **WAF**, **CloudWatch**, **IAM**.

## Pricing awareness (exam level)
Pay for **API calls**, **data transfer**, optional **cache** capacity, **WebSocket** connection minutes/messages. **HTTP API** is generally cheaper than **REST** for equivalent Lambda proxy traffic.

**Exam tip**: Questions test **which API type**, **private vs public**, **auth method**, **CI/CD deploy model**, and **WAF/logging** — not API Gateway internal implementation details.
