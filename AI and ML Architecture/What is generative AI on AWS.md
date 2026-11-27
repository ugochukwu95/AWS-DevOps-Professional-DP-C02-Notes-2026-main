# What is generative AI on AWS?

Skills: 1.2.1, 1.2.3, 2.3.2, 2.4.3

SAP-C03 added a whole task on **integrating AI/ML into architectures**. The questions are not about training models—they ask which **inference option**, **account structure**, **network path**, and **logging design** fits a stated requirement (latency, cost, residency, governance). Two services matter: **Amazon Bedrock** (managed foundation models behind an API) and **Amazon SageMaker AI** (host your own models on endpoints).

## Amazon Bedrock basics
- **Serverless API** to foundation models (FMs) from Amazon and third-party providers—no instances, no containers. Call `InvokeModel` / `Converse` (plus streaming variants).
- **Data privacy**: prompts and completions are **not used to train base models**, and model providers have **no access** to them (models run in Bedrock-owned model deployment accounts).
- Separate endpoints, each with its own VPC interface endpoint:

| Endpoint | Used for |
| --- | --- |
| `bedrock` | Control plane (create guardrails, inference profiles, logging config) |
| `bedrock-runtime` | Model inference (`InvokeModel`, `Converse`) |
| `bedrock-agent` / `bedrock-agent-runtime` | Knowledge Bases build-time and runtime (`Retrieve`, `RetrieveAndGenerate`, `CreateKnowledgeBase`, `CreateDataSource`, `StartIngestionJob`) |
| `bedrock-mantle` | OpenAI-compatible APIs (Responses, Chat Completions) |

## Model access
- Most serverless models are **available by default**. The first invocation of a third-party Marketplace model **auto-subscribes** the account—the caller needs `aws-marketplace:Subscribe` (once per account).
- Some providers need an extra one-time step (e.g. a use-case form for some Anthropic models, which can be submitted once at the **management account**).
- **Governance**: block unapproved models with an IAM/SCP **Deny on `aws-marketplace:Subscribe`** (condition `aws-marketplace:ProductId`) and/or **Deny `bedrock:InvokeModel*`** on specific `foundation-model/*` ARNs.

**Exam tip**: "Only approved models may be used in any account" → **SCP** denying invoke on all model ARNs except an allow-list. IAM alone in each account is not centrally enforced.

## Inference consumption options
| Option | How it works | Choose when |
| --- | --- | --- |
| **On-demand (Standard tier)** | Pay per input/output token, shared capacity, account quotas (TPM/RPM) | Default for most apps |
| **Priority tier** | Per-request `service_tier`, prioritized over Standard, price premium | Customer-facing, latency-critical, no reservation |
| **Flex tier** | Per-request, discounted, can be slower | Evaluations, summarization, agent background work |
| **Reserved tier** | Reserve tokens-per-minute for 1 or 3 months; overflow spills to Standard | Steady mission-critical traffic (via account team) |
| **Provisioned Throughput** | Buy **model units** hourly (no commitment, 1 or 6 months) | Custom/fine-tuned models, guaranteed dedicated throughput |
| **Batch inference** | JSONL in S3 → async job → results in S3; EventBridge job events | Large non-urgent jobs; discounted for select models |

- On-demand quota is **shared** across Priority, Standard, and Flex; Reserved capacity is separate.
- Batch inference is **not** supported on provisioned models; inference profiles do **not** support Provisioned Throughput.

## Cross-Region inference (CRIS)
An **inference profile** defines a model plus the Regions requests can be routed to. You call it from a **source Region**; Bedrock picks the destination Region.

| | Geographic profile (e.g. `us.`, `eu.`, `apac.`) | Global profile (`global.`) |
| --- | --- | --- |
| Routing | Regions **within one geography** | Any supported commercial Region |
| Data residency | Stays in the geography | No geographic guarantee |
| Price | Standard (source Region price) | Cheaper (AWS cites ~10%) |
| SCP impact | Must allow **all destination Regions** in the profile | Must allow `aws:RequestedRegion` = `unspecified` |

```text
App (eu-west-1) --> eu.<model> profile --> Bedrock picks eu-west-1 | eu-central-1 | eu-west-3 ...
                                           (traffic stays on AWS network, encrypted)
CloudTrail record lands in eu-west-1 with additionalEventData.inferenceRegion = actual Region
```

- No extra routing charge; billed at the **source Region** price. Can route to Regions **not enabled** in your account.
- Use CRIS to **absorb bursts / avoid throttling**; use an in-Region model ID if processing must stay in **one Region**.

**Exam tip**: An SCP that denies everything outside `eu-west-1` **breaks** an EU geographic profile. Allow the profile's destination Regions for `bedrock:InvokeModel*` only.

## Bedrock vs SageMaker AI
| Requirement | Bedrock | SageMaker AI |
| --- | --- | --- |
| Use a hosted FM via API, no infra | **Yes** | No |
| Your own/open-weight or classic ML model (XGBoost, custom container) | Limited | **Yes** |
| Control instance type, GPU, container, scaling | No | **Yes** |
| Pricing | Per token (or reserved capacity) | Per instance-hour / serverless duration |
| Built-in RAG, guardrails, agents | **Yes** (Knowledge Bases, Guardrails, AgentCore) | Build yourself |

## SageMaker AI inference options
| Option | Limits (per AWS docs) | Choose when |
| --- | --- | --- |
| **Real-time endpoint** | Payload up to 25 MB, ~60 s response | Steady, low-latency traffic |
| **Serverless inference** | Payload up to 4 MB, up to 60 s; no idle cost; cold starts | Intermittent/unpredictable traffic |
| **Asynchronous inference** | Payload up to 1 GB, up to 1 hour; queues requests; **scale to 0** | Large inputs, long processing, near-real-time OK |
| **Batch transform** | GB-scale datasets, no persistent endpoint | Offline scoring of a whole dataset |
| **Multi-model endpoint** | Many same-framework models share a container; cold-load on demand | Thousands of per-tenant models |
| **Inference components** | Multiple models on one endpoint, per-model resources/scaling, **scale to 0 copies** | Mixed models sharing GPU capacity |

## Multi-account Bedrock deployment patterns
```text
Workload accounts (OU: AI-Apps) --role/API--> AI platform account --> Bedrock (guardrails, KBs, inference profiles)
            |                                     | invocation logs (same account/Region only)
            +---- CloudTrail org trail ---------->+--> CW Logs subscription / S3 replication --> Log Archive account
```

| | Central AI platform account | Per-workload accounts |
| --- | --- | --- |
| Control | One place for models, guardrails, KBs, logging | Each team owns its config |
| Quotas | Shared per-Region quota—noisy-neighbour risk | Quota per account—isolation |
| Chargeback | Application inference profiles / IAM principal tags per tenant | Account-level billing is automatic |
| Access | Cross-account roles or an API (API Gateway + Lambda) in front | Native IAM in each account |
| Typical fit | Strong governance, shared RAG corpus | Autonomous teams, strict blast-radius isolation |

Controls that apply to either pattern:
- **SCPs** restricting model ARNs and Regions; **Organizations Bedrock policies** to enforce a guardrail org-wide.
- **Interface VPC endpoints** (PrivateLink) for `bedrock-runtime` etc. with **endpoint policies**; no NAT/internet needed.
- **Model invocation logging** (disabled by default) to **CloudWatch Logs and/or S3**—destinations must be in the **same account and Region**, so centralize with **cross-account log subscriptions** or **S3 replication** to the log archive account.
- **CloudTrail organization trail** captures Bedrock API calls (who, which model)—but **not prompt/response content**; that is only in invocation logs.

## Choose the right approach
| Requirement | Answer |
| --- | --- |
| Add text generation to an app, no ML team | **Bedrock** on-demand via `Converse` |
| Host a custom-trained classification model | **SageMaker AI real-time endpoint** |
| Spiky, rare predictions; avoid idle cost | **SageMaker Serverless Inference** |
| 500 MB inputs, 20-minute processing | **SageMaker Asynchronous Inference** |
| Throttling at peak, no residency constraint | **Global** cross-Region inference profile |
| EU data must be processed in EU, needs burst capacity | **EU geographic** inference profile |
| Bedrock calls must not traverse internet | **Interface VPC endpoint** for `bedrock-runtime` |
| Audit full prompts and responses | **Model invocation logging** → CloudWatch Logs/S3 |

## Common exam scenarios
- **Security wants prompts and responses retained centrally for 7 years** → invocation logging to S3 in each account/Region, replicate to a log-archive bucket with Object Lock; CloudTrail alone lacks content.
- **Lambda in private subnet times out calling Bedrock** → no route to the public endpoint; add a `bedrock-runtime` interface endpoint with private DNS.
- **Platform team must block a newly released model until legal review** → SCP Deny on that model ARN (and `aws-marketplace:Subscribe` for its product ID).
- **Cross-Region inference fails with AccessDenied after a Region-restriction SCP** → SCP must allow every destination Region in the profile.
- **Fine-tuned model must serve production traffic** → purchase **Provisioned Throughput** for the custom model; Bedrock docs require it for customized models.
