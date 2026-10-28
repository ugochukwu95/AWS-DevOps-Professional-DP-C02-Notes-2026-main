# CodeGuru Reviewer, Profiler, and how they work

## CodeGuru Reviewer workflow

### Repository association
1. Enable CodeGuru Reviewer in the account/Region.
2. **Associate** a repository from CodeCommit, GitHub, Bitbucket, or GitHub Enterprise.
3. Reviewer receives events (e.g., PR opened/updated) and runs analysis.

```text
Pull request opened (associated repo)
        ↓
Incremental code review starts
        ↓
Detectors run (security, leaks, concurrency, AWS APIs, secrets, …)
        ↓
Recommendations → Console + PR UI (+ GitHub Security tab with GitHub Actions)
```

**Full repository review**: broader scan of the codebase — useful for baseline technical debt, not a substitute for unit tests.

### What Reviewer does *not* do
- Replace **compilers** or **linters** for syntax/style only
- Deploy code or run integration tests
- Profile CPU in production (**Profiler** does that)
- Automatically fix code (recommendations only)

### Secrets detection
Reviewer can use a **secrets detector** aligned with **AWS Secrets Manager** patterns to flag **hard-coded credentials** in Java/Python.

**Exam tip**: “Credentials in source” remediation = remove from code, store in **Secrets Manager** or **Parameter Store**, rotate — Reviewer **finds**; you **fix** and re-run review.

### GitHub Actions (documented CI/CD path for Reviewer)
Official integration: **GitHub Marketplace action** runs Reviewer on **push**, **pull_request**, or **schedule**; results in GitHub UI and CodeGuru console.

S3-backed sources are supported through this **GitHub Actions** flow per AWS docs.

### Detector library (conceptual)
Detectors group into **recommendation types** (security, resource leak prevention, etc.). You do not need memorized detector IDs for the exam — know **categories** and that ML/program analysis targets **subtle** defects.

## CodeGuru Profiler workflow

### Profiling group
A **profiling group** names a set of applications that send profiling data to CodeGuru Profiler (e.g., `prod-order-api`).

Each application instance (JVM/Python process) uses the **agent** or **SDK** to upload samples to the profiling group.

### Setup (conceptual)
```text
Create profiling group
        ↓
Attach IAM permissions (agent / execution role can publish profile data)
        ↓
Install agent OR add Python/Java SDK in app / Lambda layer
        ↓
Run application under real load
        ↓
Console: flame graphs, hotspots, anomalies, recommendations
```

Profiler is designed for **continuous** production use with **low overhead** — always-on profiling to catch issues under **real traffic patterns**.

### Visualizations and outputs
| Output | Use |
| --- | --- |
| **CPU flame graphs / hotspots** | Which methods/lines dominate CPU |
| **Anomaly detection** | Regressions vs historical profile |
| **Recommendation reports** | ML suggestions to reduce CPU/cost |
| **Heap summary** (Java only) | Memory-heavy objects over time |

### Where Profiler runs (exam)
| Compute | Notes |
| --- | --- |
| **AWS Lambda** | Profile serverless handlers (Java/Python) |
| **Amazon ECS / Fargate** | Profile containerized services |
| **Amazon EC2** | Profile classic JVM/Python apps |
| **Elastic Beanstalk** | JVM/Python apps on managed EC2 |

**Exam trap**: Profiler needs the **agent/SDK** and correct **IAM** on the runtime — enabling CloudWatch alone does not give line-level CPU recommendations.

## Side-by-side — Reviewer vs Profiler
| | **Reviewer** | **Profiler** |
| --- | --- | --- |
| **Data source** | Source code in Git | Live process (CPU samples, heap for Java) |
| **Best stage** | PR / pre-merge | Production or realistic staging |
| **Languages** | Java, Python | JVM languages + Python 3.6+ |
| **Typical finding** | Secret in repo, leak, unsafe API | Expensive loop, logging on hot path |
| **CI/CD story** | GitHub Actions; CodePipeline via **custom Lambda** | Deploy agent with app; not a pipeline “scan” step |
| **Cost driver** | Code reviews / lines analyzed | Profiling hours |

## Enforcing Reviewer in AWS CI/CD (no native CodePipeline action)

There is **no first-class CodePipeline action** for CodeGuru Reviewer (unlike CodeBuild or CodeDeploy).

Pattern for **fail pipeline on critical findings**:

```text
CodePipeline custom action → Lambda (job worker)
        ↓
CreateCodeReview (or use existing) + poll DescribeCodeReview until Completed
        ↓
ListRecommendations → apply threshold (e.g. fail on High severity count)
        ↓
PutJobSuccessResult OR PutJobFailureResult (with CodePipeline jobId)
```

Same **Invoke Lambda** pattern as other quality gates; **CodeBuild** can alternatively run a script that calls Reviewer APIs and exits non-zero.

**Exam tip**: “Block deployment if static analysis fails” with **CodePipeline** → **Lambda** + Reviewer API + **PutJobFailureResult**, or run analysis **before** merge on PR (Reviewer / Q Developer) so bad code never enters the deploy pipeline.

**Profiler** is a poor fit for **gating deploy** — it needs a **running** application; use it for **continuous optimization** after release.

## Operational best practices
| Practice | Product |
| --- | --- |
| Fix Reviewer findings **before** merging to main | Reviewer |
| Run full repo scan periodically for legacy debt | Reviewer |
| Enable Profiler in **prod** (or prod-like) for true hotspots | Profiler |
| Combine Profiler with **CloudWatch** alarms on latency/CPU | Both |
| Store secrets in **Secrets Manager**; re-scan after rotation | Reviewer |

## Troubleshooting (exam-relevant)
| Symptom | Likely cause |
| --- | --- |
| No PR recommendations | Repo not **associated**; wrong Region; unsupported language |
| Reviewer never triggers on CodeCommit PR | Association broken; use supported provider flow |
| Profiler empty dashboard | Agent not installed; wrong profiling group name; IAM deny |
| Lambda shows no profile | Missing layer/agent; cold-only traffic too sparse (still exam: “enable Profiler on Lambda”) |
| Pipeline “quality gate” never runs | Used Profiler instead of Reviewer pre-merge, or missing Lambda job worker |

## Quick review checklist
- [ ] Reviewer = static, Java/Python, PR incremental vs full repo
- [ ] Profiler = runtime, JVM + Python, Lambda/ECS/EC2
- [ ] Secrets: Reviewer detects; Secrets Manager stores
- [ ] No native CodePipeline Reviewer action — Lambda + APIs
- [ ] 2025: no **new** Reviewer associations — know Q Developer / Inspector alternatives
- [ ] Heap visualization: Java only
