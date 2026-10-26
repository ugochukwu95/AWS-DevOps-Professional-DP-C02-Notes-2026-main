# CodeArtifact authentication, security, and CI/CD

## Authorization tokens
Package managers do not normally sign every request with AWS Signature Version 4. Instead, users and workloads exchange AWS credentials for a temporary CodeArtifact authorization token.

- Default lifetime: **12 hours**
- Configurable lifetime: **15 minutes to 12 hours**
- `--duration-seconds 0` aligns token expiry with the remaining assumed-role session.
- Obtain a new token when it expires.
- The AWS account root user cannot obtain a CodeArtifact authorization token.

Required token permissions:
```json
{
  "Effect": "Allow",
  "Action": [
    "codeartifact:GetAuthorizationToken",
    "sts:GetServiceBearerToken"
  ],
  "Resource": "*"
}
```

`sts:GetServiceBearerToken` must be granted through an identity-based IAM policy; CodeArtifact domain/repository resource policies cannot grant an STS action.

## `aws codeartifact login`
```bash
aws codeartifact login \
  --tool npm \
  --domain example \
  --repository application \
  --duration-seconds 3600
```

The command:
1. Calls `GetAuthorizationToken`.
2. Gets the format-specific repository endpoint.
3. Updates the package manager's configuration.

It supports common tools such as npm, pip/twine, NuGet/dotnet, and Swift. Other tools/formats may require obtaining the token and endpoint separately.

Inspect changes without modifying configuration:
```bash
aws codeartifact login \
  --tool npm \
  --domain example \
  --repository application \
  --dry-run
```

Never commit the resulting token or generated package-manager credential file.

## Manual authentication
```bash
export CODEARTIFACT_AUTH_TOKEN=$(
  aws codeartifact get-authorization-token \
    --domain example \
    --query authorizationToken \
    --output text
)

export CODEARTIFACT_REPOSITORY_URL=$(
  aws codeartifact get-repository-endpoint \
    --domain example \
    --repository application \
    --format pypi \
    --query repositoryEndpoint \
    --output text
)
```

Pass these values using the package manager's documented configuration. Mask tokens in CI logs.

## IAM authorization model
Access can involve all of the following:
1. Caller identity policy
2. Domain resource policy
3. Repository resource policy
4. Package-level ARN permissions
5. Customer-managed KMS key policy
6. VPC endpoint policy for private access

Common actions:
| Requirement | Permission |
| --- | --- |
| Get temporary token | `codeartifact:GetAuthorizationToken`, `sts:GetServiceBearerToken` |
| Resolve repository URL | `codeartifact:GetRepositoryEndpoint` |
| Download packages | `codeartifact:ReadFromRepository` |
| Publish package version | `codeartifact:PublishPackageVersion` |
| Publish Maven metadata | `codeartifact:PutPackageMetadata` |
| Copy package versions | `codeartifact:CopyPackageVersions` |
| Delete versions | `codeartifact:DeletePackageVersions` |

Grant developers read access broadly only where needed; restrict publish/delete permissions to release roles and specific package namespaces.

## Domain and repository policies
- **Domain policy**: Cross-account domain access and domain-level operations.
- **Repository policy**: Access to a specific repository and its packages.
- Identity policies remain necessary for actions not granted effectively by resource policy, especially STS bearer-token permission.

Use explicit account/role principals rather than public access. CodeArtifact repositories cannot be public package repositories.

## Dependency security
- Pin dependencies with ecosystem lock files (`package-lock.json`, `poetry.lock`, `Cargo.lock`, etc.).
- Use one controlled public-ingress repository.
- Use package groups and origin controls to separate internal and public namespaces.
- Scan dependencies in CI with appropriate software composition analysis.
- Promote previously tested package assets instead of rebuilding.
- Restrict package deletion and status changes.
- Verify publisher identity and package checksums/signatures where available.

CodeArtifact improves availability and control, but it does not automatically prove that an open-source package is safe.

## CodeBuild example
```yaml
version: 0.2

phases:
  pre_build:
    commands:
      - aws codeartifact login
          --tool npm
          --domain example
          --repository application
          --duration-seconds 0
  install:
    commands:
      - npm ci
  build:
    commands:
      - npm test
      - npm run build
  post_build:
    commands:
      - npm publish
```

The CodeBuild service role needs token, endpoint, read, and—only for publishing jobs—publish permissions. Split untrusted pull-request builds from release publishing roles.

## CI/CD patterns

### Consume dependencies
```text
CI assumes IAM role
      ↓
Obtain short-lived CodeArtifact token
      ↓
Package manager installs locked dependencies
      ↓
Build and test
```

### Publish and promote
```text
Release role publishes unique version to development repository
      ↓
Tests and security scans
      ↓
Copy same package version to production repository
      ↓
Deployment consumes immutable approved version
```

Do not use mutable version names such as `latest` as the sole production control.

## Encryption
- CodeArtifact encrypts domain assets at rest.
- Choose an AWS owned key or customer-managed KMS key when creating the domain.
- TLS protects API and package-manager traffic in transit.
- For a customer-managed key, grant CodeArtifact and cross-account principals the necessary KMS permissions.

## Cost management
Charges can include:
- Stored package data
- Requests
- Data transfer
- Requests to public upstream repositories

Reduce cost by deleting obsolete package versions through reviewed automation, while preserving versions required for rollback, reproducible builds, or compliance.

## Troubleshooting

### 401/expired-token errors
- Run `aws codeartifact login` again.
- Verify system time and token lifetime.
- Ensure the package manager is using the expected repository URL/configuration.

### 403 AccessDenied
- Check `GetAuthorizationToken` and `sts:GetServiceBearerToken`.
- Check `GetRepositoryEndpoint` and `ReadFromRepository`/publish actions.
- For cross-account access, inspect both identity and resource policies.
- Check KMS and VPC endpoint policies.

### Package not found
- Confirm format, namespace, package name, and version.
- Check repository upstream order.
- Verify package origin controls permit upstream ingestion.
- Confirm the external connection supports the requested public source.
- Check whether the version is archived, unlisted, disposed, or deleted.

### Private build cannot download assets
- Verify `codeartifact.api` and `codeartifact.repositories` interface endpoints.
- Enable private DNS or configure endpoint-specific URLs.
- For applicable formats, verify the S3 gateway endpoint and route table.
- Check endpoint security group port 443 and endpoint policies.

## Exam traps
- CodeArtifact tokens are temporary; IAM access keys are not used directly as package-manager passwords.
- `login` configures a client; it does not publish or download a package by itself.
- Cross-account resource policy does not replace `sts:GetServiceBearerToken`.
- External connections are for importing public dependencies, not exposing private packages publicly.
- CodeArtifact is for packages; ECR is for container images.
- Lock files remain necessary even when dependencies are cached in CodeArtifact.
