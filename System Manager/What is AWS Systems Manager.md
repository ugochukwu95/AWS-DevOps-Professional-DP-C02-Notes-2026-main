# What is AWS Systems Manager?

AWS Systems Manager provides centralized visibility and control for AWS, hybrid, multicloud, and edge compute resources. It helps operators securely access nodes, run commands, enforce configuration, patch operating systems, automate runbooks, manage parameters, and investigate operational issues at scale.

## Core capabilities
| Area | Systems Manager capability |
| --- | --- |
| Secure node access | Session Manager |
| Fleet-wide commands | Run Command |
| Desired configuration | State Manager |
| Operating-system patching | Patch Manager |
| Scheduled operational work | Maintenance Windows |
| Multi-step workflows | Automation runbooks |
| Software distribution | Distributor |
| Fleet metadata | Inventory |
| Configuration and secrets | Parameter Store |
| Operational issue tracking | OpsCenter |
| Fleet view and setup | Fleet Manager and Quick Setup |

## Managed nodes
A **managed node** is a machine configured for Systems Manager. It can be:
- An EC2 instance
- An on-premises server or virtual machine
- A VM in another cloud
- An edge device supported by Systems Manager

### Requirements
1. **SSM Agent** installed and running. It is preinstalled on many AWS-provided AMIs.
2. **IAM permissions**:
   - EC2 commonly uses an instance profile with `AmazonSSMManagedInstanceCore`.
   - Hybrid nodes register using a Systems Manager **hybrid activation** and receive a managed-node IAM role.
3. Outbound HTTPS access to Systems Manager endpoints, using internet/NAT connectivity or interface VPC endpoints such as `ssm` and `ssmmessages`.
4. Supported operating system and accurate system time.

Systems Manager does not require inbound SSH or RDP ports. The SSM Agent initiates outbound connections to the service.

### Default Host Management Configuration
Default Host Management Configuration can automatically manage eligible EC2 instances in a Region without manually attaching an instance profile to every instance. Use it when you want organization-wide onboarding; use explicit instance profiles when workloads need tightly controlled per-instance permissions.

## Main node-management features

### Session Manager
Provides browser or CLI shell access without bastion hosts, SSH keys, or inbound ports.
- Access is controlled with IAM and can be restricted using resource tags.
- Session activity and metadata can be audited with CloudTrail.
- Session output can be sent to CloudWatch Logs or S3 and encrypted with KMS.
- Supports port forwarding and SSH tunneling through an SSM session.

**Important**: Session Manager cannot log the encrypted contents of SSH or port-forwarding sessions.

### Run Command
Runs commands remotely and concurrently across managed nodes.
- Target explicit node IDs, resource tags, or resource groups.
- Use SSM documents such as `AWS-RunShellScript` and `AWS-RunPowerShellScript`.
- Control concurrency and tolerated failures with `MaxConcurrency` and `MaxErrors`.
- Send command output to CloudWatch Logs or S3.
- Use SNS or EventBridge for status notifications and automation.

Run Command is for immediate or one-time execution; State Manager is for maintaining a desired configuration.

### State Manager
Creates **associations** between managed nodes and SSM documents.
- Runs on a schedule or when association configuration changes.
- Installs agents, enforces settings, runs scripts, and reports compliance.
- Reapplies configuration when scheduled, making it suitable for drift correction.

### Patch Manager
Scans or installs operating-system patches and reports compliance.
- **Patch baseline** defines approved/rejected patches and auto-approval delays.
- **Patch group** associates nodes with a baseline using tags.
- Use `AWS-RunPatchBaseline` for scan or install operations.
- Patch policies in **Quick Setup** provide centralized patching across accounts and Regions.
- Schedule patching with Maintenance Windows and use State Manager associations for recurring scans.

Patch Manager patches operating systems and selected applications; it does not replace application deployment tooling.

### Maintenance Windows
Schedules potentially disruptive tasks during approved periods.
- Define schedule, duration, cutoff, targets, and registered tasks.
- Tasks can invoke Run Command, Automation, Lambda, or Step Functions.
- The **cutoff** prevents new tasks from starting near the end of the window; it does not terminate work already running.

### Fleet Manager
Provides a console UI to inspect and manage nodes, including processes, files, users, logs, and performance data, without direct RDP or SSH access.

## Automation
Automation runbooks define multi-step operational workflows using YAML or JSON SSM documents.
- Actions can call AWS APIs, run commands or scripts, invoke Lambda, branch, wait, approve, and roll back.
- Use an `AutomationAssumeRole` so the workflow has the permissions required for its actions.
- Run against one resource, many resources, multiple accounts, or multiple Regions.
- AWS-managed runbooks cover common operations; create custom runbooks for organizational procedures.
- Change Manager can add approval and scheduling controls around operational changes.

### Run Command vs Automation vs State Manager
| Requirement | Use |
| --- | --- |
| Execute one command on a fleet now | Run Command |
| Orchestrate several AWS and node actions | Automation |
| Continuously enforce node configuration | State Manager |
| Run approved tasks at a maintenance time | Maintenance Windows |

## Parameter Store
Parameter Store provides hierarchical storage for configuration data and secrets.

| Parameter type | Storage |
| --- | --- |
| `String` | Plaintext string |
| `StringList` | Comma-separated plaintext values |
| `SecureString` | Encrypted with AWS KMS |

- Organize parameters using paths such as `/prod/payments/db/host`.
- Control access with IAM and path-based permissions.
- Reference parameters from CloudFormation, Lambda, ECS, CodeBuild, and other services.
- Standard and advanced parameter tiers differ in size, limits, policies, and cost.
- Parameter policies can set expiration or change-notification behavior.

**Parameter Store vs Secrets Manager**:
- Use Parameter Store for configuration and lower-cost secret storage when built-in rotation is unnecessary.
- Use Secrets Manager for managed secret rotation, generated credentials, and database-focused integrations.

## Quick Setup
Quick Setup configures Systems Manager capabilities consistently across accounts and Regions. Common uses include:
- Host management
- Patch policies
- Resource Scheduler
- Distributor package deployment
- CloudWatch agent setup

With AWS Organizations, use delegated administration and target OUs for centralized fleet configuration.

## Observability and audit
- **CloudTrail** records Systems Manager API activity and session metadata.
- **CloudWatch Logs/S3** can receive session and command output.
- **Compliance** reports State Manager association and patch status.
- **EventBridge** reacts to command, automation, and compliance state changes.
- **Explorer/OpsCenter** aggregate operational data and OpsItems for investigation.

## Exam distinctions
- No inbound ports or bastion required → **Session Manager**
- One-time fleet command → **Run Command**
- Enforce configuration repeatedly → **State Manager**
- Patch during an approved period → **Patch Manager + Maintenance Windows**
- Multi-step remediation across services → **Automation**
- Store encrypted configuration without automatic rotation → **Parameter Store SecureString**
- EC2 memory/disk metrics → **CloudWatch agent**, often deployed using Systems Manager
