# What is AWS Organizations?
AWS Organizations helps you centrally manage and govern your environment as you grow and scale your AWS resources. Using Organizations, you can create accounts and allocate resources, group accounts to organize your workflows, apply policies for governance, and simplify billing by using a single payment method for all of your accounts.

## Feature sets
AWS Organizations has two feature sets. You must enable **all features** to use SCPs, delegated administrators, and most service integrations (Firewall Manager, GuardDuty org-wide, etc.).
- **Consolidated billing only**: Single invoice and pooled usage discounts across accounts. No centralized policy enforcement.
- **All features**: Consolidated billing plus SCPs/RCPs, other policy types, trusted access, and delegated administrators.

## Account lifecycle
- **Create**: Management account creates member accounts via Organizations (`CreateAccount`) or tools like AWS Control Tower Account Factory.
- **Invite**: Existing standalone accounts can join via handshake; only one organization at a time.
- **Move**: Accounts can move between OUs (not between organizations without leaving first).
- **Leave / close**: Member accounts can leave with management approval; management account cannot leave without deleting the organization.

- **Root**:
  An administrative root (root) is contained in the management account and is the starting point for organizing your AWS accounts. The root is the top-most container in your organization’s hierarchy. Under this root, you can create organizational units (OUs) to logically group your accounts and organize these OUs into a hierarchy that best matches your needs.
  If you apply a **declarative policy** to the root, it applies to all organizational units (OUs) and accounts, including the management account for the organization.
  If you apply an **authorization policy** (for example, a service control policy (SCP)), to the root, it applies to all organizational units (OUs) and member accounts in the organization. It does not apply to the management account in the organization.
- **Organizational unit (OU)**:
  An organizational unit (OU) is a group of AWS accounts within an organization. An OU can also contain other OUs enabling you to create a hierarchy. For example, you can group all accounts that belong to the same department into a departmental OU. Similarly, you can group all accounts running security services into a security OU. Your hierarchy can be five levels deep.
- **Management account**:
  A **management account** is the AWS account you use to create your organization. From the management account, you can do the following:
  - Create other accounts in your organization
  - Invite and manage invitations for other accounts to join your organization
  - Designate delegated administrator accounts
  - Remove accounts from your organization
  - Attach policies to entities such as roots, organizational units (OUs), or accounts within your organization
  - Enable integration with supported AWS services to provide service functionality across all of the accounts in the organization.
- **Member account**:
  A member account is an AWS account, other than the management account, that is part of an organization. If you are an administrator of an organization, you can create member accounts in the organization and invite existing accounts to join the organization. You also can apply policies to member accounts.
  **Note**: A member account can belong to only one organization at a time. You can designate member accounts to be delegated administrator accounts.
- **Delegated administrator**:
  There are two types of delegated administrators:
  - **Delegated administrator for Organizations**: A member account granted policy-management actions (via a resource-based delegation policy from the management account). Can create, attach, update, and delete organization policies by policy type—without using the management account.
  - **Delegated administrator for an AWS service**: A member account registered to administer a specific integrated service org-wide (GuardDuty, Security Hub, Firewall Manager, etc.). Requires trusted access for that service first. Has service admin permissions plus Organizations read-only actions.

**Note**: SCPs do not restrict users or roles in the management account. Keep workloads out of the management account.

## Organization policies
AWS Organizations supports authorization policies and declarative policies. Policies inherit down the OU tree; an account is affected by every policy attached to its OU ancestors and the root.

| Policy category | Purpose | Applies to management account? |
| --- | --- | --- |
| Authorization (SCP, RCP, tag, backup, AI opt-out) | Limit max permissions or enforce tagging/backup/AI settings | SCP/RCP: **No**. Tag/backup/AI opt-out: varies by type |
| Declarative (EC2, S3, Security Hub, etc.) | Enforce service configuration baseline | **Yes** (when attached at root or inherited) |

### Authorization policies
Authorization policies help you to centrally manage the security of AWS accounts across an organization.
  - **Service control policy (SCP)**
    A service control policy is a type of policy that offers central control over the maximum available permissions for IAM users and IAM roles in an organization. This means that SCPs specify principal-centric controls. SCPs create a permissions guardrail, or set limits on the maximum permissions available to principals in your member accounts. You use an SCP when you want to centrally enforce consistent access controls on principals in your organization.
  - **Resource control policy (RCP)**:
    A resource control policy is a type of policy that offers central control over the maximum available permissions for resources in an organization. RCPs create a permissions guardrail, or set limits, on the maximum permissions available for resources in your member accounts.
  - **Tag policy**: Standardizes tags on resources across accounts; can enforce required tag keys/values.
  - **Backup policy**: Defines backup plans and retention centrally for member accounts.
  - **AI services opt-out policy**: Controls whether accounts can use AI/ML content for service improvement.

### Declarative policies
Declarative policies help you centrally configure and manage AWS services and their features across an organization. They enforce desired service settings regardless of which principal or API call makes the change. See `Declarative policies in AWS Organizations.md`.


