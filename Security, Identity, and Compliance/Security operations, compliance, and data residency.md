# Security operations, compliance, and data residency

SAP-C03 skills: 2.3.2, 2.3.5, 2.3.6, 2.4.1–2.4.6

SAP-C03 expects a security operations design for the whole organization: one place for logs and findings, automated compliance and patching, provable data residency, and evidence for auditors. Service mechanics are in **AWS Config** (aggregators, conformance packs), **AWS Security Hub** (standards, ASFF, central configuration), **AWS Control Tower**, and **System Manager**. This file covers the cross-service architecture and ends with the folder-wide decision table and scenarios.

## Centralized security logging architecture
```text
Member accounts (all Regions)
  CloudTrail org trail ─────────────┐
  Config recorders ─▶ aggregator ───┤        Log Archive account: S3 (Object Lock, KMS, RCP)
  VPC Flow, R53 Resolver, WAF, EKS ─┼─▶ Security Lake (OCSF, rollup Region) ─▶ subscribers (SIEM, Athena)
  GuardDuty, Inspector, Macie ──────┴─▶ Security Hub CSPM / Security Hub (delegated admin, Security Tooling account)
```

| Service | Org-wide pattern | Notes |
| --- | --- | --- |
| **CloudTrail org trail** | Created in management account (or delegated admin), all accounts and Regions, to Log Archive S3 | Members cannot disable it; add data events selectively (cost); log file validation for integrity |
| **Config aggregator** | Organization aggregator in delegated admin account | Read-only inventory and compliance view; rules still evaluate per account/Region |
| **GuardDuty** | Delegated admin, **auto-enable** for new accounts, all Regions | Threat detection (CloudTrail, VPC Flow, DNS, EKS, S3, runtime, malware protection) |
| **Security Hub CSPM** | Delegated admin, **central configuration**, cross-Region aggregation to a home Region | Standards (FSBP, CIS, PCI DSS, NIST) as control checks; findings in **ASFF** |
| **Security Hub** (new, GA Dec 2025) | Same delegated admin model | Correlates GuardDuty, Inspector, CSPM, Macie into **exposure** findings; uses **OCSF** |
| **Amazon Security Lake** | Delegated admin; contributing Regions replicate to a **rollup Region** | Normalizes AWS and custom sources to **OCSF** in S3 (Glue Data Catalog, Lake Formation tables) |

**Naming trap**: the service previously called Security Hub is now **AWS Security Hub CSPM** (posture checks, ASFF). The newer **AWS Security Hub** sits on top and correlates findings. Exam wording "Security Hub CSPM" means compliance standards and control checks.

### Security Lake details
- **Sources**: CloudTrail management and data events, VPC Flow Logs, Route 53 Resolver query logs, Security Hub findings, EKS audit logs, WAF logs, plus **custom sources** that must already be in OCSF.
- **Subscribers**: **data access** (S3 object notifications via SQS or HTTPS endpoint) or **query access** (Lake Formation tables queried with Athena, Redshift Spectrum, Spark). Access is granted per source and per Region; a rollup Region gives one subscriber multi-Region data.
- **Rollup Regions** also serve residency: keep EU data rolled up in an EU Region and US data in a US Region.
- Retention and storage-class transitions are configured per Region.

**Exam tip**: "Third-party SIEM needs normalized security logs from all accounts with least ops effort, no custom ETL" → **Security Lake** subscriber. "Single dashboard of compliance scores" → **Security Hub CSPM**.

CloudTrail Lake stopped accepting new customers on May 31, 2026; for new designs, query the org trail in S3 with Athena or use Security Lake.

## Vulnerability scanning and patching
| Scope | **Amazon Inspector** coverage |
| --- | --- |
| EC2 | Package and network reachability findings; agent-based (SSM Agent) or agentless (EBS snapshot) scanning; CIS benchmark assessments |
| ECR | **Enhanced scanning** on push and continuously as new CVEs appear (replaces ECR basic scanning) |
| Lambda | Standard scanning (dependencies) and **code scanning** (function code) |
| **Code Security** | SAST, SCA (dependencies), and **IaC** scans of GitHub/GitLab repositories on pull request, push, or schedule |

- Enable through a **delegated administrator** with auto-enable for new accounts; findings go to Security Hub and EventBridge; SBOM export for supply-chain audits.
- **SSM Patch Manager**: **patch baselines** (approval rules, auto-approve after N days, rejected patches) define what is compliant. **Patch policies** created with **Quick Setup** apply scan/install schedules across **OUs and Regions** from the management or delegated admin account.
- Close the loop: Inspector finding → EventBridge → SSM Automation (patch or rebuild AMI with Image Builder) → Inspector rescan auto-closes the finding.

## Data residency and sovereignty
| Control | What it enforces |
| --- | --- |
| **Region deny SCP** | Deny when `aws:RequestedRegion` not in approved list, with `NotAction` exemptions for **global services** (IAM, Organizations, STS, Route 53, CloudFront, WAF, support, billing) and break-glass role exemptions |
| **Control Tower Region deny** | Landing-zone control (all governed OUs) or configurable **OU control** with allowed Regions, exempted principals, exempted actions; cannot deny the home Region |
| **S3 replication restriction** | SCP deny `s3:PutReplicationConfiguration` (or allow only to approved destination buckets/roles); RCP to block cross-org access |
| **KMS key location** | Single-Region keys by default; deny `kms:CreateKey` with `kms:MultiRegion = true` and deny `kms:ReplicateKey` to stop keys leaving the jurisdiction |
| **Backup and snapshot copies** | Restrict cross-Region copy in backup policies and SCPs (`ec2:CopySnapshot`, AWS Backup copy actions) |
| **AI inference** | Bedrock cross-Region inference profiles can route requests across Regions; restrict to geography-scoped profiles or deny via SCP where residency is strict |

- **AWS European Sovereign Cloud**: a separate partition (`aws-eusc`, first Region in Brandenburg, Germany) with its own IAM, Organizations, billing, and endpoints, operated by EU residents. Cross-partition features (AssumeRole, S3 replication, TGW peering, RAM) do not work, so you run a separate landing zone.
- Residency is a combination: Region deny + data transfer restrictions + KMS keys in-Region + logs kept in an in-Region Log Archive.

## Compliance evidence and audit trails
- **AWS Artifact**: on-demand **reports** (SOC, ISO, PCI DSS attestation) and **agreements** such as the HIPAA **BAA**; accept agreements for the whole organization from the management account. This is AWS's side of shared responsibility.
- **AWS Audit Manager**: maps evidence to frameworks, but entered **maintenance mode** (no new customers from April 30, 2026). For new designs, use **Config conformance packs**, Security Hub CSPM standards, and CloudTrail evidence.
- **Regulated audit trail**: org trail to a dedicated Log Archive account, S3 **Object Lock** (compliance mode), SSE-KMS with restricted key policy, log file validation, RCP/bucket policy denying deletes.
- **AI services**: CloudTrail records Bedrock API calls but not prompts and responses; enable **Bedrock model invocation logging** to CloudWatch Logs or S3 for prompt/response audit. See the **AI and ML Architecture** folder for Guardrails and AgentCore controls.

## Threat modeling and risk assessment
- **STRIDE**: Spoofing (→ strong authn, mTLS), Tampering (→ integrity, signing, Object Lock), Repudiation (→ CloudTrail, log validation), Information disclosure (→ encryption, perimeter), Denial of service (→ Shield, WAF, quotas), Elevation of privilege (→ least privilege, boundaries).
- **Threat Composer**: open-source AWS tool for structured threat statements, data-flow diagrams, assumptions, and mitigations, exportable as JSON for version control (also in the AWS Toolkit for VS Code).
- Run threat modeling at design time and on major changes; feed mitigations into Config rules, SCPs, and pipeline checks. Use the **Well-Architected Security pillar** review for risk tracking.

## Choose the right approach
| Requirement | Answer |
| --- | --- |
| Org-wide API audit that members cannot turn off | **CloudTrail organization trail** to Log Archive |
| Normalized (OCSF) security data lake for SIEM | **Security Lake** + subscribers |
| Compliance score against CIS/FSBP across org | **Security Hub CSPM** central configuration |
| Correlated exposure view (vuln + public + sensitive data) | **Security Hub** |
| Inventory and config compliance across accounts | **Config organization aggregator** |
| Continuous CVE scanning for EC2, ECR, Lambda | **Amazon Inspector** delegated admin |
| SAST/IaC scanning of repositories | **Inspector Code Security** |
| Org-wide patch schedule | **Patch Manager patch policy** via **Quick Setup** |
| Workloads only in approved Regions | **Region deny SCP** / **Control Tower Region deny** |
| Prevent data copies leaving jurisdiction | SCP deny replication/copy + single-Region KMS keys |
| Download SOC 2 report or accept BAA | **AWS Artifact** |
| Audit prompts and responses of Bedrock | **Model invocation logging** + CloudTrail |
| Customer sign-in, social and SAML | **Cognito user pool** |
| M2M API auth with scopes | Cognito **client credentials** |
| Fine-grained app authorization | **Verified Permissions** |
| On-prem servers without access keys | **IAM Roles Anywhere** |
| Block outsiders from org resources | **RCP** + `aws:PrincipalOrgID` |
| VPN-less private app access | **Verified Access** |
| Quantum-safe transit and signatures | **ML-KEM hybrid TLS** + **ML-DSA** KMS keys |

## Common exam scenarios
- **Mobile app users upload photos straight to their own S3 prefix** → Cognito user pool + identity pool, ABAC/policy variable on `cognito-identity.amazonaws.com:sub`; no backend proxy.
- **Partner system calls our API nightly, no user** → Cognito client credentials grant with custom scopes; API Gateway authorizer checks scope.
- **SaaS needs per-tenant, per-record permissions that product teams change weekly** → Verified Permissions with Cedar ABAC policies, Lambda authorizer.
- **Twenty EKS clusters need the same S3 role without editing trust policies per cluster** → EKS Pod Identity (session tags for namespace scoping).
- **Same requirement but pods run on Fargate** → IRSA; Pod Identity does not support Fargate.
- **On-prem build servers use IAM user access keys flagged by audit** → IAM Roles Anywhere with enterprise CA (or Private CA) as trust anchor, credential helper.
- **SaaS vendor assumes role in hundreds of customer accounts** → external ID per customer to prevent confused deputy.
- **Ensure no S3 bucket in the org is readable by outside principals, even if a bucket policy is wrong** → RCP denying when `aws:PrincipalOrgID` differs, with `aws:PrincipalIsAWSService` exemption.
- **Code in VPC must not upload to personal S3 buckets** → S3 gateway endpoint policy with `aws:ResourceOrgID` (or SCP).
- **Pipeline must fail if a CloudFormation change makes a resource public** → Access Analyzer `CheckNoPublicAccess` / `CheckNoNewAccess` in the pipeline.
- **Contractors need a private web app and an internal database, device posture required, no VPN** → Verified Access HTTP endpoint plus TCP endpoint with Connectivity Client.
- **Clients must present certificates to call the API** → API Gateway or ALB mTLS with a trust store from AWS Private CA.
- **Regulation: keys must never be stored in AWS** → KMS external key store (XKS); accept availability dependency.
- **Dedicated HSM required, still want SSE-KMS on S3 and EBS** → KMS custom key store backed by CloudHSM.
- **Security team worried about harvest-now-decrypt-later on data sent to KMS and Secrets Manager** → update SDKs/clients for hybrid ML-KEM TLS; verify in CloudTrail `tlsDetails`.
- **Firmware signatures must remain trustworthy for 20 years** → KMS ML-DSA signing key.
- **Splunk needs all accounts' CloudTrail, VPC Flow, and GuardDuty data in one schema** → Security Lake rollup Region + subscriber.
- **EU data must stay in EU Regions, IAM and CloudFront must keep working** → Region deny SCP or Control Tower Region deny with global service exemptions; EU rollup Region for logs.
- **Prevent anyone replicating regulated buckets to US Regions** → SCP denying `s3:PutReplicationConfiguration` except an approved role, single-Region KMS keys.
- **Auditor asks for AWS's PCI DSS attestation and HIPAA BAA** → AWS Artifact; customer-side evidence from Config conformance packs and CloudTrail.
- **Critical CVE published; find every affected EC2, container image, and Lambda across the org and patch** → Inspector delegated admin findings, EventBridge to SSM Automation / Patch Manager patch policy, rebuild images.
