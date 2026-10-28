# CodeGuru DevOps integrations, security, and exam scenarios

## Where CodeGuru fits in the DevOps lifecycle

```text
Plan / code
    └── CodeGuru Reviewer (PR) — quality & security before merge
Build
    └── CodeBuild (unit tests, compile) — complementary, not replacement
Deploy
    └── CodePipeline → CodeDeploy / ECS / Lambda / CloudFormation
Operate
    └── CodeGuru Profiler — CPU/memory hotspots under real load
    └── CloudWatch — SLOs, alarms, logs
Govern
    └── AWS Config — resource compliance (not source review)
```

**Exam tip**: **Shift-left** static analysis (**Reviewer**) vs **shift-right** performance tuning (**Profiler**).

## Integrations by AWS service

### AWS CodeCommit
- Associate repository with **CodeGuru Reviewer** (existing associations only after Nov 2025).
- Incremental reviews on pull requests; recommendations in console and PR.

### GitHub / Bitbucket / GitHub Enterprise
- OAuth / connection to associate repos.
- **GitHub Actions** marketplace action for Reviewer in CI workflows.
- Recommendations can appear in **pull request** and **GitHub Security** tab.

### AWS CodePipeline
| Goal | Approach |
| --- | --- |
| Deploy after build | Standard CodeBuild → deploy actions (unchanged) |
| **Fail pipeline on Reviewer** | **Lambda** custom action: Reviewer API + **PutJobFailureResult** |
| **Profile after deploy** | Install Profiler on deployed compute — not a Pipeline built-in stage |

Reference pattern in community/AWS guidance: `CreateCodeReview` → poll `DescribeCodeReview` → `ListRecommendations` → threshold → `PutJobSuccessResult` / `PutJobFailureResult`.

### AWS CodeBuild
- CodeBuild runs tests and builds; optionally invoke Reviewer APIs in a **build phase** and `exit 1` on severity threshold.
- CodeBuild does **not** replace Reviewer ML detectors — use together.

### AWS Lambda
- **Profiler**: enable profiling group + agent/layer for Java/Python functions.
- **Reviewer**: analyzes **source** in Git, not the deployed zip/image alone.

### Amazon ECS / Fargate / EC2
- **Profiler** on JVM/Python services in tasks or instances.
- Container **image** vulnerabilities → **ECR scanning** / **Inspector** — different from Reviewer source scan.

### AWS Secrets Manager
- Reviewer **secrets detector** flags embedded secrets.
- Remediation: migrate to Secrets Manager, IAM-scoped access, rotation — align with **IAM** and **KMS** notes.

## IAM and access (exam level)
| Actor | Typical need |
| --- | --- |
| **Developer** | View recommendations in console / PR (read-only policies) |
| **CI Lambda / CodeBuild role** | `codeguru-reviewer:CreateCodeReview`, `DescribeCodeReview`, `ListRecommendations`, … |
| **Profiler agent / task role** | Publish profile data to profiling group (e.g. managed policy for Profiler agent) |
| **Cross-account** | Less common in exam; profiler and reviewer are usually same account as repo/compute |

Use **least privilege** — pipeline gate Lambda only needs Reviewer read/create in target repo scope.

**Exam trap**: Profiler agent credentials on EC2 = **instance profile** or **task role** — do not embed long-lived keys in application code (Reviewer would flag that).

## Security and compliance patterns
| Risk | Mitigation |
| --- | --- |
| Hard-coded AWS keys in Java/Python | Reviewer + Secrets Manager; never commit |
| SQL injection / weak crypto | Reviewer security detectors; fix before merge |
| Production performance degradation | Profiler anomalies + CloudWatch alarms |
| Deploying vulnerable **dependencies** | **SCA** — Q Developer / Inspector Code Security (Reviewer focus is code patterns) |
| Non-compliant **S3 bucket policy** | **Config** rule, not CodeGuru Reviewer |

## CodeGuru vs Amazon Q Developer vs Inspector (2026 awareness)
| Capability | CodeGuru Reviewer | Amazon Q Developer | Inspector (Code Security) |
| --- | --- | --- | --- |
| Static code review Java/Python | Yes (legacy assoc.) | Yes (IDE, GitHub, GitLab) | Focus on **vuln scan** in repos |
| Dependency / SCA | Limited / scenario-dependent | Yes | Yes |
| New repo onboarding (2025+) | **No new associations** | Primary AWS direction | GitHub/GitLab discovery |

For the exam: if the question says **“CodeGuru Reviewer”**, answer with Reviewer behavior. If it says **“new greenfield static analysis on GitLab”**, **Q Developer** is the modern AWS answer.

## High-value exam scenarios
| Scenario | Correct approach |
| --- | --- |
| Find security flaws and leaks in Java PR before merge | **CodeGuru Reviewer** incremental review (or **Q Developer** on new projects) |
| Identify most expensive lines in production Python on ECS | **CodeGuru Profiler** |
| Reduce Lambda CPU cost after launch | **CodeGuru Profiler** on function + apply recommendations |
| Block CodePipeline if code review finds critical issues | **Lambda** + Reviewer API + **PutJobFailureResult** |
| Continuous profile with minimal overhead in prod | **CodeGuru Profiler** (always-on design) |
| Detect hard-coded DB password in source | **Reviewer** secrets detection → move to **Secrets Manager** |
| Audit whether SG allows 0.0.0.0/0 on port 22 | **AWS Config** rule — not CodeGuru |
| Scan Docker image for CVEs | **ECR enhanced scanning** / **Inspector** |
| Run unit tests and package artifact | **CodeBuild** |
| GitHub PR checks with AWS ML code review | **Reviewer GitHub Action** or **Q Developer** |

## Exam traps
- **Reviewer** analyzes **Git source**; **Profiler** needs **running** JVM/Python — different lifecycle stages.
- **Only Java and Python** for Reviewer — not Node, Go, C# (unless question names another service).
- **Profiler heap summary** — **Java only**; Python gets CPU profiling, not heap viz per AWS feature table.
- **No native CodePipeline Reviewer action** — Lambda custom job or PR-time review.
- **CodeGuru does not deploy code** — CodePipeline/CodeDeploy do.
- **Config vs Reviewer** — infrastructure compliance vs application source defects.
- After **Nov 2025**, “create new Reviewer association” is **wrong** for greenfield — cite **Q Developer** / **Inspector** when scenario implies net-new setup.

## Trunk-based development alignment (exam narrative)
AWS guidance and community patterns place **Reviewer at PR time** so **main stays deployable**. Using Profiler **after** deploy closes the loop on **performance regressions** under real load — not on syntax or secrets in a branch.

```text
Feature branch → PR → Reviewer (must pass team policy)
        ↓ merge
Main → Pipeline → Prod
        ↓
Profiler monitors → ticket if anomaly / recommendation
```

## Related notes in this repo
- **CodePipeline** — Lambda invoke, custom actions, `PutJobFailureResult`
- **CodeBuild** — buildspec phases; optional API calls in build
- **CodeCommit** — source control with PR workflow
- **AWS KMS / Secrets Manager** — secret storage after Reviewer findings
- **Amazon CloudWatch** — metrics with Profiler
- **ECR** — image scanning vs source review
- **AWS Config** — resource compliance (contrast with Reviewer)

## Quick review checklist
- [ ] Reviewer vs Profiler purpose and timing
- [ ] Java/Python only (Reviewer); JVM + Python (Profiler)
- [ ] Incremental vs full repository review
- [ ] GitHub Actions for Reviewer CI/CD
- [ ] CodePipeline gate via Lambda + Reviewer APIs
- [ ] Secrets Manager + Reviewer secrets detector
- [ ] 2025 Reviewer association limit + Q Developer / Inspector
- [ ] Config / ECR / CodeBuild distractors
