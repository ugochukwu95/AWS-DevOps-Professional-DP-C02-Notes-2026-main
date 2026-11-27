# Application and workload identity

SAP-C03 skills: 2.1.1, 2.1.2, 2.1.3, 2.1.5

SAP-C03 moves beyond workforce SSO into **who the application's users are**, **how services authenticate to each other**, and **how non-AWS workloads get AWS credentials**. Workforce federation (Identity Center, SAML + SCIM, Directory Service) is covered in **Hybrid Networking / Hybrid identity and directory services**; trust policies, permissions boundaries, `sts:ExternalId`, and confused deputy basics are in **AWS IAM / Roles, federation, and cross-account access**. This file adds the architect-level decisions on top.

## Cognito user pools vs identity pools (deep dive)
| | **User pool** | **Identity pool** |
| --- | --- | --- |
| Question it answers | Who is this user? (**authentication**) | What AWS resources can they touch? (**AWS authorization**) |
| Protocols | **OAuth 2.0 / OIDC** authorization server, SAML 2.0 SP, social IdPs | Exchanges IdP tokens for **STS credentials** |
| Output | **ID token**, **access token**, **refresh token** (JWTs except refresh) | Temporary AWS credentials for an IAM role |
| Role choice | Groups can carry an IAM role claim | Default authenticated/unauthenticated roles, **rules-based** or **token-based** role mapping |
| ABAC | Custom attributes and groups in tokens | **Attributes for access control** maps claims to **session tags** |
| Typical consumer | API Gateway Cognito authorizer, ALB authenticate action, your backend | Mobile/browser app calling S3, DynamoDB, IoT directly |

**Token types**:
- **ID token**: identity claims (email, `cognito:groups`, custom attributes). For the client app; do not send to APIs as an authorization grant unless the authorizer is designed for it.
- **Access token**: carries **scopes**; send this to APIs. Short-lived (default one hour, configurable).
- **Refresh token**: obtains new ID/access tokens without re-login; longer-lived and revocable.

## OAuth 2.0 / OIDC flows to know
```text
Browser/SPA/mobile ──(1) /authorize + code_challenge──▶ Cognito managed login / federated IdP
                   ◀─(2) authorization code─────────────
                   ──(3) /token + code_verifier──────▶ Cognito
                   ◀─(4) ID + access + refresh tokens───
                   ──(5) API call, Bearer access token─▶ API Gateway (Cognito or Lambda authorizer)
```
| Flow | Use for | Notes |
| --- | --- | --- |
| **Authorization code + PKCE** | SPAs, mobile, any public client | Default for user sign-in; PKCE stops intercepted codes being redeemed. No client secret on the device |
| Authorization code (confidential client) | Server-side web apps | Client secret stays on the server |
| **Client credentials** | **Machine-to-machine** (service, batch job, partner system) | App client **with secret** + **resource server** with **custom scopes**; returns access token only, no user |
| Implicit | Legacy only | Tokens in URL fragment; replaced by code + PKCE |

**Exam tip**: "Partner backend calls our API with no human user, must use OAuth scopes" → Cognito **client credentials** grant with a resource server and custom scopes, API Gateway authorizer validating the scope.

## Federation into Cognito
- **Social IdPs** (Google, Apple, Facebook, Amazon) and **OIDC IdPs** federate into the **user pool**; users get a pool profile and pool-issued tokens, so APIs only trust one issuer.
- **SAML 2.0 IdPs** (Entra ID, Okta, ADFS) for B2B customers: one IdP per tenant, route users by email domain (identifier).
- Identity pools can also accept social/SAML/OIDC tokens directly, but federating through the user pool keeps a **single token format** and group model.
- **Multi-tenant SaaS**: tenant context in a custom attribute or group, enforced by the authorizer and by ABAC session tags downstream.

## Amazon Verified Permissions (fine-grained app authorization)
Managed authorization service using the **Cedar** policy language. It externalizes "can this principal do this action on this resource" from application code.
- **Policy store** holds the **schema** (entity and action types), **policies**, and **policy templates**.
- Supports **RBAC** (`principal in Group::"admins"`) and **ABAC** (`when { resource.owner == principal }`, tenant ID matching), with **forbid** overriding **permit**.
- **Identity source**: a Cognito user pool or any OIDC IdP; `IsAuthorizedWithToken` evaluates the token directly.
- **API Gateway integration**: the console can create an **API-linked policy store** that generates a **Lambda authorizer** mapping API methods/paths to Cedar actions and user-pool groups to principals (REST APIs).
- Every decision is an API call that can be logged and audited centrally; policies change without redeploying code.

```text
permit (principal in MyApp::UserGroup::"us-east-1_ABC|managers",
        action in [MyApp::Action::"approve"], resource)
when { resource.tenantId == principal.tenantId };
```

**Exam tip**: Cognito **groups + API Gateway authorizer** handle coarse role checks. "Per-document, per-tenant rules that change often, auditable, without code changes" → **Verified Permissions** with Cedar.

## EKS workload identity: Pod Identity vs IRSA
Basics are in **AWS EKS / DevOps deployments, security, and exam scenarios**. Architect-level differences:

| | **EKS Pod Identity** | **IRSA** |
| --- | --- | --- |
| Trust setup | Trust `pods.eks.amazonaws.com`; association via EKS API | IAM OIDC provider **per cluster**; trust policy per cluster/SA |
| Role reuse across clusters | Same role, no trust policy edits | Trust policy grows with each cluster OIDC issuer |
| ABAC | Automatic **session tags** (cluster, namespace, service account, pod) | Build your own via conditions on `sub` |
| Cross-account | Native **target role** (role chaining) in the association | SDK assumes second role or trust OIDC in other account |
| Runs on | Linux EC2 nodes only | Also **Fargate**, Windows nodes, self-managed Kubernetes on EC2 |

**Exam tip**: New EKS on EC2 with many clusters → **Pod Identity**. Pods on **Fargate** → **IRSA** (Pod Identity is not supported there).

## IAM Roles Anywhere (hybrid and multi-cloud workloads)
Gives servers **outside AWS** (on-premises, other clouds, edge) temporary credentials using **X.509 certificates** instead of long-lived IAM user access keys.
- **Trust anchor**: your CA. Either **AWS Private CA** or an **external CA** bundle (root or intermediate). Certificates from public CAs cannot be trust anchors.
- **Profile**: which IAM roles may be assumed, plus optional session policy and session duration.
- **Role trust policy**: trusts `rolesanywhere.amazonaws.com`; condition on certificate attributes (subject CN/OU, issuer) to bind a role to specific workloads.
- **Credential helper** (`aws_signing_helper`) signs with the private key and plugs into the SDK `credential_process`, so apps use the normal credential chain. Keys can sit in a TPM/PKCS#11 store.
- **Revocation**: import CRLs or enable automatic CRL distribution-point checking on the trust anchor; OCSP is not supported.

```text
On-prem server (cert + private key) ─▶ aws_signing_helper ─▶ Roles Anywhere CreateSession
        trust anchor validates chain ─▶ profile + role ─▶ STS temporary credentials
```

**Exam tip**: "Remove IAM user access keys from on-prem/Azure servers that call S3" → **IAM Roles Anywhere** with the existing enterprise PKI as trust anchor. For SSM-managed hybrid nodes, the **SSM hybrid activation** service role covers the agent only, not the application.

## Least privilege for cross-account and temporary credentials
- **External ID**: third party (SaaS vendor) assumes your role; require `sts:ExternalId` unique per customer to stop the **confused deputy**. For AWS service principals, use `aws:SourceArn` / `aws:SourceAccount` instead.
- **Session policies**: passed on `AssumeRole`/`GetFederationToken`; effective permissions are the **intersection** of role policy and session policy. Use one broad role and scope each session (per tenant, per job).
- **Permissions boundaries**: cap what delegated admins can grant to roles they create.
- **ABAC with session tags**: IdP or Identity Center passes `department`, `project`, `tenant` as **session tags**; policies compare `aws:PrincipalTag/x` with `aws:ResourceTag/x`. Tags can be **transitive** across role chaining. Control who can set tags (`sts:TagSession`, `aws:TagKeys`).

| Need | Mechanism |
| --- | --- |
| Vendor needs read access to your account | Role + `sts:ExternalId` |
| One role, many tenants, scope per request | **Session policy** or ABAC session tags |
| Developers create roles but cannot escalate | **Permissions boundary** |
| Scale permissions without new policies per project | **ABAC** (tags on principal and resource) |

## Choose the right approach
| Requirement | Answer |
| --- | --- |
| Customer sign-up/sign-in with social or SAML login | **Cognito user pool** with federated IdPs |
| Mobile app writes directly to S3 with temporary credentials | **Cognito identity pool** (role mapping, ABAC) |
| SPA or mobile app sign-in | **Authorization code + PKCE** |
| Service-to-service API auth with scopes, no user | **Client credentials** grant, resource server scopes |
| Fine-grained, auditable, per-resource app permissions | **Verified Permissions** (Cedar) |
| Pod credentials on new EKS EC2 clusters | **EKS Pod Identity** |
| Pod credentials on EKS Fargate | **IRSA** |
| On-prem or other-cloud servers need AWS API access | **IAM Roles Anywhere** |
| Third-party account access to your role | Role trust + **external ID** |

## Common exam scenarios
- **B2B customers each want to sign in with their own Entra ID or Okta** → one SAML IdP per tenant in a Cognito user pool, routed by email domain.
- **SPA stores a client secret in JavaScript** → wrong; use a public app client with authorization code + PKCE.
- **API accepts ID tokens and cannot check scopes** → send **access tokens**; authorizer validates scopes.
- **Batch job in another cloud needs DynamoDB access every hour** → IAM Roles Anywhere; certificate attributes in the role trust condition.
- **One role used by many tenants' Lambda invocations must only touch the caller's tenant prefix** → session policy or session tag per invocation, `aws:PrincipalTag/tenant` in resource ARNs.

Folder-wide scenarios are in **Security operations, compliance, and data residency**.
