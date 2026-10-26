# What is AWS CodeArtifact?
AWS CodeArtifact is a secure, highly scalable, managed artifact repository service that helps organizations to store and share software packages for application development. 

## Supported package formats
- Cargo (Rust)
- Generic packages
- Maven/Gradle
- npm
- NuGet/.NET
- PyPI/pip and twine
- Ruby
- Swift

CodeArtifact stores **software packages**, not arbitrary build outputs or container images. Use S3 for general artifacts and Amazon ECR for container images.

You can create a connection between your private CodeArtifact repository and an external, public repository, such as npmjs.com or Maven Central. CodeArtifact will then fetch and store packages on demand from the public repository when they're requested by a package manager. This makes it more convenient to consume open-source dependencies used by your application and helps ensure they're always available for builds and development. You can also publish private packages to a CodeArtifact repository. This helps you share proprietary software components between multiple applications and development teams in your organization.

## How does CodeArtifact work?
CodeArtifact stores software packages in repositories. Every CodeArtifact repository is a member of a single CodeArtifact domain. We recommend that you use one production domain for your organization with one or more repositories.

You can make packages in one repository available to another repository in the same domain. To do this, configure one repository as an upstream of the other. 

Packages in CodeArtifact repositories cannot be made publicly available.

CodeArtifact imports packages from public repositories but never publishes private CodeArtifact packages back to those public repositories.

## AWS CodeArtifact concepts
- Domain: 
  Repositories are aggregated into a higher-level entity known as a domain. All package assets and metadata are stored in the domain, but they are consumed through repositories. Each repository is a member of a single domain and can't be moved to a different domain.
  Using a domain, you can apply an organizational policy across multiple repositories. With this approach, you determine which accounts can access repositories in the domain, and which public repositories can be used as the sources of packages.
  A domain deduplicates package assets across its repositories and encrypts stored assets using an AWS owned key or a customer-managed KMS key selected when the domain is created.

- Repository:
  A CodeArtifact repository contains a set of package versions, each of which maps to a set of assets. Each repository exposes endpoints for fetching and publishing packages using tools like the nuget CLI, the npm CLI, the Maven CLI (mvn), and pip. You can create up to 1,000 repositories per domain.

- Package:
  A package is identified by its format, optional namespace, and name. For example, an npm scope or Maven `groupId` maps to the CodeArtifact namespace.

- Package version and assets:
  A package version represents one release. Assets are its files, such as a `.jar`, `.whl`, `.tgz`, or checksum. Package metadata describes dependencies and other package-manager information.

- Package version status:
  Versions can be published, unfinished, unlisted, archived, or disposed depending on format and lifecycle operation. Archiving hides a version from normal package-manager resolution; disposing removes its assets while retaining metadata for a period.

- Package group:
  Package groups can be used to apply configuration to multiple packages that match a defined pattern using package format, package namespace, and package name. You can use package groups to more conveniently configure package origin controls for multiple packages. Package origin controls are used to block or allow ingestion or publishing of new package versions, which protects users from malicious actions known as dependency substitution attacks.

- Upstream repository
  One repository is upstream of another when the package versions in it can be accessed from the repository endpoint of the downstream repository. This approach effectively merges the contents of the two repositories from the point of view of a client. 

- External connection:
  An external connection links a repository to a supported public package repository. When a requested version is absent internally, CodeArtifact can fetch and retain it from the public source. Put the external connection on a controlled upstream repository rather than allowing every team repository to connect directly.

## Typical repository design
```text
Developer / CI
      ↓
Team repository (publish private packages)
      ↓ upstream
Approved shared repository
      ↓ upstream
Public-ingress repository
      ↓ external connection
npmjs / Maven Central / PyPI / other supported source
```

This provides one client endpoint while centralizing public dependency access and policy.

## Package resolution
When a client requests a package, CodeArtifact searches:
1. The requested repository
2. Its configured upstream repositories in priority order
3. Further upstream chains
4. A connected public repository, if allowed

An imported public package is retained in CodeArtifact, improving repeatability if the public source later becomes unavailable. Lock files are still necessary because CodeArtifact availability does not guarantee deterministic dependency version selection.

## Related services
| Requirement | Service |
| --- | --- |
| Private npm/Maven/PyPI/NuGet and similar packages | CodeArtifact |
| Container images and OCI artifacts | Amazon ECR |
| General build artifacts/files | Amazon S3 |
| Source-code repository | GitHub, GitLab, or another Git service |
| Build and publish packages | AWS CodeBuild |

## Exam tips
- A repository belongs to exactly one domain and cannot move between domains.
- Upstreams must be in the same domain.
- CodeArtifact repositories remain private.
- External connections ingest from public repositories; they do not publish private packages externally.
- Package origin controls protect against dependency-substitution attacks.

