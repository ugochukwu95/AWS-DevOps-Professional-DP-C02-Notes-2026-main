# Systems Manager automation and operational patterns

## SSM documents
An SSM document defines actions that Systems Manager performs. Documents use YAML or JSON and have a document type.

| Document type | Used by |
| --- | --- |
| Command | Run Command, State Manager, Maintenance Windows |
| Automation | Automation workflows |
| Session | Session Manager preferences and session type |
| Package | Distributor |
| Change template | Change Manager |

- **AWS-owned documents**: Maintained by AWS, such as `AWS-RunShellScript`.
- **Customer-owned documents**: Custom runbooks and commands in your account.
- **Shared documents**: Shared privately across accounts or publicly.
- Documents support parameters and versions; set a default version for execution.

## Safe fleet execution
When running commands or automations across many nodes:
1. Select targets by tags or resource groups.
2. Test on a small canary group.
3. Set low `MaxConcurrency` and `MaxErrors`.
4. Capture output in CloudWatch Logs or S3.
5. Monitor status through EventBridge/SNS.
6. Expand deployment in waves after verification.

Example:
```text
Targets: PatchGroup=Production
MaxConcurrency: 10%
MaxErrors: 1%
```

This limits blast radius while still operating in parallel.

## Multi-account and multi-Region operations
- Configure a Systems Manager delegated administrator with AWS Organizations where supported.
- Use Quick Setup to target organizational units, accounts, and Regions.
- Automation can run across accounts and Regions by assuming configured IAM roles.
- Store logs centrally and use Resource Data Sync to aggregate Inventory/Explorer data.

## Common automation patterns

### Automated remediation
```text
AWS Config detects noncompliance
        ↓
Systems Manager Automation runbook
        ↓
AWS API action or Run Command remediates resource
        ↓
Config reevaluates compliance
```

Use an AWS-managed remediation runbook when available. Grant the automation role only the actions and resources needed by the runbook.

### Patch workflow
```text
Patch policy/baseline defines approved patches
        ↓
Maintenance Window selects tagged nodes
        ↓
AWS-RunPatchBaseline scans or installs
        ↓
Patch compliance reported to Systems Manager
        ↓
EventBridge/SNS reports failures
```

For production, patch canary nodes first, then roll through larger groups. Remember that installation can require a reboot depending on the selected reboot option and patch.

### Secure administration
```text
Operator authenticates with IAM Identity Center
        ↓
IAM authorizes StartSession for tagged nodes
        ↓
Session Manager connects through SSM Agent
        ↓
CloudTrail records metadata; output goes to Logs/S3
```

Use resource tags and session preferences to control who can connect, which shell profile runs, session duration, logging, and KMS encryption.

## Event-driven operations
EventBridge can respond to:
- Run Command status changes
- Automation execution status changes
- Maintenance Window task status
- State Manager association state changes
- OpsItem events

Typical targets include Lambda, Step Functions, SNS, SQS, and another Automation runbook.

## Troubleshooting managed nodes
If a node does not appear in Systems Manager:
1. Confirm SSM Agent is installed, running, and current.
2. Verify the instance profile or hybrid managed-node role.
3. Check outbound HTTPS/DNS connectivity to Systems Manager endpoints.
4. Confirm VPC endpoint security groups and private DNS when using PrivateLink.
5. Verify system time and proxy configuration.
6. Review SSM Agent logs on the node.

If a command remains `Pending`, the node is commonly offline, lacks endpoint connectivity, or has not polled the service. `DeliveryTimedOut` means delivery did not complete within the command timeout; `ExecutionTimedOut` means the command began but exceeded its execution timeout.

## Security best practices
- Prefer Session Manager over direct SSH/RDP and remove unnecessary inbound rules.
- Restrict `ssm:SendCommand`, `ssm:StartSession`, and document access using tags and conditions.
- Prevent users from bypassing approved documents by limiting which document ARNs they can execute.
- Separate the operator identity from the Automation execution role.
- Encrypt session logs, command output, and `SecureString` parameters with customer-managed KMS keys where required.
- Do not place secrets directly in command-line parameters because API requests and audit records can expose them; reference `SecureString` parameters securely.
- Review document sharing to prevent accidental public access.

## Exam scenarios
| Scenario | Solution |
| --- | --- |
| Run a script on thousands of tagged EC2 instances | Run Command with concurrency/error controls |
| Ensure antivirus remains installed | State Manager association |
| Approve and install patches Sunday at 02:00 | Patch Manager task in a Maintenance Window |
| Restart an unhealthy service after a Config finding | Config remediation using Automation |
| Access private EC2 without SSH keys or bastion | Session Manager |
| Aggregate installed-package metadata in S3 | Inventory + Resource Data Sync |
| Provision a reusable software package | Distributor |
| Track and remediate an operational issue | OpsCenter OpsItem + Automation runbook |
