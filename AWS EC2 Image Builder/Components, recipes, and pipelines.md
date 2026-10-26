# EC2 Image Builder components, recipes, and pipelines

## AWSTOE component structure
A component document uses YAML or JSON and contains phases, steps, actions, and inputs.

```yaml
name: InstallCloudWatchAgent
description: Install and validate the CloudWatch agent
schemaVersion: 1.0

parameters:
  - Region:
      type: string
      default: us-east-1

phases:
  - name: build
    steps:
      - name: InstallPackage
        action: ExecuteBash
        inputs:
          commands:
            - sudo dnf install -y amazon-cloudwatch-agent

  - name: validate
    steps:
      - name: ValidateBinary
        action: ExecuteBash
        inputs:
          commands:
            - test -x /opt/aws/amazon-cloudwatch-agent/bin/amazon-cloudwatch-agent

  - name: test
    steps:
      - name: TestVersion
        action: ExecuteBash
        inputs:
          commands:
            - /opt/aws/amazon-cloudwatch-agent/bin/amazon-cloudwatch-agent --version
```

### Phases
| Phase | Runs | Purpose |
| --- | --- | --- |
| `build` | Build instance, before image creation | Install and configure |
| `validate` | Build instance, before image creation | Verify the build is safe to capture |
| `test` | Test instance launched from resulting image | Confirm the produced image works |

Keep installation in `build`, quick pre-capture checks in `validate`, and post-image smoke/security tests in `test`.

### Common AWSTOE actions
- `ExecuteBash`
- `ExecutePowerShell`
- `ExecuteBinary`
- `S3Download`
- `CreateFile`
- `Reboot`
- `UpdateOS`
- Assertion and file-management actions

Actions differ by operating system and component schema. Components should fail explicitly when validation does not pass.

## Component design best practices
- Make components small, single-purpose, and reusable.
- Pin artifact/package versions where reproducibility matters.
- Verify artifact hashes and signatures.
- Store private artifacts in versioned S3 buckets with least-privilege access.
- Avoid embedding credentials or secrets in component documents.
- Read temporary secrets from Secrets Manager or Parameter Store and remove them before capture.
- Make steps idempotent so retries do not corrupt the build.
- Reboot only through supported component actions so execution resumes correctly.
- Add validation and test phases rather than treating a successful install command as proof.

## Build versus test components
- **Build components** modify and validate the build instance.
- **Test components** run against an instance created from the newly built image.

Tests can check:
- Required service starts after boot
- Package and agent versions
- Filesystem permissions
- Security hardening
- Network/listening ports
- Application health endpoint
- No temporary credentials or build artifacts remain

Disabling tests speeds pipelines but removes an important safety gate. Prefer focused tests and parallelization over skipping validation.

## Recipe composition
```text
Image recipe v2.3.0
├── Parent: approved Amazon Linux AMI
├── AWS component: update-linux
├── Custom component: os-hardening/3.1.0
├── Custom component: cloudwatch-agent/1.4.0
├── Custom component: application/8.7.2
└── Test component: application-smoke-test/2.0.0
```

Ordering matters. For example, patch the OS before installing an application, and test after all configuration is applied.

Create distinct recipe versions for controlled releases. Tag recipes/images with owner, application, environment, source commit, and compliance baseline.

## Pipeline configuration
An image pipeline combines:
1. Recipe
2. Infrastructure configuration
3. Distribution configuration
4. Image tests configuration
5. Schedule
6. Optional custom workflows and logging

### Pipeline status
Pipelines can be enabled or disabled. Disabling prevents scheduled starts but does not delete recipes, images, or configurations.

### Execution stages
Typical lifecycle:
```text
PENDING → CREATING → BUILDING → TESTING → DISTRIBUTING → AVAILABLE
                               ↘ FAILED
```

Exact API states vary by image type and execution stage. Automations should consume documented EventBridge events rather than infer success only from elapsed time.

## Custom workflows
Image Builder supplies default build, test, and distribution workflows. Custom workflows can:
- Add or remove workflow steps
- Run Lambda functions
- Run Systems Manager Automation
- Add manual or external checks
- Control snapshots, test instances, and distribution behavior
- Implement organization-specific approval/integration logic

Components configure the operating system **inside** an image. Workflows orchestrate the Image Builder **pipeline lifecycle**.

## Testing and vulnerability scanning
Defense-in-depth pipeline:
```text
Build/validate components
        ↓
Image Builder test components
        ↓
Amazon Inspector vulnerability scan
        ↓
Policy/approval gate
        ↓
Distribution
```

Amazon Inspector integration can identify package vulnerabilities in supported EC2 AMIs. Define severity thresholds and stop promotion when findings exceed policy.

Scanning is not a replacement for functional tests, and functional tests are not vulnerability scanning.

## Distribution patterns

### Multi-Region
Build once in a central Region, then copy to deployment Regions. Configure Region-specific KMS keys and AMI naming.

### Multi-account
Common pattern:
```text
Image factory account
        ↓ build, scan, approve
Shared-services / deployment accounts
        ↓ launch permitted AMI
Application accounts
```

Centralizing builds reduces duplicated pipelines and gives security teams one controlled golden-image source.

### Container images
A container recipe builds from a parent image, runs supported components, and publishes to ECR. Use ECR image scanning/lifecycle policies and immutable tags or digests for deployment safety.

## CloudFormation resources
Common resources include:
- `AWS::ImageBuilder::Component`
- `AWS::ImageBuilder::ImageRecipe`
- `AWS::ImageBuilder::ContainerRecipe`
- `AWS::ImageBuilder::InfrastructureConfiguration`
- `AWS::ImageBuilder::DistributionConfiguration`
- `AWS::ImageBuilder::ImagePipeline`
- `AWS::ImageBuilder::Image`
- `AWS::ImageBuilder::LifecyclePolicy`
- `AWS::ImageBuilder::Workflow`

Manage pipeline definitions as IaC so component ordering, permissions, schedules, and distribution are reviewable.

## CI/CD integration pattern
```text
Application/base-image change committed
        ↓
CodePipeline or GitHub Actions updates component/recipe
        ↓
StartImagePipelineExecution
        ↓
EventBridge waits for AVAILABLE or FAILED
        ↓
Update launch template to new AMI
        ↓
Auto Scaling instance refresh / blue-green deployment
```

Do not automatically replace production fleets merely because an image built successfully. Promote the immutable image identifier through test environments and retain a known-good rollback image.

## Exam distinctions
- **Component**: Reusable build/test instructions.
- **Recipe**: Parent image plus ordered components.
- **Infrastructure configuration**: Where/how temporary instances run.
- **Distribution configuration**: Where completed images go.
- **Pipeline**: Orchestrates all resources on demand or schedule.
- **Workflow**: Customizes pipeline-stage orchestration.
- **Lifecycle policy**: Retires old images.
