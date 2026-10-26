# What Is AWS Control Tower?
AWS Control Tower offers a straightforward way to set up and govern an AWS multi-account environment, following prescriptive best practices. AWS Control Tower orchestrates the capabilities of several other AWS services, including AWS Organizations, AWS Service Catalog, and AWS IAM Identity Center, to build a landing zone in less than an hour. Resources are set up and managed on your behalf.

AWS Control Tower orchestration extends the capabilities of AWS Organizations. To help keep your organizations and accounts from drift, which is divergence from best practices, AWS Control Tower applies controls (sometimes called guardrails).

AWS Control Tower enables end users on your distributed teams to provision new AWS accounts quickly, by means of configurable account templates in **Account Factory**.

## Prerequisites
- **AWS Organizations** with **all features** enabled (not consolidated billing only).
- A dedicated **management account** (cannot be a member account in another org).
- Choose a **home Region** at setup—landing zone resources deploy there first; extend governance to additional Regions afterward.
- IAM permissions to create StackSets, Organizations OUs, and Service Catalog portfolios.

## Services orchestrated by Control Tower
| Service | Role in landing zone |
| --- | --- |
| AWS Organizations | OU hierarchy, SCPs/RCPs via preventive controls |
| AWS Service Catalog | Account Factory portfolio for vending accounts |
| IAM Identity Center | SSO users/groups for account access (optional self-managed IdP) |
| AWS CloudFormation StackSets | Deploy baseline resources across accounts/Regions |
| AWS Config | Detective controls; compliance recording |
| AWS CloudTrail | Organization trail to Log Archive account |
| AWS Security Hub | Optional Service-Managed Standard: AWS Control Tower |

## Features
- **Landing zone**: A landing zone is a well-architected, multi-account environment that's based on security and compliance best practices. It is the enterprise-wide container that holds all of your organizational units (OUs), accounts, users, and other resources that you want to be subject to compliance regulation. A landing zone can scale to fit the needs of an enterprise of any size.
- **Controls**: A control (sometimes called a guardrail) is a high-level rule that provides ongoing governance for your overall AWS environment. It's expressed in plain language. Three kinds of controls exist: preventive, detective, and proactive. Three categories of guidance apply to controls: mandatory, strongly recommended, or elective.
  - **Mandatory**: Applied automatically at landing zone setup; cannot be disabled without leaving Control Tower governance.
  - **Strongly recommended**: AWS recommends enabling; optional but common for production.
  - **Elective**: Choose based on your compliance needs.
- **Account Factory**: An Account Factory is a configurable account template that helps to standardize the provisioning of new accounts with pre-approved account configurations. See `Account Factory, AFT, and CfCT.md`.
- **Dashboard**.

## How AWS Control Tower works
The structure of a landing zone in AWS Control Tower is as follows:
- **Root**: The parent that contains all other OUs in your landing zone.
- **Security OU**: This OU contains the Log Archive and Audit accounts. These accounts often are referred to as shared accounts. When you launch your landing zone, you can choose customized names for these shared accounts, and you have the option to bring existing AWS accounts into AWS Control Tower for security and logging. However, these cannot be renamed later, and existing accounts cannot be added for security and logging after initial launch.
- **Sandbox OU**: The Sandbox OU is created when you launch your landing zone, if you enable it. This and other registered OUs contain the enrolled accounts that your users work with to perform their AWS workloads.
- **IAM Identity Center directory**: By default, this directory houses your IAM Identity Center users. It defines the scope of permissions for each IAM Identity Center user. Optionally, you can choose to self-manage your identity and access control.
- **IAM Identity Center users**: These are the identities that your users can assume to perform their AWS workloads in your landing zone.

### What happens when you set up a landing zone
When you set up a landing zone, AWS Control Tower performs the following actions in your management account on your behalf:
- Creates two AWS Organizations organizational units (OUs): Security, and Sandbox (optional), contained within the organizational root structure.
- Creates or adds two shared accounts in the Security OU: the Log Archive account and the Audit account.
- Creates a cloud-native directory in IAM Identity Center, with preconfigured groups and single sign-on access, if you choose the default AWS Control Tower configuration, or it allows you to self-manage your identity provider.
- Applies all mandatory, preventive controls to enforce policies.
- Applies all mandatory, detective controls to detect configuration violations.
- Preventive controls are not applied to the management account.
- Except for the management account, controls are applied to the organization as a whole.

### Home Region vs governed Regions
- **Home Region**: Where the landing zone was first deployed; hosts Control Tower console metadata and initial StackSets.
- **Governed Regions**: Additional Regions you extend Control Tower to; baseline StackSets and detective controls deploy there per your configuration.
- **Exam tip**: Detective controls only evaluate in **Regions supported by Control Tower**; preventive SCPs apply org-wide regardless of Region.

### Enrolling and managing accounts
| Action | Notes |
| --- | --- |
| **Vend new account** | Account Factory (Service Catalog) or AFT (GitOps/Terraform) |
| **Enroll existing account** | Move account into a registered OU; Control Tower applies controls and baseline StackSets |
| **Bring existing log/audit accounts** | Only at **initial** landing zone setup—not after launch |
| **Move account between OUs** | Allowed; controls update to match target OU |
| **Unregister account** | Removes from Control Tower governance; does not delete the account |
| **Close landing zone** | Destructive; tears down governance (plan carefully) |

### Drift and landing zone updates
- **Drift**: Accounts or resources diverge from Control Tower baseline (disabled controls, manual StackSet changes, non-compliant resources).
- **Landing zone updates**: AWS publishes updates to baseline templates; StackSet instances may show **Outdated** until updated.
- Monitor the Control Tower **dashboard** for accounts not enrolled, controls in violation, or failed StackSet operations.

### How AWS Control Tower works with StackSets
AWS Control Tower uses CloudFormation StackSets to set up resources in your accounts, by default. 
When a stack instance goes into Outdated status, it usually means that the stack corresponding to that stack instance is not aligned with the latest template in the stack set. The stack remains in the older template, so it might not include the latest resources or parameters. The stack is still completely usable.

If the stack set update includes changes to the template (that is, if the TemplateBody or TemplateURL properties are specified), or if the Parameters property is specified, CloudFormation marks all stack instances with a status of Outdated prior to updating the stack instances in the specified accounts and AWS Regions. If the stack set update does not include changes to the template or parameters, CloudFormation updates the stack instances in the specified accounts and Regions, while leaving all other stack instances with their existing stack instance status. To update all of the stack instances associated with a stack set, do not specify the Accounts or Regions properties.

### What are the shared accounts?
In AWS Control Tower, the shared accounts in your landing zone are provisioned during setup: the management account, the log archive account, and the audit account.

#### What is the log archive account?
This account works as a repository for logs of API activities and resource configurations from all accounts in the landing zone.

#### What is the audit account?
The audit account is a restricted account that's designed to give your security and compliance teams read and write access to all accounts in your landing zone. From the audit account, you have programmatic access to review accounts, by means of a role that is granted to Lambda functions only.

## How controls work
| Type | Mechanism | When it acts | Status values | Management account |
| --- | --- | --- | --- | --- |
| **Preventive** | SCP or RCP | Before API call | Enforced / not enabled | **Not applied** |
| **Detective** | AWS Config rule | After resource exists | Clear / in violation / not enabled | Applied |
| **Proactive** | CloudFormation hook (+ Guard) | Before CFN deploy completes | PASS / FAIL / SKIP | Applied |

- **Preventive controls** prevent actions from occurring. Any attempt to perform a prevented action is denied and logged in CloudTrail. The resource is also logged in AWS Config.
- **Detective controls** detect specific events when they occur and log the action in CloudTrail.
- **Proactive controls** check whether resources are compliant with your company policies and objectives, before the resources are provisioned in your accounts. If the resources are out of compliance, they are not provisioned. Proactive controls monitor resources that would be deployed in your accounts by means of CloudFormation templates.

In AWS Control Tower preventive controls are implemented with service control policies (SCPs) and resource control policies (RCPs). Detective controls are implemented with AWS Config rules. Proactive controls are implemented with CloudFormation hooks.

### Applying controls (best practices)
- Attach controls at the **OU level**—accounts inherit automatically; use root sparingly.
- Use **defense in depth**: preventive (block) + proactive (block bad CFN) + detective (detect drift).
- Enable **Security Hub** Service-Managed Standard: AWS Control Tower for additional detective coverage.
- Manage controls as **IaC** (Terraform, CDK, CloudFormation) for review and drift detection—each control has a unique identifier.

### Control Tower vs raw Organizations SCPs
Control Tower controls are **pre-built, tested guardrails** with dashboard visibility. You can still add custom SCPs via Organizations, but avoid conflicting with mandatory Control Tower controls.

## Control Tower vs Organizations (exam summary)
```
Organizations = account structure + policies (SCPs, tags, etc.)
Control Tower   = opinionated landing zone + baseline accounts + pre-built controls + Account Factory
```
Use Control Tower for greenfield multi-account setup; use Organizations alone when you need full custom policy control without the Control Tower baseline.

## Terminology
- An **AWS Account Factory account** is an AWS account provisioned using Account Factory in AWS Control Tower. Sometimes, Account Factory is referred to informally as a “vending machine” for accounts.
- Your AWS Control Tower **home Region** is the AWS Region in which your AWS Control Tower landing zone was deployed.
- A **stack** is a collection of AWS resources that you can manage as a single unit.
- **AWS CloudFormation StackSets** are a type of resource that extends the functionality of stacks so that you can create, update, or delete stacks across multiple accounts and Regions with a single operation and a single CloudFormation template.
- A **conformance pack** is a collection of AWS Config rules and remediation actions that can be deployed as a single entity in an account and a Region, or across an organization in AWS Organizations. You can use a conformance pack to help customize your AWS Control Tower environment.