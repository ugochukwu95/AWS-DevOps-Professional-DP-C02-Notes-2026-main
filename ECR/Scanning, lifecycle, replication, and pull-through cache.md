# ECR scanning, lifecycle, replication, and pull-through cache

## Image scanning

### Basic scanning
- On-push scan using **Clair**-based CVE database (legacy basic mode — exam may still reference "scan on push").
- Configure at **repository** or **registry** level: scan on push enabled/disabled.
- Results in console/API; **scan findings** can trigger workflows.

### Enhanced scanning (Amazon Inspector)
- **Enhanced scanning** uses **Amazon Inspector** for broader OS and language package coverage and **continuous** re-scan when new CVEs publish.
- Registry setting: **Enhanced** vs **Basic** scanning configuration.

```text
docker push → ECR
        ↓
Scan triggered (on push and/or continuous)
        ↓
Findings: CRITICAL / HIGH / MEDIUM / LOW / INFORMATIONAL
        ↓
Optional: EventBridge → block deploy if CRITICAL
```

**Exam tip**: "Block deployment when critical vulnerabilities found" → **Scan on push** + **EventBridge** on scan complete + pipeline gate — or policy in CI failing on scan API.

### Scanning in CI/CD
- CodeBuild pushes image → poll/describe scan findings or wait for EventBridge `ECR Image Scan` event.
- Fail build if severity threshold exceeded.
- Do not rely only on console review for prod.

## Lifecycle policies
Automatically **expire** images matching rules — reduce storage cost and attack surface from stale images.

Example rule intents:
| Rule | Action |
| --- | --- |
| Keep last **30** images | Expire older tagged images |
| Delete **untagged** images older than **1 day** | Clean failed CI pushes |
| Keep `prod-*` tags longer | Tag prefix priority rules |

Lifecycle runs on a schedule; **does not** delete images currently referenced by running tasks if configured carefully — verify rule logic (exam: "remove untagged images from failed builds" → lifecycle policy).

```json
# Conceptual rule priority
Priority 1: expire untagged if older than 1 day
Priority 2: keep last 10 any tag
```

Test policies with **preview** before enabling in prod.

## Replication
Copy images from a **source** Region/account to **destination** Region/account automatically.

Use cases:
- **Multi-Region DR** — ECS/EKS in eu-west-1 pulls local replica
- **Central build account** → replicate to workload accounts
- **Compliance** — copy to audit/log-archive patterns (less common)

Configuration:
- **Registry replication configuration** — rules with destinations
- Cross-account replication requires destination **registry policy** permissions
- Replicates **new** images matching filters (tag filters supported)

```text
Build account us-east-1 (golden images)
        ↓ replication
Prod account eu-west-1 ECR
        ↓
ECS/EKS pulls locally (lower latency, no cross-account pull at deploy time)
```

**Exam tip**: "Single CI in one account/Region, deploy same image globally" → **ECR replication**, not re-build in every Region (unless question wants independent builds).

## Pull through cache
Creates an **ECR repository** that **caches** images from an **upstream** registry (Docker Hub, Quay, Kubernetes registry, another ECR, etc.).

```text
ECS/EKS pulls from your ECR pull-through repo
        ↓
ECR fetches from upstream if not cached / stale
        ↓
Image stored in your private registry
```

Benefits:
- Avoid Docker Hub rate limits
- Private VPC pulls without public internet to Docker Hub
- Consistent IAM on `ecr:*` only

Limitations (exam awareness):
- **Pull through cache** images may not support all features (e.g. **blob mounting** excluded for cached images per AWS docs)
- Upstream credentials via **Secrets Manager** for private upstreams

**Exam tip**: "Cache public Docker images in AWS for ECS" → **ECR pull through cache rule**.

## Repository creation templates
Apply defaults when new repositories are created:
- Scanning mode
- Encryption (KMS key)
- Repository policy snippet
- Lifecycle policy template
- Tag immutability

Use with **Organizations** / IaC for **golden standards** — aligns with Control Tower / landing zone governance.

## Blob mounting
Within the **same registry** (same account + Region), repositories can **share layers** to save storage and push time.

Requirements:
- Same encryption type and KMS key
- Not for pull-through cached images
- Disablement does not break existing images

Exam: minor cost/performance detail — know it exists for duplicate layer optimization.

## Managed signing
Automatically **sign images on push** for supply chain verification. Consumers verify signatures before deploy (policy engines, admission controllers).

DevOps exam: awareness-level — pairs with **immutable tags** and **digest pinning**.

## Image tag immutability
When enabled on a repository, a tag **cannot be overwritten** once applied.

**Exam tip**: Prevent prod tag `latest` or `v1` from being replaced by accidental push → **tag immutability**.

## OCI artifacts
ECR also stores **OCI-compatible artifacts** (Helm charts, etc.) in some configurations — exam may mention as distractor; primary focus remains container images.

## Feature selection table
| Scenario | Feature |
| --- | --- |
| Auto-delete untagged CI images | **Lifecycle policy** |
| CVE scan every push | **Scan on push** / enhanced scanning |
| Same image in us-east-1 and eu-west-1 | **Replication** |
| Pull `nginx` from Docker Hub via private ECR | **Pull through cache** |
| Standardize encryption on all new repos | **Repository creation templates** |
| Prevent tag overwrite | **Tag immutability** |
| Reduce duplicate layer storage | **Blob mounting** (same registry) |
