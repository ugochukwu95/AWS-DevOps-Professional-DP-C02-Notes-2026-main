# What is Amazon CodeGuru?

**Amazon CodeGuru** is AWS’s ML-assisted **code quality** and **application performance** family. For DOP-C02, know the two products and **when each belongs in the pipeline**:

| Product | When it runs | What it finds |
| --- | --- | --- |
| **CodeGuru Reviewer** | **Before / during code review** (PR, branch scan) | Defects, security issues, secrets, AWS API misuse — **static** analysis |
| **CodeGuru Profiler** | **In running applications** (prod/stage) | Hot paths, high CPU lines, heap trends — **runtime** profiling |

```text
Developer writes Java/Python
        ↓
CodeGuru Reviewer (PR or full repo) → fix before merge
        ↓
CI/CD build & deploy
        ↓
CodeGuru Profiler (always-on, low overhead) → tune CPU/memory/cost
```

**Exam tip**: **Reviewer** = shift-left **quality/security** on source. **Profiler** = **production performance** feedback loop. Do not swap them.

## CodeGuru Reviewer (static analysis)
Uses program analysis and ML (trained on AWS and open-source patterns) to flag issues that are **hard to catch in manual review** — not basic syntax errors.

Typical recommendation categories:
- **Security** (injection, weak crypto, unsafe patterns)
- **Resource leaks** (connections, streams, handles)
- **Concurrency** bugs
- **Input validation**
- **AWS SDK / service best practices**
- **Secrets in code** (integrates with **Secrets Manager** secrets detector)

### Supported languages and sources
| Languages | **Java**, **Python** |
| Source providers | **CodeCommit**, **GitHub**, **GitHub Enterprise**, **Bitbucket** |
| S3 as source | Via **GitHub Actions** only (not classic console association alone) |

### Review types
| Type | Trigger |
| --- | --- |
| **Incremental** | Pull request on an **associated** repository — scans **changed lines** |
| **Full repository** | On-demand or scheduled — broader baseline scan |

Incremental reviews are the default DevOps story: recommendations appear in the **CodeGuru console** and often **inside the pull request**.

## CodeGuru Profiler (runtime profiling)
Collects **live runtime** data from JVM and Python apps, builds a **profiling group**, and surfaces **ML-powered recommendations** (e.g., logging routine consuming CPU vs business logic).

Supported runtimes (exam level):
| | **Java / JVM** | **Python 3.6+** |
| --- | --- | --- |
| CPU profiling | Yes | Yes |
| AWS Lambda & other compute | Yes | Yes |
| Anomalies & recommendation reports | Yes | Yes |
| Heap summary visualization | Yes | No |

Deploy on **EC2**, **ECS**, **Fargate**, **Lambda**, and other supported compute — profile with **real traffic**, not only synthetic tests.

## Availability change (2025 — still exam-relevant)
As of **November 7, 2025**, you **cannot create new CodeGuru Reviewer repository associations**. **Existing** associations continue to work.

AWS points similar **static review / security** workloads to:
| Service | Role |
| --- | --- |
| **Amazon Q Developer** | SAST, secrets, dependency (SCA), quality — IDE, **GitHub**, **GitLab** |
| **Amazon Inspector** (Code Security) | Discovers and scans **GitHub/GitLab** repos for vulnerabilities and exposure |

**Exam tip**: Questions written before 2025 still say “associate CodeCommit with CodeGuru Reviewer.” Newer scenarios may mention **Q Developer** or **Inspector** instead — the **pattern** (automated review before merge) is the same.

**CodeGuru Profiler** is unchanged for **runtime** optimization questions.

## CodeGuru vs other tools (selection)
| Need | Service |
| --- | --- |
| ML code review on Java/Python PRs | **CodeGuru Reviewer** (legacy associations) / **Q Developer** (greenfield) |
| Find hottest lines in prod Lambda | **CodeGuru Profiler** |
| Block non-compliant **AWS resources** after deploy | **AWS Config** rules (not CodeGuru) |
| Container image OS/library CVEs | **ECR scanning** / **Inspector** for images |
| Unit test and compile in pipeline | **CodeBuild** (not CodeGuru) |
| Third-party SonarQube in pipeline | Custom CodeBuild step or third-party — not native CodeGuru |

**Exam trap**: **Config** records and evaluates **resource configuration**; it does **not** review application source code. **Reviewer** reviews **code**, not CloudFormation stacks (unless you scan IaC elsewhere).

## Pricing awareness (high level)
| Product | Model (awareness) |
| --- | --- |
| **Reviewer** | Monthly charge includes incremental PR analysis for onboarded repos; full scans may bill separately |
| **Profiler** | Billed for **profiling hours** while the agent collects data |

Exact pricing changes — exam cares about **capability**, not cents per line.

## Related services in your notes
| Service | Relationship |
| --- | --- |
| **CodeCommit / GitHub** | Source for Reviewer associations |
| **CodePipeline / CodeBuild** | Build and deploy; optional **Lambda** gate on Reviewer API results |
| **Secrets Manager** | Reviewer secrets detector; store secrets instead of hard-coding |
| **CloudWatch** | Metrics/alarms for app health; complements Profiler findings |
| **Lambda / ECS / EC2** | Common Profiler targets |

**Exam tip**: DOP-C02 CodeGuru items test **Reviewer vs Profiler placement**, **language support**, **PR vs production**, and **how to enforce quality in CI/CD** — not detector library internals.
