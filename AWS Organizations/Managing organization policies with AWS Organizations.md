# Managing organization policies with AWS Organizations

## Authorization policies in AWS Organizations
Authorization policies in AWS Organizations enable you to centrally configure and manage access for principals and resources in your member accounts.

There are two different types of authorization policies in AWS Organizations: service control policies (SCPs) and resource control policies (RCPs). RCPs provide an ability to impact the effective permissions for principals external to your organization that are accessing your resources. SCPs can only impact the effective permissions for principals within your AWS organization.

### Service control policies (SCPs)
SCPs do not grant permissions to the IAM users and IAM roles in your organization. No permissions are granted by an SCP. An SCP defines a permission guardrail, or sets limits, on the actions that the IAM users and IAM roles in your organization can perform. 

#### SCP effects on permissions
SCPs are similar to AWS Identity and Access Management permission policies and use almost the same syntax. However, an SCP never grants permissions. 
- SCPs affect only IAM users and roles that are managed by accounts that are part of the organization. SCPs don't affect resource-based policies directly. They also don't affect users or roles from accounts outside the organization. 
- An SCP restricts permissions for IAM users and roles in member accounts, including the member account's root user. Any account has only those permissions permitted by every parent above it. If a permission is blocked at any level above the account, either implicitly (by not being included in an Allow policy statement) or explicitly (by being included in a Deny policy statement), a user or role in the affected account can't use that permission, even if the account administrator attaches the AdministratorAccess IAM policy with */* permissions to the user.
- SCPs affect only member accounts in the organization. They have no effect on users or roles in the management account. This also means that SCPs apply to member accounts that are designated as delegated administrators.
- SCPs do not affect any service-linked role. Service-linked roles enable other AWS services to integrate with AWS Organizations and can't be restricted by SCPs.
- If both a permissions boundary (an advanced IAM feature) and an SCP are present, then the boundary, the SCP, and the identity-based policy must all allow the action.

#### SCP Syntax
##### Action and NotAction elements
You can use the Action or NotAction element to include or exclude AWS services from the effect of the policy.
```
{
  "Version":"2012-10-17",
  "Statement": [
    {
      "Sid": "LimitActionsInRegion",
      "Effect": "Deny",
      "NotAction": "iam:*",
      "Resource": "*",
      "Condition": {
        "StringNotEquals": {
          "aws:RequestedRegion": "us-west-1"
         }
       }
     }
   ]
}

```

##### Resource and NotResource element
In statements where the Effect element has a value of Allow, you can specify only "*" in the Resource element of an SCP. You can't specify individual resource Amazon Resource Names (ARNs). The following example shows how to use a NotResource element to exclude specific Amazon Bedrock models from the effect of the policy.
```
{
   "Version":"2012-10-17",
   "Statement":[
      {
         "Sid":"Statement1",
         "Effect":"Deny",
         "Action":[
            "bedrock:InvokeModel",
            "bedrock:InvokeModelWithResponseStream"
         ],
         "NotResource":[
            "arn:aws:bedrock:*::foundation-model/model-to-permit"
         ]
      }
   ]
}

```

### Resource control policies (RCPs)
Use an RCP when you need to restrict IAM principals that are external to your organization accounts making requests to access resources within your organization’s member accounts. RCPs don't affect resources in the management account. They only affect resources in the member accounts within your organization. This also means that RCPs apply to member accounts that are designated as delegated administrators.

### Other authorization policy types
- **Tag policies**: Define required tag keys/values; help standardize cost allocation and compliance tagging across accounts.
- **Backup policies**: Centrally define AWS Backup plans and assign them to OUs/accounts.
- **AI services opt-out policies**: Control whether member accounts opt out of content use for AWS AI/ML service improvement.

## Policy inheritance and defaults
- Policies attached to a parent (root or OU) flow down to all child OUs and accounts.
- For SCPs, effective permissions = intersection of all inherited SCPs **and** the identity-based policy (plus permissions boundary if present). Any explicit or implicit Deny at any level blocks the action.
- New accounts automatically receive policies attached to their OU and ancestors.
- By default, AWS attaches the **`FullAWSAccess`** SCP to the root, which allows all actions. Replace or supplement it to enforce guardrails—removing all Allow statements effectively denies everything not explicitly allowed elsewhere in the SCP chain.

## Policy limits (approximate)
| Policy type | Max attached per target | Max policy size |
| --- | --- | --- |
| SCP | 5 | 5,120 characters |
| RCP | 5 | 5,120 characters |
| Tag / backup / AI opt-out | 5 each | 2,500–10,000 characters (varies) |

