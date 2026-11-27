# AI cost optimization and exam scenarios

Skills: 3.1.4, 3.2.5, 3.3.4

Generative AI bills are driven by **tokens** (Bedrock) or **instance time** (SageMaker AI). SAP-C03 cost questions give a usage pattern—steady vs spiky, interactive vs offline, repetitive vs unique prompts—and ask for the cheapest design that still meets latency and residency needs. The second half of this file is the folder-wide decision table and scenario list.

## Cost levers
| Lever | Saves money by | Trade-off |
| --- | --- | --- |
| **Smaller / cheaper model** | Lower per-token price | May lose quality—prove with evaluations |
| **Shorter prompts and `max_tokens`** | Fewer input/output tokens | Less context |
| **Prompt caching** | Reused prompt prefix read from cache at a reduced rate | Prefix must stay identical; cache writes cost more; TTL (often 5 min) |
| **Batch inference** | ~50% lower than on-demand for select models | Async, best effort; job timeout 24 h by default (configurable) |
| **Flex tier** | Discounted on-demand | Slower, best effort |
| **Reserved tier / Provisioned Throughput** | Lower effective rate for steady high volume | Commitment; pay even when idle |
| **Intelligent prompt routing** | Router sends each prompt to the cheaper of two models in one family when quality is similar | English-optimized, limited model families |
| **Model distillation** (concept) | Teacher model trains a smaller student model | Customization work—know the idea only |
| **Response / semantic caching** | Return a stored answer without calling the FM | Stale answers; tune similarity threshold and TTL |
| **Global cross-Region inference** | Cheaper than geographic profiles (AWS cites ~10%) | No data residency guarantee |
| **SageMaker Savings Plans** | Discount on steady SageMaker usage for 1–3 years | Commitment |
| **Scale to zero** (Serverless, Async, inference components) | No idle instance cost | Cold start / provisioning delay |
| **Multi-model endpoints / inference components** | Many models share instances | Noisy neighbours, cold loads |

## Bedrock service tiers
| Tier | Price vs Standard | Behaviour | Fits |
| --- | --- | --- | --- |
| **Priority** | Premium | Served ahead of Standard and Flex | Customer-facing, latency-critical |
| **Standard** (default) | Baseline | Normal on-demand | Most production traffic |
| **Flex** | Discount | Can take longer | Evaluations, summarization, background agents |
| **Reserved** | Fixed monthly per 1K TPM | Reserved capacity, overflows to Standard | Steady mission-critical |

Chosen per request with `service_tier`; CloudWatch shows `ServiceTier` and `ResolvedServiceTier` (which tier actually served it).

## Caching patterns
```text
Request --> [exact-match cache: DynamoDB/ElastiCache key = hash(prompt)] hit --> return
        --> [semantic cache: ElastiCache for Valkey vector search, similarity >= threshold] hit --> return
        --> Bedrock (prompt caching on static system prompt / documents) --> store answer --> return
```
- **Prompt caching** (inside Bedrock): cache long, static prefixes (system prompt, tool definitions, a large document). Cache-read tokens are cheaper and do **not** count toward the TPM quota.
- **Semantic caching** (in front of Bedrock): ElastiCache for Valkey vector search; start strict (high similarity threshold) and set TTLs by data freshness.

## Cross-Region inference, data transfer, and residency
- Cross-Region inference has **no extra routing charge**; you pay the **source Region** price, and traffic stays on the AWS network.
- Keep the **app, Knowledge Base, vector store, and S3 data in one Region**—cross-Region retrieval adds data transfer cost and latency.
- Reach Bedrock through **interface VPC endpoints** rather than NAT gateways to avoid NAT data processing charges on high-volume traffic.
- **Data residency**: a **geographic profile** keeps processing inside that geography (US, EU, APAC…); an **in-Region model ID** keeps it in one Region; a **global profile** can process anywhere—never use it for residency-bound data.
- Enforce with **SCPs** (`aws:RequestedRegion`) and IAM limits on which inference profile ARNs may be invoked.

## Chargeback and token monitoring
| Mechanism | Granularity | Notes |
| --- | --- | --- |
| **Application inference profiles** + cost allocation tags | Per app/tenant/team | Create a profile per consumer (wrapping a model or a cross-Region profile); tags flow to Cost Explorer/CUR |
| **IAM principal cost allocation** | Per IAM user/role/session | CUR 2.0 `line_item_iam_principal`; activate IAM principal or session tags (`iamPrincipal/…`) |
| **Bedrock Projects** | Per project | Only for OpenAI-compatible APIs on `bedrock-mantle` |
| **Invocation logs** (`requestMetadata`, `identity.arn`, token counts) | Per request | CUR has no per-request lines; use logs + Logs Insights |
| **CloudWatch token metrics** by `ModelId` | Per model/profile | Dashboards, alarms on token spikes |
| **Separate accounts** | Per account | Simplest showback; pairs with **AWS Budgets** and **Cost Anomaly Detection** |

**Exam tip**: "Shared Bedrock platform account, bill each business unit for its tokens" → **application inference profile per business unit with cost allocation tags** (or IAM principal tags in CUR 2.0) → Cost Categories for chargeback.

## Choose the right approach
| Requirement | Answer |
| --- | --- |
| Integrate an FM into an app quickly, no infra | **Bedrock** on-demand (`Converse`) |
| Host your own trained model, steady traffic | **SageMaker AI real-time endpoint** (+ Savings Plans) |
| Rare, unpredictable inference | **SageMaker Serverless Inference** |
| Large payloads, long processing, idle at night | **SageMaker Async Inference** (scale to 0) |
| Score millions of records overnight | **Bedrock batch inference** or **SageMaker batch transform** |
| Ground answers in internal docs | **Bedrock Knowledge Base** (RAG) |
| No vector DB operations | **Managed Knowledge Base** |
| Low-cost vectors, infrequent queries | **S3 Vectors** |
| Agent calling internal APIs/Lambda as tools | **AgentCore Gateway** (MCP) + **Identity** |
| Human sign-off before AI-triggered action | **Step Functions** `.waitForTaskToken` |
| Block harmful content and PII | **Bedrock Guardrails** |
| Guardrail mandatory org-wide | **Organizations Bedrock policy** |
| Only approved models in all accounts | **SCP** on model ARNs |
| Private access to Bedrock | **Interface VPC endpoints** + endpoint policy |
| Full prompt/response audit | **Invocation logging** → centralized S3/CloudWatch Logs |
| Throttling at peak, residency required | **Geographic** inference profile (or Reserved tier) |
| Lowest token price, no residency need | **Global** profile + Flex/batch where latency allows |
| Repeated long system prompt | **Prompt caching** |
| Many semantically similar questions | **Semantic cache** (ElastiCache for Valkey) |
| Token chargeback per team | **Application inference profiles** / IAM principal tags |
| Detect drift in a SageMaker model | **Model Monitor** |
| Validate quality before release | **Bedrock Evaluations** in CI/CD |

## Common exam scenarios
- **Nightly summarization of 2 million support tickets, results needed by morning** → Bedrock batch inference (discounted, S3 in/out, EventBridge on completion); on-demand at this volume costs more and hits throttles.
- **Chatbot sends the same 8,000-token policy document with every request** → prompt caching on that prefix.
- **FAQ bot answers the same questions phrased differently thousands of times a day** → semantic cache in ElastiCache for Valkey before calling Bedrock.
- **Customer-facing assistant suffers latency spikes at peak; no reservation desired** → Priority tier for those requests.
- **Steady, predictable, mission-critical token volume all month** → Reserved tier (or Provisioned Throughput for custom models).
- **German bank: processing must stay in the EU but needs burst capacity** → EU geographic inference profile; not global.
- **Startup wants cheapest tokens, no residency rules** → global cross-Region inference profile, Flex tier for background tasks.
- **Finance must charge five teams sharing one Bedrock account** → application inference profiles per team with cost allocation tags, or IAM principal cost allocation in CUR 2.0.
- **SageMaker GPU endpoint sits idle 18 hours a day** → inference components with scale to zero, or Async Inference; Serverless if the model fits its limits.
- **Hundreds of per-customer models, mostly idle** → multi-model endpoint (accept cold-load latency).
- **Simple and complex prompts all go to the most expensive model** → intelligent prompt routing, or route by task type to a smaller model.
- **Lambda in private subnets calls Bedrock heavily via NAT gateway; NAT bill is high** → `bedrock-runtime` interface endpoint.
- **Agent must create tickets in Jira on behalf of the signed-in user** → AgentCore Identity outbound OAuth (3LO or on-behalf-of token exchange) via Gateway.
- **Refunds over $500 suggested by the AI must be approved by a supervisor** → Step Functions Standard workflow with `.waitForTaskToken` callback.
- **All accounts in the Workloads OU must apply the corporate guardrail automatically** → Organizations Bedrock policy + resource-based policy on the guardrail.
- **RAG answers invent facts not in the source documents** → guardrail contextual grounding check, better chunking/reranking, measured with RAG evaluation.
- **Security needs prompts/responses from 40 accounts in one place** → invocation logging per account (same-account destinations) → cross-account log subscriptions or S3 replication to the log archive account.
- **Pooled multi-tenant KB must never return another tenant's documents** → tenant ID metadata + mandatory metadata filter (or one KB per tenant for silo isolation).
- **Team wants to build a new managed agent in a brand-new account** → AgentCore (harness or Runtime); Bedrock Agents Classic no longer accepts new accounts.
- **Lead wants to swap the default model for a cheaper one safely** → run a Bedrock evaluation (LLM-as-a-judge) on a golden dataset and compare before switching.
