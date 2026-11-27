# Hybrid identity and directory services

Hybrid identity lets users authenticate with their **existing corporate identities** (on-premises Active Directory or a SAML IdP such as Okta, Entra ID, Ping) to reach AWS accounts, AWS-managed applications, and Windows workloads. SAP-C03 tests this in Domain 2 (Security, Compliance, and Governance), Task 2.1 *Design identity security architectures*: pick the right **directory** for the workload and the right **federation** model for workforce vs customer identities. For non-human workloads outside AWS (on-premises servers, other clouds), see **IAM Roles Anywhere**, which issues temporary credentials against X.509 certificates.

## AWS Directory Service options
| | AWS Managed Microsoft AD | AD Connector | Simple AD |
| --- | --- | --- | --- |
| What it is | Real Microsoft AD domain controllers managed by AWS | **Proxy** that redirects requests to your on-prem AD | Samba 4–based AD-compatible directory |
| Stores identities in AWS | Yes | **No**—nothing cached in AWS | Yes |
| Trusts with on-prem AD | **Yes** (one-way or two-way, forest or external) | No (it *is* the on-prem directory) | No |
| Depends on on-prem connectivity | Only for trust-based auth | **Yes, always** (VPN/DX) | No |
| MFA | Yes (RADIUS) | Yes (RADIUS on-prem) | No |
| Scale | Standard and Enterprise editions; add DCs | Small / large sizes | Small / large; low user counts |
| Multi-Region | Multi-Region replication (**Enterprise** edition) | Deploy per Region | No |
| Typical use | AD-aware apps in AWS (SQL Server, FSx for Windows, SharePoint), trust with on-prem | Let on-prem users sign into QuickSight, IAM Identity Center, console, and domain-join EC2 with existing creds | Low-cost basic LDAP/Kerberos for small Linux/Windows estates |

- Managed Microsoft AD deploys **two domain controllers in different AZs** by default; you get delegated admin of an OU, not Domain Admin.
- A Managed Microsoft AD directory can be **shared** with other accounts so their EC2 instances can join the domain seamlessly.

**Exam tip**: "Users must keep using on-prem AD credentials and **no directory data may be stored in AWS**" → **AD Connector**. "AD-dependent apps in AWS must keep working if the on-prem link fails" → **Managed Microsoft AD** with a **trust** (or replicate on-prem AD to self-managed DCs on EC2).

**Exam tip**: Simple AD is a distractor whenever the question mentions **trusts, MFA, or full Microsoft AD features**.

### Trust directions
```text
On-prem forest (corp.local)  ◄── trust ──►  AWS Managed Microsoft AD (aws.corp.local)
One-way: AWS domain trusts on-prem → on-prem users access AWS resources
Two-way: both sides access each other's resources
```
Trusts need network connectivity (DX or VPN) and DNS conditional forwarding between the domains; security groups must allow the AD ports.

## IAM Identity Center (workforce access)
Successor to AWS SSO. Central sign-in to **multiple AWS accounts** in AWS Organizations and to SAML apps.
- **One identity source** at a time: Identity Center directory, **Active Directory** (Managed Microsoft AD or AD Connector), or **external IdP** (SAML 2.0 for authentication + **SCIM** for automatic user/group provisioning).
- **Permission sets** define access; assigning a permission set to a group for an account creates an **IAM role** in that account automatically.
- Supports **ABAC** using user attributes passed as session tags.
- Can delegate administration to a member account rather than using the management account.

| | IAM Identity Center | SAML federation direct to IAM |
| --- | --- | --- |
| Setup per account | None—permission sets provisioned centrally | IAM SAML provider + roles in **every** account |
| User experience | Single portal listing all accounts/roles | IdP app tile per account/role |
| Multi-account at scale | **Least operational overhead** | High overhead |
| Use when | Default for AWS Organizations workforce access | Legacy setups, single account, or custom requirements |

**Exam tip**: "Workforce in Okta/Entra ID needs access to 200 accounts with **least operational overhead**, users and groups kept in sync" → **IAM Identity Center with external IdP (SAML + SCIM)**. Direct SAML to IAM roles in each account is the distractor.

## Cognito for application users
| | **User pools** | **Identity pools** |
| --- | --- | --- |
| Purpose | **Authentication**—user directory, sign-up/sign-in, MFA | **Authorization to AWS**—exchange tokens for temporary AWS credentials (STS) |
| Output | JWTs (ID, access, refresh tokens) | Temporary IAM credentials mapped to IAM roles |
| Federation | Social, SAML, OIDC IdPs into the pool | Accepts user pool, social, SAML, OIDC, developer identities |
| Guest access | No | **Unauthenticated** role supported |
| Typical use | Protect API Gateway/ALB, app login | Mobile app uploads directly to S3/DynamoDB |

**Exam tip**: Cognito is for **customers / app users**; IAM Identity Center is for **employees** accessing AWS accounts and business apps.

## Choose the right approach
| Requirement | Answer |
| --- | --- |
| On-prem users access AWS with existing AD creds, no data in AWS | **AD Connector** |
| Run AD-aware workloads in AWS, trust on-prem forest | **AWS Managed Microsoft AD** + trust |
| Cheap basic directory, small scale, no trusts | **Simple AD** |
| AD available in multiple Regions for DR | Managed Microsoft AD **Enterprise** multi-Region replication |
| Workforce SSO to many AWS accounts | **IAM Identity Center** + permission sets |
| External IdP with automatic user provisioning | Identity Center with **SAML 2.0 + SCIM** |
| Employees sign in with on-prem AD to many accounts | Identity Center with AD (Managed AD or AD Connector) as identity source |
| Mobile app users upload to S3 with temporary creds | **Cognito identity pool** (often with user pool) |
| App sign-up/sign-in with social login | **Cognito user pool** |
| On-prem servers or other clouds need temporary AWS credentials | **IAM Roles Anywhere** (X.509 trust anchor) |

## Common exam scenarios
- **Employees must sign in to QuickSight and the AWS console with on-prem AD passwords** → AD Connector (or Managed AD with trust if AWS-side DCs are needed).
- **On-premises servers (or EKS Hybrid Nodes) need AWS API access without long-term access keys** → IAM Roles Anywhere with certificates from your existing PKI or AWS Private CA.
- **FSx for Windows / RDS SQL Server needs Windows authentication in AWS** → AWS Managed Microsoft AD, trust to on-prem if on-prem users need access.
- **Auditors forbid replicating password hashes into AWS** → AD Connector; it proxies, stores nothing.
- **AD Connector authentication fails during VPN outage** → expected: AD Connector depends on connectivity; use Managed AD + trust or redundant DX/VPN.
- **Company uses Entra ID, wants central AWS access with group-based permissions across the organization** → IAM Identity Center, external IdP, SCIM sync, permission sets per group.
- **Developers need temporary console access via ABAC tags from IdP** → Identity Center attributes for access control mapped to session tags.
- **Mobile game needs guest play and later signed-in progress saved in DynamoDB** → Cognito identity pool with unauthenticated and authenticated roles.
