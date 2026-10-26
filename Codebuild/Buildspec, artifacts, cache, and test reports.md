# Buildspec, artifacts, cache, and test reports

## buildspec overview
The **buildspec** file (`buildspec.yml` or `buildspec.yaml`) defines what CodeBuild runs. It can live in the **source repository root** or be **inline** in the project/pipeline configuration.

```yaml
version: 0.2

env:
  variables:
    NODE_ENV: production
  parameter-store:
    API_ENDPOINT: /prod/api/endpoint
  secrets-manager:
    DB_PASSWORD: prod/db:password

phases:
  install:
    runtime-versions:
      nodejs: 20
    commands:
      - npm ci
  pre_build:
    commands:
      - npm run lint
  build:
    commands:
      - npm test
      - npm run build
  post_build:
    commands:
      - aws s3 sync dist/ s3://$ARTIFACT_BUCKET/release/

artifacts:
  files:
    - '**/*'
  base-directory: dist

cache:
  paths:
    - node_modules/**/*
    - ~/.npm/**/*

reports:
  unit-tests:
    files:
      - 'reports/junit.xml'
    file-format: JUNITXML
```

## Phases
| Phase | Typical use |
| --- | --- |
| **install** | Install runtimes (`runtime-versions`) and dependencies |
| **pre_build** | Lint, login to ECR/CodeArtifact, generate config |
| **build** | Compile, unit tests, security scans |
| **post_build** | Package, push Docker image, tag, deploy prep commands |
| **build finally** (optional) | Cleanup that runs even if earlier phases fail |

Each `commands` entry runs in the shell; **any non-zero exit code fails the phase** unless you handle it.

## buildspec with CodePipeline
When source is **CODEPIPELINE**:
- Input artifacts appear under **`$CODEBUILD_SRC_DIR`** (primary) and **`$CODEBUILD_SRC_DIR_<identifier>`** for secondary sources.
- Output artifacts defined in `artifacts` section are passed to the next pipeline stage.
- Pipeline can override **environment variables** and **buildspec** path per action.

```text
Pipeline Source stage → output artifact (source zip)
        ↓
CodeBuild action → input: source artifact
        ↓
buildspec build + artifacts section
        ↓
Output artifact → Deploy stage (CloudFormation, CodeDeploy, ECS)
```

## Environment variables
| Type | Source | Exam note |
| --- | --- | --- |
| **Plaintext** | Project or buildspec `env.variables` | Not for secrets |
| **Parameter Store** | `env.parameter-store` | SecureString supported; IAM on service role |
| **Secrets Manager** | `env.secrets-manager` | JSON key reference `secret-id:json-key` |
| **Exported variables** | `export` in commands | Available in later phases in same build |

Built-in variables include `AWS_DEFAULT_REGION`, `CODEBUILD_BUILD_ID`, `CODEBUILD_RESOLVED_SOURCE_VERSION`, `CODEBUILD_WEBHOOK_*` (when webhook-triggered).

**Exam trap**: Never put passwords in plaintext env vars in Git — use **Parameter Store** or **Secrets Manager** with the service role.

## Artifacts
| Output type | Use |
| --- | --- |
| **S3** | Direct upload to bucket (project artifact settings) |
| **CodePipeline** | `artifacts` in buildspec; next stage consumes |
| **No artifacts** | Docker-only push to ECR in post_build, or tests only |

Artifact settings:
- `files` — glob patterns
- `base-directory` — relative path for files
- `name` — optional artifact name
- `discard-paths` — flatten directory structure
- `secondary-artifacts` — multiple named outputs for pipeline

Encrypted artifacts require KMS permissions on the service role and bucket/key policies.

## Cache
Speeds rebuilds by reusing dependencies between builds.

| Cache mode | Behavior |
| --- | --- |
| **No cache** | Default if not configured |
| **S3 cache** | Project-level bucket/path; buildspec `cache.paths` defines what to save |
| **Local cache** | `LOCAL_SOURCE_CACHE`, `LOCAL_CUSTOM_CACHE` on supported images |

Cache paths examples:
- `node_modules/**/*`, `~/.m2/**/*`, `~/.gradle/caches/**/*`, `/root/.cache/pip/**/*`

**Exam tip**: "Builds are slow because npm downloads every time" → **S3 or local cache** for dependency directories.

Cache is **best-effort** — not guaranteed hit every build.

## Docker builds in CodeBuild
Typical pattern in **post_build**:
```bash
aws ecr get-login-password | docker login --username AWS --password-stdin $ECR_URI
docker build -t $IMAGE_TAG .
docker push $ECR_URI:$IMAGE_TAG
```

Requirements:
- **Privileged mode** enabled on project
- Service role: ECR auth, `ecr:BatchCheckLayerAvailability`, `PutImage`, etc.
- Consider **image scanning** in ECR on push

## Batch builds (parallel test execution)
**Batch build** runs multiple builds in parallel from one start request — useful for **matrix testing** (multiple runtimes, browsers, or shard tests).

| Concept | Purpose |
| --- | --- |
| **Batch configuration** | Defines matrix of env overrides |
| **Build list** | Parallel child builds |
| **Aggregate status** | Overall pass/fail for the batch |

**Exam tip**: "Run integration tests in parallel across 10 shards to reduce wall-clock time" → **batch build**, not 10 separate projects manually.

## Test reports
CodeBuild can ingest test results into **report groups** for visibility in console and pipeline.

Supported formats (exam awareness):
- **JUnit XML**
- **Cucumber JSON**
- **TestNG XML**
- **NUnit XML**

```yaml
reports:
  my-reports:
    files:
      - 'test-results/**/*.xml'
    file-format: JUNITXML
    base-directory: .
```

Failed tests can fail the build when configured. Reports require IAM permissions on the service role for `codebuild:CreateReportGroup`, `CreateReport`, `UpdateReport`, etc.

## Multiple sources in one build
```yaml
version: 0.2
env:
  variables:
    APP_DIR: src/app
phases:
  build:
    commands:
      - cd $CODEBUILD_SRC_DIR && npm run build
      - cp $CODEBUILD_SRC_DIR_config/shared.yml $APP_DIR/
```

Secondary source identifier appears in env var suffix (e.g. `_config`).

## buildspec best practices (DevOps exam)
- Keep **build** and **deploy** separated — deploy stage uses narrower IAM.
- Use **`npm ci` / locked dependencies** for reproducible builds.
- Pin **runtime-versions** in buildspec.
- Run **security scans** (e.g. `cfn-nag`, `npm audit`, container scan) in build or test phase.
- Output **immutable version tags** (commit SHA) for container images.
- Use **artifacts** for CloudFormation templates and packaged apps, not live deploy credentials.

## Common buildspec mistakes (traps)
| Mistake | Fix |
| --- | --- |
| Secrets in Git or plaintext env | Secrets Manager / Parameter Store |
| Docker build fails | Enable **privileged mode** |
| Wrong working directory | `cd` or set `base-directory` |
| Pipeline can't find buildspec | Set `Buildspec` path in project or repo root |
| Tests pass but not visible | Configure **reports** section + permissions |
| ECR push denied | Service role ECR + `get-login-password` region match |
