# Using AWS Organizations with other AWS services
You can use trusted access to enable a supported AWS service that you specify, called the trusted service, to perform tasks in your organization and its accounts on your behalf. This involves granting permissions to the trusted service but does not otherwise affect the permissions for users or roles. When you enable access, the trusted service can create an IAM role called a service-linked role in every account in your organization whenever that role is needed. That role has a permissions policy that allows the trusted service to do the tasks that are described in that service's documentation. This enables you to specify settings and configuration details that you would like the trusted service to maintain in your organization's accounts on your behalf. The trusted service only creates service-linked roles when it needs to perform management actions on accounts, and not necessarily in all accounts of the organization.

## Permissions required to enable trusted access
Trusted access requires permissions for two services: AWS Organizations and the trusted service. 

## AWS Organizations and service-linked roles
AWS Organizations uses IAM service-linked roles to enable trusted services to perform tasks on your behalf in your organization's member accounts. When you configure a trusted service and authorize it to integrate with your organization, that service can request that AWS Organizations create a service-linked role in its member account. The trusted service does this asynchronously as needed and not necessarily in all accounts in the organization at the same time. The service-linked role has predefined IAM permissions that allow the trusted service to perform only specific tasks within that account. In general, AWS manages all service-linked roles, which means that you typically can't alter the roles or the attached policies.

## Delegated administrator for AWS services that work with Organizations
These accounts are called delegated administrators for that specific service. By registering a member account as a delegated administrator for an AWS service you enable that account to have some administrative permissions for that service, as well as permissions for Organizations read-only actions.
Before you register an account as a delegated administrator for a service:
- Confirm that the service supports delegated administrators.
- Enable trusted access for that service.

Trusted access enabled for the service
        ↓
Delegated administrator account registered for the service
        ↓
That member account can now administer the service org-wide

## Commonly integrated services (org-wide admin patterns)
| Service | Trusted access | Delegated admin | Typical admin account role |
| --- | --- | --- | --- |
| AWS CloudTrail | Yes | No | Org trail in log-archive account |
| AWS Config | Yes | Yes | Security/compliance account |
| Amazon GuardDuty | Yes | Yes (service API) | Security tooling account |
| AWS Security Hub | Yes | Yes (service API) | Security tooling account |
| AWS Firewall Manager | Yes | Yes | Network/security account |
| AWS IAM (root access management) | Yes | Yes | Management or security account |
| AWS Backup | Yes | Yes | Central backup account |
| AWS RAM | Yes | No | Share resources across accounts |
| AWS Service Catalog | Yes | Yes | Central platform/engineering account |

**Exam tip**: Most services require **all features** enabled and **trusted access** before registering a delegated administrator.

