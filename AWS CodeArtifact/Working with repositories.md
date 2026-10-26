# Working with repositories in CodeArtifact

## Repository relationships
- A repository can have multiple upstream repositories.
- Upstream order determines resolution priority.
- Upstream repositories must belong to the same CodeArtifact domain.
- A repository can connect to a supported public source through an **external connection**.
- Clients need only the downstream repository endpoint; CodeArtifact traverses the upstream chain.

Use separate repositories when teams need different publish permissions, upstream policies, or release stages.

Example:
```text
dev → test → production → public-ingress → public repository
```

Promotion should copy an approved package version between repositories rather than rebuilding it. This ensures test and production consume the same package assets.

## Package origin controls
Origin controls specify whether new package versions can enter a repository through:
- **Publish**: Direct upload by a user or CI pipeline
- **Upstream**: Retention from an upstream CodeArtifact repository or ingestion from a public repository

Each setting can be `ALLOW` or `BLOCK`.

Recommended dependency-confusion defense:
- Internal package namespace/group: allow direct publish and block upstream ingestion.
- Third-party namespace/group: block direct publish and allow controlled upstream ingestion.
- Apply policies at scale with **package groups**.

Without this control, a malicious public package using the same name as an internal dependency can be selected or ingested.

## Package lifecycle operations
- Publish and consume package versions through native package managers.
- Copy a package version between repositories in the same domain.
- Change package-version status to archive or unlist versions.
- Delete package versions or dispose of assets when no longer required.
- Use automation for retention because repository growth increases storage cost.

Avoid deleting versions referenced by lock files or active releases. Prefer immutable version identifiers and never silently replace a released dependency.

## Private VPC access
You can configure CodeArtifact to use an interface virtual private cloud (VPC) endpoint to improve the security of your VPC.

VPC endpoints use AWS PrivateLink, a service that makes it possible for you to access CodeArtifact APIs through private IP addresses. AWS PrivateLink restricts all network traffic between your VPC and CodeArtifact to the AWS network. When you use an interface VPC endpoint, you don't need an internet gateway, NAT device, or virtual private gateway. 

For fully private access, create two interface endpoints:
```text
com.amazonaws.<region>.codeartifact.api
com.amazonaws.<region>.codeartifact.repositories
```

- `codeartifact.api` handles API operations such as token and repository management.
- `codeartifact.repositories` handles package-manager traffic.
- Enable private DNS, or configure package managers with the endpoint-specific repository URL.
- The endpoint security group must allow inbound HTTPS (443) from clients.
- Endpoints are Regional and do not support cross-Region requests.

CodeArtifact uses Amazon S3 to store package assets. For package formats that download assets through S3, create an S3 **gateway endpoint** and associate it with the private-subnet route tables. Python and Swift package formats do not require this S3 endpoint.

## Repository endpoints
Obtain the correct format-specific endpoint:
```bash
aws codeartifact get-repository-endpoint \
  --domain example \
  --repository application \
  --format npm \
  --query repositoryEndpoint \
  --output text
```

Endpoints differ by package format. Configure each package manager using `aws codeartifact login` where supported or set the endpoint/token manually.

## Cross-account repositories
- A domain or repository resource policy can grant another AWS account access.
- The caller also needs IAM identity permissions in its own account.
- Use `--domain-owner <account-id>` when accessing a domain owned by another account.
- A domain resource policy controls domain operations and cross-account token access; repository policies control repository/package actions.
- KMS key policy must also permit required use when a customer-managed key encrypts the domain.

## Monitoring and audit
- CloudTrail records CodeArtifact API operations.
- EventBridge can react to package-version events and repository changes.
- Monitor storage, request, and data-transfer usage for cost.
- Review public-ingress repositories and package origin controls regularly.

## Repository exam scenarios
- Centralize approved public dependencies → dedicated external-connection repository used as upstream.
- Prevent public package from impersonating internal package → package groups/origin controls.
- Build in private subnets without NAT → two CodeArtifact interface endpoints and, where required, S3 gateway endpoint.
- Share packages across accounts → resource policy plus caller IAM permissions and domain-owner setting.
- Promote exactly what was tested → copy the package version; do not rebuild.