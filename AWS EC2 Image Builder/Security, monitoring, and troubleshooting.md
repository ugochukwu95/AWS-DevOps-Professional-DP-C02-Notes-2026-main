# EC2 Image Builder security, monitoring, and troubleshooting

## IAM roles
Image Builder typically involves different permission layers:

| Identity | Purpose |
| --- | --- |
| Image Builder service-linked role | Allows the service to manage pipeline resources |
| Build-instance profile | Allows temporary EC2 instances to use Systems Manager and access required artifacts/logs |
| Pipeline operator/CI role | Creates resources and starts or monitors builds |
| Cross-account distribution role | Allows AMI copy/sharing operations in destination accounts |

Use separate roles and least privilege. The build instance should access only required S3 objects, parameters, secrets, ECR repositories, KMS keys, and logging destinations.

Do not grant broad administrator access simply to resolve a build failure. CloudTrail and error messages usually identify the missing action.

## Secrets
- Never place secrets directly in recipes, component YAML, user data, tags, or image names.
- Retrieve secrets at build time from Secrets Manager or Parameter Store using the instance role.
- Ensure secrets are not left in shell history, logs, temporary files, package caches, or the final image.
- Prefer short-lived credentials.
- Treat build logs as sensitive because command output can expose values.

For application credentials, prefer retrieving them at runtime rather than baking them into an image.

## Encryption
Protect:
- Parent and destination EBS snapshots
- S3 component artifacts and build logs
- ECR repositories
- SNS topics
- Secrets and parameters

For cross-account encrypted AMI copies:
- Use a customer-managed KMS key, not an AWS managed key that cannot be shared appropriately.
- Grant destination accounts and Image Builder/distribution roles required key permissions.
- Configure a valid destination-Region KMS key.

KMS policy errors are a common reason why cross-account or cross-Region distribution fails after a successful build.

## Network design
A build in a private subnet may require:
- Systems Manager/Image Builder connectivity
- S3 access for components and logs
- ECR API/Docker endpoints for container images
- CloudWatch Logs
- KMS, Secrets Manager, or Parameter Store
- OS package repositories

Provide connectivity using interface/gateway VPC endpoints where available and NAT/proxy access for public package repositories.

Security group rules usually need outbound HTTPS; inbound SSH is unnecessary for normal builds because Image Builder uses Systems Manager.

## Hardening the image factory
- Use a dedicated image-factory account.
- Restrict who can publish components, recipes, and approved images.
- Require code review for component and pipeline changes.
- Verify downloaded artifacts.
- Scan parent and completed images for vulnerabilities.
- Patch and rebuild frequently rather than maintaining long-lived images.
- Use Organizations policies to constrain sharing and approved Regions.
- Record API activity with CloudTrail.
- Retain build evidence and test results according to compliance requirements.

## Monitoring
| Service | What to monitor |
| --- | --- |
| EventBridge | Pipeline/image state changes |
| SNS | Build notifications configured by infrastructure settings |
| CloudWatch Logs | Service and execution logs |
| S3 | Detailed component/build logs when configured |
| CloudTrail | Image Builder API calls and caller identity |
| Amazon Inspector | Vulnerabilities in supported AMIs |
| ECR scanning | Container-image vulnerabilities |

Create alarms or incident workflows for:
- Repeated pipeline failures
- Pipeline not producing an image within the expected interval
- Vulnerability threshold violations
- Distribution failures in one or more Regions/accounts
- Lifecycle deletion failures

## Troubleshooting workflow
1. Identify the failed stage: build, test, or distribution.
2. Review Image Builder image/pipeline status and error reason.
3. Inspect CloudWatch and configured S3 logs.
4. Check CloudTrail for denied API calls.
5. Preserve the temporary instance on failure when deeper investigation is required.
6. Correct the component, IAM, networking, capacity, quota, or KMS issue.
7. Create a new component/recipe version and rerun.

## Common failures

### Build instance does not start
Check:
- EC2 capacity for selected instance types
- Subnet IP availability
- Security group and subnet validity
- Service quotas
- Instance profile trust and permissions
- KMS access to encrypted parent snapshots

Configure multiple compatible instance types where appropriate to reduce capacity failures.

### Component download or package install fails
Check:
- NAT/proxy/VPC endpoint connectivity
- DNS resolution
- S3 bucket policy and object permissions
- Artifact URL/version and checksum
- Package repository availability
- Component operating-system compatibility

Pinning every package indefinitely improves reproducibility but can block security updates. Use a controlled dependency-update and testing policy.

### Component times out
- Review the component step timeout.
- Avoid interactive commands.
- Use supported reboot actions rather than raw reboot commands.
- Split long operations into observable steps.
- Confirm commands are idempotent after retries.

### Test fails after successful build
The captured image differs from the live build environment. Check:
- Service enablement at boot
- Missing transient files or mount points
- Incorrect startup ordering
- Machine-specific state captured during build
- Network dependency unavailable in the test subnet
- Application health-check timing

Do not bypass the test simply to release the image.

### Distribution fails
Check:
- Destination account role and trust policy
- AMI launch permissions
- KMS key policy and destination key
- Destination Region opt-in/status
- ECR repository permissions
- AMI name conflicts or quotas
- License Manager configuration access

A build can be successful while only one distribution target fails; monitor every target.

### Pipeline did not run on schedule
Check:
- Pipeline is enabled.
- Schedule expression and time zone/UTC assumptions.
- Schedule start condition and dependency-change behavior.
- Required service role still exists.
- No previous execution or quota condition prevents a new run.

## Safe image promotion
Use stages rather than sharing immediately with production:
```text
Build → security scan → functional test → non-production
      → integration test → approval → production distribution
```

Promotion approaches:
- Add production account launch permissions after approval.
- Copy an approved AMI into production accounts.
- Update an SSM public/private parameter that points to the approved AMI ID.
- Update a launch template version and perform an Auto Scaling instance refresh.

Keep the previous approved image and launch-template version for rollback.

## High-value exam scenarios
| Scenario | Solution |
| --- | --- |
| Rebuild patched AMIs every week | Scheduled Image Builder pipeline |
| Install the same security agent in many recipes | Reusable custom component |
| Verify an agent starts after boot | Test component |
| Publish one AMI to many Regions/accounts | Distribution configuration |
| Retire images older than a defined limit | Lifecycle policy |
| Create a golden-image factory | Dedicated account + centralized pipeline |
| Build succeeds but encrypted copy fails | Check destination KMS key and cross-account policies |
| Deploy newly approved AMI to an ASG | New launch-template version + instance refresh |
| Patch existing running instances | Systems Manager Patch Manager, not Image Builder |
| Select latest approved AMI at deployment | Publish approved AMI ID to Parameter Store or controlled pipeline output |

## Exam traps
- Image Builder does not update already-running EC2 instances.
- A recipe describes image contents; infrastructure configuration describes the temporary build environment.
- Successful build does not mean tests or all distribution targets succeeded.
- Cross-account launch permission is not sufficient if encrypted snapshots cannot use the KMS key.
- Disabling a pipeline does not delete its images.
- Deprecating an AMI is different from disabling or deleting it.
- Baking runtime secrets into an image is unsafe even if the AMI is private.
