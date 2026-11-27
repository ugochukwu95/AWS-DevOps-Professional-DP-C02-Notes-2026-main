# RAG, Knowledge Bases, and AI agents

Skills: 1.2.2, 1.2.4, 2.5.3

**Retrieval-augmented generation (RAG)** grounds a foundation model in **your** data at query time—no retraining. **AI agents** go further: the model reasons, calls **tools** (APIs, Lambda, other agents), and loops until the task is done. SAP-C03 tests the architecture: ingestion and retrieval design, vector store choice, tool connectivity, and where to put **deterministic control and human approval**.

## RAG vs other ways to customise a model
| Approach | Changes the model? | Fresh data? | Choose when |
| --- | --- | --- | --- |
| Prompt engineering | No | Only what fits in the prompt | Small, static context |
| **RAG** | No | **Yes**—re-sync the source | Answers must cite current internal documents |
| Fine-tuning / distillation | Yes | No (snapshot at training) | Change style/behaviour; out of SAP-C03 depth |

**Exam tip**: "Answers must reflect documents updated daily, with citations" → **RAG**, never fine-tuning.

## RAG architecture
```text
INGEST (offline / on sync)
  Source (S3, SharePoint, Confluence, web) --> parse --> CHUNK --> EMBED (embedding model) --> VECTOR STORE
QUERY (online)
  User question --> embed --> RETRIEVE top-k chunks (+ metadata filter, hybrid, rerank)
                --> AUGMENT prompt with chunks --> GENERATE (FM) --> answer + citations
```

## Amazon Bedrock Knowledge Bases
Managed RAG: connects data sources, parses, chunks, embeds, writes to a vector store, and exposes **`Retrieve`** (chunks only—you build the prompt) and **`RetrieveAndGenerate`** (chunks + FM answer with citations).

| | Customer-managed knowledge base | **Managed Knowledge Base** (GA June 2026) |
| --- | --- | --- |
| Vector store | You pick and operate one (below) | **Service-managed** storage, auto-scales |
| Connectors | S3, custom; Confluence/SharePoint/Salesforce/Web Crawler cannot be newly created after Sept 30, 2026 | S3, SharePoint, Confluence, Google Drive, OneDrive, Web Crawler + direct ingestion API |
| Retrieval | Semantic or hybrid (store-dependent), reranking, query decomposition | Hybrid always on, managed reranker, **agentic retrieval** for multi-hop |
| Access control | Metadata filters you design | **Document ACL awareness** (app passes user identity) |
| Cross-account | Same-account resources | **Resource-based policies** (e.g. allow `bedrock:Retrieve` from other accounts) |

Ingestion choices:
- **Sync is incremental**—only new/changed documents are reprocessed. Trigger syncs on a schedule or from S3 events.
- **Structured data** (e.g. Redshift) can be queried through a query engine (natural language → SQL) rather than embedded.
- **Parsing**: default text parser, a foundation-model or advanced parser for tables/figures, or Bedrock Data Automation for multimodal content.
- A **custom transformation Lambda** can pre-process or chunk documents yourself.

## Chunking strategies
| Strategy | Behaviour | Use for |
| --- | --- | --- |
| **Default** | ~300-token chunks, respects sentence boundaries | General documents |
| **Fixed-size** | You set max tokens + overlap % | Uniform content, predictable cost |
| **Hierarchical** | Small child chunks for matching, replaced by larger parent chunks on retrieval | Precise match but broad context (manuals, contracts) |
| **Semantic** | Splits on meaning shifts using an FM (extra cost) | Unstructured prose with topic changes |
| **No chunking** | One document = one chunk | Pre-split files or custom Lambda chunking |

## Vector store options
| Store | Notes |
| --- | --- |
| **OpenSearch Serverless** | Serverless vector collection; hybrid search; can be VPC-private |
| OpenSearch Service managed clusters | Existing domain; must be public-access for KB integration |
| **Amazon S3 Vectors** | Lowest-cost, durable vector buckets; sub-second queries, best for **infrequent** queries; metadata size limits (avoid big hierarchical chunks) |
| **Aurora PostgreSQL (pgvector)** | Reuse relational skills; hybrid search; same account as KB |
| **Neptune Analytics** | **GraphRAG**—relationships between entities |
| Pinecone, Redis Enterprise Cloud, MongoDB Atlas | Third-party stores you already run |

## Retrieval quality levers
- **Metadata filtering**: attach attributes (department, date, tenant) and filter (`equals`, `in`, `greaterThan`…) — the standard way to enforce **tenant isolation** in a pooled KB. **Implicit filtering** lets the model derive the filter from the question.
- **Hybrid search**: vector + keyword; helps with product codes and exact terms. Supported on RDS/Aurora, OpenSearch Serverless, MongoDB (with a filterable text field).
- **Reranking**: a reranker model reorders retrieved chunks by relevance before generation.
- **Query decomposition**: split a complex question into sub-queries.
- **Guardrails** on `RetrieveAndGenerate`, including **contextual grounding checks** against retrieved passages.

## Bedrock Agents Classic vs Bedrock AgentCore
**Bedrock Agents** is now **Agents Classic**: in **maintenance mode** and closed to new customers from **July 30, 2026** (existing users keep working, no new features). New designs use **AgentCore**—framework-agnostic (Strands, LangGraph, CrewAI…) and model-agnostic.

| AgentCore capability | Purpose |
| --- | --- |
| **Runtime** | Serverless hosting for agents/tools with **per-session isolation** (microVM), long-running async support |
| **Harness** | Config-based managed agent loop (model + prompt + tools)—closest to Agents Classic |
| **Gateway** | Turn **REST APIs and Lambda functions** into **MCP tools**; front existing MCP servers |
| **Memory** | Short-term (session) and long-term (cross-session) memory |
| **Identity** | Agent workload identities, inbound auth, outbound OAuth/API keys via token vault |
| **Policy** | Cedar-compatible rules evaluated by Gateway on **every tool call** before execution |
| **Browser / Code Interpreter** | Managed sandboxed browser and code execution tools |
| **Observability / Evaluations** | OTEL traces and metrics in CloudWatch; automated agent quality scoring |
| Registry | Catalog of approved agents, MCP servers, and tools |

**Exam tip**: "Expose existing internal REST APIs and Lambda functions as tools for many agents, with central auth" → **AgentCore Gateway** (MCP). "Agent must remember user preferences across sessions" → **AgentCore Memory** (long-term).

## Deterministic workflows and human approval
LLM agents are **non-deterministic**. When a step must always happen in order, be audited, or require sign-off, put the AI call **inside** a **Step Functions** workflow (optimized integration calls Bedrock directly).

```text
Start --> Bedrock: draft refund decision --> Choice: amount > threshold?
   no  --> Execute refund (Lambda) --> End
   yes --> Task .waitForTaskToken --> SNS/email to approver with token
              approver app --> SendTaskSuccess(token) --> Execute refund
                           --> SendTaskFailure(token)  --> Notify + End
```
- **`.waitForTaskToken`** pauses the execution until `SendTaskSuccess`/`SendTaskFailure` is called with the token; set a **timeout/heartbeat** so it cannot hang forever.
- Requires a **Standard** workflow (long-running, audited history); Express workflows do not support the callback pattern.
- Inside agents, use **return-of-control / inline function tools** (AgentCore harness) or confirmation before sensitive actions.

## Choose the right approach
| Requirement | Answer |
| --- | --- |
| Chatbot over internal PDFs in S3 with citations | **Knowledge Base** + `RetrieveAndGenerate` |
| No team to run a vector DB; SharePoint + Confluence sources | **Managed Knowledge Base** |
| Cheapest vector storage, low query rate | **S3 Vectors** |
| Answers depend on entity relationships | **Neptune Analytics** (GraphRAG) |
| Pooled multi-tenant KB, tenant isolation | **Metadata filtering** on tenant ID (or KB per tenant for silo) |
| Agent calls many internal APIs securely | **AgentCore Gateway** + Identity |
| AI decision needs manager approval before execution | **Step Functions** `.waitForTaskToken` |

## Common exam scenarios
- **Retrieved chunks are too small to answer, but larger chunks reduce precision** → hierarchical chunking.
- **Searches for part numbers return irrelevant results** → hybrid search (keyword + semantic) and/or reranking.
- **New agent project in a fresh account fails to create a Bedrock Agent** → Agents Classic is closed to new accounts; build on AgentCore.
- **AI agent must never issue refunds over a limit, regardless of prompt** → AgentCore Policy on Gateway tool calls (deterministic), or a Step Functions approval step—not prompt instructions.
- **Users see documents from other departments in answers** → metadata filters per user/group, or Managed KB ACL awareness.
