# Deployment policies, configuration, and extensions

## Deployment policies (high exam value)
When you deploy a new **application version**, the **deployment policy** controls how instances are updated.

| Policy | Behavior | Downtime / capacity | Typical use |
| --- | --- | --- | --- |
| **All at once** | Update **all** instances simultaneously | **Downtime** possible; fastest | Dev, tolerant maintenance windows |
| **Rolling** | Update in **batches**; reduced capacity during deploy | Partial capacity loss during rollout | Prod with acceptable brief capacity hit |
| **Rolling with additional batch** | Starts **extra** batch before updating old instances | Maintains capacity better than plain rolling | Prod web apps |
| **Immutable** | New instances on **temporary ASG**, then **swap** | **Zero-downtime** pattern; clean rollback | Prod, safe releases |
| **Traffic splitting** | **Canary** — send **percentage** of traffic to new version | Test new version with partial users | Canary + metrics/X-Ray validation |
| **Blue/Green** | Separate **environment** (green); swap **CNAME** / traffic | Full cutover; rollback = swap back | Major releases, full isolation |

```text
All at once          Rolling              Immutable
───────────          ───────              ─────────
[v1 v1 v1]           [v1 v1] → [v2 v1]    new ASG [v2 v2]
  ↓ all v2           batches…              swap ALB → retire v1
```

### Choosing a policy (exam)
| Scenario | Best policy |
| --- | --- |
| Fastest deploy; downtime OK | **All at once** |
| Minimize downtime; no second environment | **Immutable** or **Rolling with additional batch** |
| Route 10% users to new version first | **Traffic splitting** |
| Run v2 in parallel env then cut over DNS | **Blue/green** (two environments) |
| Cost-sensitive prod; can tolerate brief capacity drop | **Rolling** |

**Exam trap**: **Traffic splitting** = canary **within one environment**; **Blue/green** = **two environments** (often Route 53 CNAME swap between EB environment URLs).

## Rolling update settings
For rolling policies, configure:
- **Batch size** — count or percentage of instances per batch
- **Minimum healthy** — how many instances must stay InService
- **Health check** — wait for passing health before next batch

Failed batch → deployment fails → **rollback** to previous version (if configured).

## Immutable deployment detail
1. Launch new instances with new version on separate temporary resources.
2. Health checks pass on new fleet.
3. Swap traffic to new instances.
4. Terminate old instances.

Rollback: abort swap or revert to previous application version.

## Traffic splitting (canary)
- Split ALB traffic by **percentage** to new application version.
- Monitor **CloudWatch**, **enhanced health**, **X-Ray** (exam mentions canary validation).
- Increase percentage or finish deploy when healthy.

## Blue/green with Beanstalk
Pattern:
```text
Blue environment (prod)     Green environment (new version)
        ↓                              ↓
   CNAME: myapp.example.com → swap to green URL when validated
```

Often combined with **Route 53** weighted or swap of **EB environment CNAME** (swap environment URLs feature / Route 53 alias).

**Exam tip**: "Validate full new stack before cutover" → **blue/green**, not all-at-once rolling.

## .ebextensions
Configuration files in source bundle: `.ebextensions/*.config` (YAML or JSON).

Capabilities:
| Section | Purpose |
| --- | --- |
| `packages` | Install yum packages |
| `files` | Drop config files on instances |
| `commands` | Run once per deploy (leader or all) |
| `container_commands` | Run **after** app extracted, **before** app server restart |
| `Resources` | Add CloudFormation resources to environment stack |
| `option_settings` | Set namespace options (env vars, JVM heap, proxy, etc.) |

Example intent — set env option:
```yaml
option_settings:
  aws:elasticbeanstalk:application:environment:
    MY_VAR: production
  aws:autoscaling:launchconfiguration:
    InstanceType: t3.small
```

**Exam tip**: Install software or set **environment options at deploy time** from repo → **.ebextensions**, not manual SSH.

## Saved configurations
Snapshot of all environment settings (capacity, VPC, deployment policy, env vars). Apply to **new** or **existing** environments for consistency (dev/staging/prod parity).

## Environment variables and secrets
- **Environment properties** in console/CLI/API.
- Prefer **SSM Parameter Store** or **Secrets Manager** references where supported for secrets — not plaintext in Git.
- `.ebextensions` can set `option_settings` for env vars.

## Worker tier configuration
- **SQS queue** linked to worker environment.
- **Worker daemon** on instances pulls messages and runs your worker code.
- Scale workers on queue depth (Auto Scaling triggers).

Web tier enqueues → worker tier processes (decoupled async).

## Platform updates
- **Platform branch** updates (new Python/Node runtime) are separate from **application version** deploys.
- Schedule platform updates in maintenance windows — can cause instance replacement.

## RDS with Beanstalk
- Can provision **RDS** with environment (coupled) or use **external RDS** (recommended for prod — lifecycle separate from EB environment).
- **Exam trap**: Deleting EB environment may delete **embedded** RDS if created together — use **retain** / external DB for prod.

## Load balancer and HTTPS
- **ALB** listeners, ACM certificates, HTTPS redirect via `.ebextensions` or console.
- Health check path configured on target group / environment.

## Deployment policy vs CodeDeploy
| **Elastic Beanstalk deployment** | **CodeDeploy** |
| --- | --- |
| Built into EB environment update | Separate service for EC2/ECS/Lambda |
| Chosen in EB console/CLI | CodePipeline **CodeDeploy** action |

CodePipeline can use **Elastic Beanstalk deploy action** (not CodeDeploy) for EB apps.

## Configuration exam scenarios
| Scenario | Answer |
| --- | --- |
| Zero-downtime without maintaining two full environments long-term | **Immutable** |
| Canary 5% traffic to new version | **Traffic splitting** |
| Install package on every instance at deploy | **.ebextensions** `packages` / `commands` |
| Run migration script before app restart | **container_commands** |
| Copy prod settings to staging | **Saved configuration** |
| Background job from queue | **Worker tier** + SQS |
| Add ElastiCache cluster to environment stack | **.ebextensions** `Resources` |
