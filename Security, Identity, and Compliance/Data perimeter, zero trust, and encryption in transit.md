# Data perimeter, zero trust, and encryption in transit

SAP-C03 skills: 2.1.4, 2.2.1, 2.2.2, 2.2.3, 2.2.4

A **data perimeter** is a set of coarse-grained preventive guardrails that ensure only **trusted identities** access **trusted resources** from **expected networks**. SCP and RCP syntax lives in **AWS Organizations / Managing organization policies**; KMS key policies, rotation, and multi-Region keys live in **AWS KMS**. This file ties them into a perimeter design and adds certificates, HSM choices, and post-quantum cryptography.

## The three perimeter questions
```text
              Trusted identities          Trusted resources          Expected networks
Identity side   SCP (my principals →        SCP: aws:ResourceOrgID      SCP: aws:SourceIp /
(my principals)  only my resources)          on my principals            aws:SourceVpc
Resource side   RCP / resource policy:      RCP: restrict who can       RCP / bucket policy:
(my resources)   aws:PrincipalOrgID          reach my resources          aws:SourceVpce
Network side    VPC endpoint policy:        VPC endpoint policy:        (endpoint itself)
                 aws:PrincipalOrgID          aws:ResourceOrgID
```

| Control | Applies to | Typical perimeter job |
| --- | --- | --- |
| **SCP** | Principals in member accounts | My identities can only reach resources in my org, only from my networks |
| **RCP** | Resources in member accounts (S3, KMS, STS, SQS, Secrets Manager and other supported services) | Outsiders cannot reach my resources even if a resource policy is misconfigured |
| **VPC endpoint policy** | Traffic through that endpoint | Code in my VPC cannot exfiltrate to a non-org bucket |
| **Resource policy** | Single resource | Fine-grained exceptions (partner account, specific role) |

## Condition keys for perimeter policies
| Key | Meaning | Typical use |
| --- | --- | --- |
| `aws:PrincipalOrgID` | Org of the **calling principal** | RCP/bucket/endpoint policy: deny if caller not in my org |
| `aws:ResourceOrgID` | Org that owns the **target resource** | SCP/endpoint policy: deny my principals writing to outside buckets |
| `aws:SourceVpce` | VPC endpoint ID the request came through | Bucket policy: only via `vpce-...` |
| `aws:SourceVpc` | VPC the request came through (endpoint traffic only) | Allow any endpoint in a given VPC |
| `aws:SourceIp` | Public IP of caller (not present via VPC endpoints) | Corporate egress ranges |
| `aws:PrincipalIsAWSService` | Caller is an AWS **service principal** (e.g. CloudTrail writing logs) | Exempt services from org/network denies |
| `aws:ViaAWSService` | Request made by a service **on behalf of** a principal (forward access sessions) | Exempt KMS calls made by S3/EBS for the user |
| `aws:PrincipalTag/...`, `aws:ResourceAccount` | Tag or account of principal/resource | Finer exceptions, account allow-lists |

**Exam tip**: Network conditions break AWS service calls. Always pair `aws:SourceVpce` / `aws:SourceIp` denies with `aws:PrincipalIsAWSService = false` and `aws:ViaAWSService = false` exemptions, or CloudTrail, Config, and SSE-KMS will fail.

## IAM Access Analyzer
| Capability | What it finds | When to use |
| --- | --- | --- |
| **External access** analyzer | Resources shared outside the **zone of trust** (account or org): S3, IAM roles, KMS, Lambda, SQS, Secrets Manager, and more | Validate the perimeter continuously |
| **Internal access** analysis | Which principals inside the org can reach critical resources | Least privilege inside the org |
| **Unused access** analyzer (paid) | Unused roles, access keys, passwords, permissions | Right-size permissions at org scale |
| **Policy validation** | Grammar errors, security warnings, best-practice suggestions | IaC linting in pipelines |
| **Custom policy checks** | `CheckNoNewAccess`, `CheckAccessNotGranted`, `CheckNoPublicAccess` | Block a PR that grants new or forbidden access |
| **Policy generation** | Least-privilege policy from CloudTrail activity | Replace broad starter policies |

Run analyzers from a **delegated administrator** (security tooling account) with the **organization** as the zone of trust; findings flow to Security Hub.

## AWS Verified Access (zero trust, no VPN)
Verified Access evaluates **every request** against identity and device posture before reaching a private application.
- **Trust providers**: user identity (**IAM Identity Center** or any **OIDC** IdP) and device posture (third-party device management providers).
- **Policies** written in **Cedar**, attached to a Verified Access **group** (shared policy) and optionally per **endpoint**.
- **HTTP(S) apps**: users connect from a browser through ALB or ENI endpoints; integrates with **AWS WAF**.
- **Non-HTTP (TCP) apps**: SSH, RDP, databases via NLB, ENI, **network CIDR**, or **RDS** endpoints; requires the **Connectivity Client** on the user device.
- Access logs for every decision support audits.

| | Client VPN | **Verified Access** |
| --- | --- | --- |
| Model | Network-level access to VPC CIDRs | **Per-application, per-request** authorization |
| Device posture | Limited | Built in via device trust providers |
| Lateral movement risk | Higher (on the network) | Lower (only the app) |

**Exam tip**: "Contractors need access to one internal web app, identity and device posture checked, no VPN" → **Verified Access**. "SSH to private EC2 without bastion and without VPN" → Session Manager (operators) or Verified Access TCP endpoint (posture-checked user access).

## Certificates: ACM vs AWS Private CA
| | **ACM public** | **ACM exportable public** | **AWS Private CA** |
| --- | --- | --- | --- |
| Trust | Browsers (Amazon Trust Services) | Browsers | Only clients that trust your CA |
| Private key | Never leaves ACM | Exportable (passphrase-encrypted), paid | Exportable for issued private certs |
| Use on | ELB, CloudFront, API Gateway, other integrated services | Integrated services **and** EC2, containers, on-prem | Internal TLS, **mTLS client certs**, IoT, Roles Anywhere trust anchor |
| Renewal | Managed automatically | Managed, redeploy exported copies | Managed for ACM-issued private certs |

ACM certificates for CloudFront must be in **us-east-1**. Exportable public certificates must be requested as exportable at issuance; older certificates cannot be exported.

## TLS policies and mTLS
- **ALB/NLB**: pick a **security policy**; TLS 1.3 policies (`ELBSecurityPolicy-TLS13-...`) are recommended defaults. FIPS and **hybrid post-quantum** policies are available (opt-in per listener).
- **CloudFront**: viewer TLS 1.3 is supported automatically; set a **minimum protocol version** (TLSv1.2_2021 or later) and HTTPS-only viewer and origin policies.
- **mTLS on ALB**: **verify mode** with a **trust store** (CA bundle + optional CRL) or **passthrough mode** (ALB forwards the client cert chain in headers for the app to validate).
- **mTLS on API Gateway**: custom domain name with a **truststore** in S3; disable the default `execute-api` endpoint so clients cannot bypass mTLS.
- Enforce TLS on data APIs: `aws:SecureTransport = false` deny in bucket policies; `s3:TlsVersion` for minimum version.

## Key custody: KMS vs CloudHSM vs custom key stores
| Option | Who holds key material | Choose when |
| --- | --- | --- |
| **KMS (default key store)** | KMS HSMs (FIPS-validated), AWS operated | Default; native service integration, auto-rotation |
| **KMS + imported material** | You generate, KMS stores copy | Must generate keys outside AWS, control expiry |
| **KMS custom key store (CloudHSM)** | **Your CloudHSM cluster** (single tenant) | Regulation requires dedicated HSM but you want KMS integrations |
| **KMS external key store (XKS)** | **Your HSM outside AWS** via an XKS proxy | Keys must never be in AWS; you own availability and latency risk |
| **CloudHSM directly** | Your cluster, PKCS#11/JCE/OpenSSL | Custom crypto, TLS offload, Oracle TDE, signing outside KMS APIs |

**Exam tip**: XKS gives the strongest "hold your own key" story, but if the external HSM or network is down, every KMS call that depends on it fails. Pick it only when the requirement explicitly says keys cannot reside in AWS.

## Post-quantum cryptography
Threat: **harvest now, decrypt later**. Adversaries record TLS traffic today and decrypt it once a quantum computer can break classical key exchange (ECDH/RSA). Symmetric AES-256 at rest is considered quantum-resistant; **asymmetric** key exchange and signatures are what must change.

| Need | AWS answer |
| --- | --- |
| Protect data in transit to AWS APIs | **Hybrid ML-KEM key exchange** (ECDH + ML-KEM, e.g. `X25519MLKEM768`) on KMS, ACM, Secrets Manager, S3 and other endpoints; server side is transparent, you **update clients/SDKs** |
| Verify which calls used PQ TLS | CloudTrail `tlsDetails.keyExchange` |
| Your own internet-facing endpoints | ALB/NLB **PQ TLS policies** (opt-in); CloudFront prefers hybrid PQ for viewers |
| Quantum-resistant **signatures** (firmware, documents, tokens) | KMS asymmetric keys with **ML-DSA** key specs (`ML_DSA_44/65/87`), `SIGN_VERIFY` |
| Quantum-resistant key establishment in your app | KMS **ML-KEM** key specs (encapsulate/decapsulate) |

**Exam tip**: "Long-lived sensitive data sent over TLS today must stay confidential against future quantum attacks" → upgrade clients to **hybrid post-quantum TLS (ML-KEM)**. "Code-signing must resist quantum forgery" → **ML-DSA** KMS signing key. Re-encrypting S3 data is not the answer.

## Choose the right approach
| Requirement | Answer |
| --- | --- |
| No principal outside the org can read our S3/KMS/SQS | **RCP** with `aws:PrincipalOrgID` (+ service exemptions) |
| Our principals cannot write to buckets outside the org | **SCP** or endpoint policy with `aws:ResourceOrgID` |
| S3 reachable only from our VPCs | Bucket policy/RCP with `aws:SourceVpce` or `aws:SourceVpc` |
| Find resources shared externally across org | **Access Analyzer** external access, org zone of trust |
| Fail pipeline if a policy grants new access | Access Analyzer **custom policy checks** |
| VPN-less, posture-checked access to private apps | **Verified Access** |
| Internal service-to-service TLS and client certs | **AWS Private CA** |
| Public cert on EC2/on-prem, managed renewal | **ACM exportable public certificate** |
| Dedicated single-tenant HSM, keep KMS integration | **KMS custom key store** on CloudHSM |
| Keys must stay outside AWS | **XKS** |
| Quantum-safe signatures | **KMS ML-DSA** key |

## Common exam scenarios
- **After adding a `aws:SourceVpce` deny to a bucket, CloudTrail log delivery fails** → add `aws:PrincipalIsAWSService` exemption.
- **SSE-KMS decrypt fails after a network-perimeter SCP** → exempt `aws:ViaAWSService` so S3 can call KMS on the user's behalf.
- **Access Analyzer reports a KMS key trusted by an unknown account** → external access finding; fix the key policy and add an RCP on KMS.
- **TLS app on EC2 needs a browser-trusted cert with auto-renewal** → ACM exportable public certificate (requested as exportable).
- **ALB must accept only clients with company-issued certificates** → ALB mTLS verify mode, trust store with Private CA bundle and CRL.

Folder-wide scenarios are in **Security operations, compliance, and data residency**.
