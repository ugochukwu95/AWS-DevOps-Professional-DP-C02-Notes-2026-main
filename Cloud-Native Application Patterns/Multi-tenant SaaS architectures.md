# Multi-tenant SaaS architectures

SAP-C03 skill 1.1.13.

A **tenant** is a customer organisation sharing your SaaS platform. SAP-C03 questions balance three forces: **isolation** (compliance, blast radius), **cost efficiency** (shared infrastructure), and **operational effort** (onboarding, deployment, per-tenant upgrades). The answer usually mixes models—premium tenants siloed, standard tenants pooled—and enforces isolation with **tenant context** carried in every request, not with application `if` statements alone.

## Silo vs pool vs bridge
| Model | What is shared | Isolation | Cost per tenant | Ops effort | Typical fit |
| --- | --- | --- | --- | --- | --- |
| **Silo** | Nothing—stack (or account) per tenant | Strongest; simple compliance story | Highest; idle capacity per tenant | High—N deployments, N upgrades | Regulated/enterprise tier, data residency |
| **Pool** | Compute and storage shared; tenant ID on every item | Logical—enforced by policies | Lowest | Lowest—one deployment | SMB/free tiers, high tenant count |
| **Bridge** (hybrid) | Some layers shared, others siloed (e.g. shared web/API, per-tenant DB) | Mixed | Medium | Medium | Most real SaaS platforms |

```text
Tiering example
Basic tier    -> pooled ECS service + pooled DynamoDB table (tenantId partition key)
Premium tier  -> pooled API layer + dedicated Aurora cluster per tenant
Enterprise    -> dedicated AWS account per tenant (vended by Control Tower / Account Factory)
```

**Exam tip**: "Thousands of small tenants, minimise cost" → pool. "Tenant contract requires dedicated infrastructure and separate audit trail" → silo (account-per-tenant). "Some tenants need dedicated databases but the team wants one code base" → bridge.

## Tenant isolation per layer
| Layer | Silo technique | Pool technique |
| --- | --- | --- |
| Account | **Account per tenant** (Organizations OU, SCPs, separate CloudTrail/billing) | Shared account |
| Network | VPC per tenant; PrivateLink endpoint service per customer | Shared VPC; isolation enforced above network |
| Compute | Dedicated ECS service/EKS namespace/Lambda function per tenant | Shared service; **Lambda tenant isolation mode** keeps execution environments per `tenant-id` |
| IAM | Role per tenant | **ABAC**: assume a shared role with **session tag** `TenantId`; policies reference `${aws:PrincipalTag/TenantId}` (dynamically scoped credentials) |
| DynamoDB | Table per tenant | Partition key prefixed by tenant + condition **`dynamodb:LeadingKeys`** = `${aws:PrincipalTag/TenantId}` |
| RDS/Aurora | Database or cluster per tenant | Shared schema with **PostgreSQL row-level security** policies on `tenant_id`, set via session variable per connection |
| S3 | Bucket per tenant | Prefix per tenant (`tenant-a/...`); policy restricts `s3:prefix` / object ARN to `${aws:PrincipalTag/TenantId}/*`; S3 Access Points per tenant |

The pooled IAM pattern ("token vending"):
```text
JWT (custom:tenant_id = t-42) --> service calls sts:AssumeRole with session tag TenantId=t-42
                               --> temporary creds can only touch items/prefixes/rows for t-42
```
Even a bug that builds the wrong query cannot read another tenant's data, because the **credentials** are tenant-scoped.

## Tenant context with Cognito
- Store tenant identity in a **custom attribute** (`custom:tenant_id`, `custom:tier`) on the user pool, or use one user pool/app client per tenant for silo tiers.
- Use a **pre token generation Lambda trigger** to inject tenant ID, tier and roles into ID/access token claims.
- API Gateway (JWT or Cognito authorizer, or Lambda authorizer) validates the token and passes the claims downstream; services never trust a tenant ID from the request body.
- **Identity pools** can map claims to **principal tags** (attributes for access control) for direct, tenant-scoped AWS access from clients.

## Fine-grained authorization: Amazon Verified Permissions
- Managed **Cedar** policy engine: externalises "can user X do action Y on resource Z" from code.
- Model tenant as an entity attribute (`resource.tenant == principal.tenant`) in a shared **policy store**, or use a **policy store per tenant** for strong separation and per-tenant custom policies.
- Integrates with Cognito tokens (`IsAuthorizedWithToken`) and API Gateway via a Lambda authorizer; decisions are logged for audit.
- Use it for **application-level** permissions (documents, projects, roles within a tenant); IAM/ABAC still guards AWS resource access.

## Tenant-specific encryption
| Approach | Pros | Cons |
| --- | --- | --- |
| **KMS key per tenant** | Tenant can be crypto-shredded (disable/schedule deletion), per-tenant key policy, CloudTrail per key, customer-managed key (BYOK) for enterprise tier | Per-key monthly cost and quota planning at high tenant counts |
| **Shared key + encryption context** `{"tenantId":"t-42"}` | Cheap, scales to many tenants; key policy condition **`kms:EncryptionContext:tenantId`** = `${aws:PrincipalTag/TenantId}` | No per-tenant revoke by key; isolation depends on context enforcement |

**Exam tip**: "Tenant offboarding must make their data unrecoverable" → key per tenant and delete the key. "Proof in CloudTrail of which tenant's data was decrypted" → encryption context appears in CloudTrail logs.

## Noisy neighbour controls
- **API Gateway REST usage plans** per tier with API keys: rate, burst and daily/monthly **quota**; stage/method throttling.
- **SQS fair queues** (2025): set `MessageGroupId` = tenant on a standard queue; SQS prioritises quiet tenants when one tenant builds a backlog—no consumer changes.
- Per-tenant queues or Lambda reserved concurrency for premium tiers; DynamoDB on-demand or provisioned with tenant-sharded keys to avoid hot partitions.
- WAF rate-based rules keyed on a tenant header or JWT claim.

## Tenant onboarding automation
```text
Sign-up --> API --> Step Functions onboarding workflow
            |-- create tenant record (DynamoDB tenant registry), tier, status
            |-- create Cognito user/group, admin invite
            |-- silo tier: vend account / deploy stack (CloudFormation StackSets, CDK pipeline)
            |-- create KMS key or register encryption context, usage plan + API key
            '-- emit TenantOnboarded event (EventBridge) for billing/metrics
```
Deploy updates to all silo stacks through one pipeline (waves, canary tenants first).

## Per-tenant cost attribution
- **Silo**: cost allocation tags (`TenantId`) or account-per-tenant → Cost Explorer, **Cost Categories**, CUR.
- **Pool**: AWS bills do not know tenants—**meter usage** yourself: emit per-tenant metrics (CloudWatch embedded metric format), API Gateway usage plan data, Lambda duration per `tenant-id`, then apportion shared cost.
- **Split cost allocation data** for ECS/EKS allocates container cost by task/pod labels—useful when tenants map to namespaces/services.

## Choose the right approach
| Requirement | Answer |
| --- | --- |
| Lowest cost for many small tenants | **Pool** with ABAC session tags |
| Hard isolation, separate billing and audit | **Account per tenant** (silo) |
| Pooled DynamoDB, prevent cross-tenant reads | **`dynamodb:LeadingKeys`** + tenant-scoped STS credentials |
| Pooled PostgreSQL, enforce in the database | **Row-level security** with session tenant variable |
| Carry tenant identity across services | Cognito **custom attribute** + pre token generation trigger in JWT |
| In-app permissions per tenant role | **Verified Permissions** (Cedar) |
| Crypto-shred on offboarding | **KMS key per tenant** |
| Throttle tiers differently | API Gateway **usage plans** |
| Shared queue starved by one tenant | **SQS fair queues** with MessageGroupId = tenant |

## Common exam scenarios
- **Tenant ID is read from the request body and a user accessed another tenant's records** → derive tenant from validated JWT claims and enforce with tenant-scoped credentials, not request input.
- **Shared Lambda runs customer-supplied scripts; tenants must not share execution environments** → Lambda tenant isolation mode with `tenant-id` on every invoke.
- **Finance needs per-tenant cost in a pooled platform** → per-tenant usage metering (EMF metrics, usage plans) apportioning shared cost; tags alone cannot split pooled resources.
