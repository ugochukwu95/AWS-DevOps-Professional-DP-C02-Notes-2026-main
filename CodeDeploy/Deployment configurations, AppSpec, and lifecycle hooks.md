# Deployment configurations, AppSpec, and lifecycle hooks

## In-place vs blue/green
| | **In-place** | **Blue/green** |
| --- | --- | --- |
| **Instances/tasks** | Update same fleet in place | New fleet/task set (green) + old (blue) |
| **Downtime** | Minimized via batches; brief per batch | Near zero when traffic shift is controlled |
| **Rollback** | Redeploy previous revision | Shift traffic back to blue / terminate green |
| **Load balancer** | Optional (deregister during hook) | **Required** for traffic shifting (ALB/NLB/CLB) |
| **Platforms** | EC2, on-prem | EC2, ECS, Lambda, EKS (with AppSpec) |

```text
In-place                         Blue/green
────────                         ──────────
[v1][v1][v1]                     blue: [v1][v1]
  ↓ batch update                 green: [v2][v2]  (new)
[v2][v1][v1]                           ↓
  ↓                                      shift ALB traffic v1 → v2
[v2][v2][v2]                           ↓
                                       retire blue
```

## Deployment configurations
Controls **how many targets** update concurrently (in-place) or **how traffic shifts** (blue/green).

### EC2 / on-premises (in-place) examples
| Config | Behavior |
| --- | --- |
| **CodeDeployDefault.OneAtATime** | One instance at a time — safest, slowest |
| **CodeDeployDefault.HalfAtATime** | Half of fleet per batch |
| **CodeDeployDefault.AllAtOnce** | All at once — fast, risky |

Custom configs: minimum healthy hosts, maximum concurrent updates.

### Lambda (traffic shifting)
| Config type | Behavior |
| --- | --- |
| **Canary** | e.g. `Canary10Percent5Minutes` — 10% then rest after interval |
| **Linear** | e.g. `Linear10PercentEvery1Minute` — gradual shift |
| **AllAtOnce** | Immediate alias cutover |

Uses **Lambda aliases** (`PROD` → version weights).

### ECS (blue/green)
Traffic routing via **Application Load Balancer** or **Network Load Balancer**:
- **Canary** / **Linear** / **AllAtOnce** deployment configurations
- Creates **green** task set, shifts listener rules/target groups, drains **blue**

**Exam tip**: "Gradually move 10% traffic per minute to new ECS tasks" → **Linear** deployment configuration on **CodeDeploy ECS**.

## AppSpec file
Platform-specific YAML — defines **what to deploy** and **hooks** to run.

### EC2 / on-premises AppSpec (simplified)
```yaml
version: 0.0
os: linux
files:
  - source: /
    destination: /var/www/html
hooks:
  BeforeInstall:
    - location: scripts/stop_server.sh
      timeout: 300
  ApplicationStart:
    - location: scripts/start_server.sh
  ValidateService:
    - location: scripts/validate.sh
```

| Section | Purpose |
| --- | --- |
| `files` | Copy revision files to instance paths |
| `permissions` | chmod/chown |
| `hooks` | Scripts at lifecycle points |

Revision **must** include `appspec.yml` at root (or configured path).

### ECS AppSpec (simplified)
Specifies **TaskDefinition**, load balancer info, container name/port, optional hooks for **BeforeAllowTraffic** validation.

```yaml
version: 0.0
Resources:
  - TargetService:
      Type: AWS::ECS::Service
      Properties:
        TaskDefinition: arn:aws:ecs:us-east-1:123456789012:task-definition/my-app:3
        LoadBalancerInfo:
          ContainerName: web
          ContainerPort: 8080
Hooks:
  - BeforeAllowTraffic: ValidateGreenTasks
    AfterAllowTraffic: NotifyDeployComplete
```

Revision is often **`appspec.yaml`** alongside **`taskdef.json`** (image, CPU/memory) in the pipeline artifact.

### Lambda AppSpec (simplified)
Specifies **function name**, alias, current/target versions, optional hooks.

```yaml
version: 0.0
Resources:
  - MyFunction:
      Type: AWS::Lambda::Function
      Properties:
        Name: my-api
        Alias: PROD
        CurrentVersion: "5"
        TargetVersion: "6"
Hooks:
  - BeforeAllowTraffic: PreTrafficValidation
    AfterAllowTraffic: PostTrafficValidation
```

Traffic shift percentages come from the deployment group’s **Canary** / **Linear** config, not from AppSpec.

### EKS AppSpec (simplified)
Identifies the **EKS service** (namespace + name) for blue/green; manifests (Deployment, Service, Ingress) ship in the revision — traffic routing uses ALB/NLB with the controller, same pattern as ECS task sets.

```yaml
version: 0.0
Resources:
  - TargetService:
      Type: AWS::EKS::Service
      Properties:
        Cluster: my-cluster
        Name: my-service
        Namespace: default
Hooks:
  - BeforeAllowTraffic: ValidateGreenPods
    AfterAllowTraffic: NotifyDeployComplete
```

## Lifecycle hooks — EC2 / on-premises
Executed by **CodeDeploy agent** on instances:

| Hook | Typical use |
| --- | --- |
| **ApplicationStop** | Stop app, drain connections |
| **DownloadBundle** | (Managed) Download revision |
| **BeforeInstall** | Prep directories |
| **Install** | (Managed) Copy files |
| **AfterInstall** | Config files, migrations |
| **ApplicationStart** | Start services |
| **ValidateService** | Smoke test before marking success |

Failure in hook → instance deployment failed → deployment may stop/rollback per config.

## Lifecycle hooks — blue/green (EC2, ECS, Lambda, EKS)
Traffic management hooks — often implemented with **Lambda** functions:

| Hook | Purpose |
| --- | --- |
| **BeforeBlockTraffic** | Pre-checks before deregistering old |
| **BlockTraffic** | Deregister blue targets from load balancer |
| **AfterBlockTraffic** | Cleanup after traffic blocked |
| **BeforeAllowTraffic** | Validate green (metrics, synthetics) |
| **AllowTraffic** | Register green targets |
| **AfterAllowTraffic** | Final validation, notify |

```text
Deploy green
        ↓
BeforeAllowTraffic (Lambda: run tests)
        ↓
AllowTraffic (shift ALB)
        ↓
AfterAllowTraffic (Lambda: notify)
        ↓
Terminate blue (optional wait period)
```

**Exam tip**: "Run integration tests before ALB sends traffic to new version" → **BeforeAllowTraffic** Lambda hook.

## Load balancer integration
- **EC2 blue/green**: ALB, NLB, or CLB — register/deregister instances or IP targets.
- **ECS**: Listener rules / target groups for blue and green task sets.
- **EKS**: Ingress + target groups similar pattern.

Health checks must pass before traffic shifts.

## Automatic rollback
| Trigger | Behavior |
| --- | --- |
| **Deployment failure** | Stop and rollback to previous revision (when enabled) |
| **CloudWatch alarm** | Rollback after deployment if alarm enters ALARM during bake time |

Enable **automatic rollback** on deployment group for prod.

**Exam tip**: "Rollback prod if 5xx rate alarm fires after deploy" → CodeDeploy **alarm-based rollback** + CloudWatch alarm on ALB metrics.

## Deployment group targeting
| Target type | Selection |
| --- | --- |
| **EC2** | Tag group, Auto Scaling group, or explicit instances |
| **On-premises** | Tag or configuration |
| **ECS** | Cluster + service name |
| **Lambda** | Function name |

One deployment group = one platform type per application (best practice).

## CodeDeploy vs Elastic Beanstalk deployment policies
| **CodeDeploy** | **Elastic Beanstalk** |
| --- | --- |
| Works with raw EC2/ASG/ECS/Lambda you manage | Integrated PaaS environment |
| AppSpec + agent (EC2) | `.ebextensions` + EB policies |
| CodePipeline **CodeDeploy** action | CodePipeline **Elastic Beanstalk** action |

Same **ideas** (rolling, blue/green, canary) — different products.

## Hook and config exam scenarios
| Scenario | Answer |
| --- | --- |
| One EC2 instance at a time | **OneAtATime** |
| Lambda canary 10% then 100% | **Canary** deployment config |
| Stop app before copying files | **ApplicationStop** hook |
| Validate before marking deploy OK (EC2) | **ValidateService** |
| Test green before ALB cutover | **BeforeAllowTraffic** Lambda |
| Gradual ECS traffic shift | **Linear** config + blue/green |
| Deploy without replacing ASG | **In-place** |
| Parallel new fleet + cutover | **Blue/green** |
