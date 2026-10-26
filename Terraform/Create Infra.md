# Terraform Associate 004: IaC, fundamentals, and core workflow

## 1. Infrastructure as Code (IaC)
Infrastructure as Code defines infrastructure in version-controlled, machine-readable configuration instead of creating it manually.

Benefits:
- **Repeatability and consistency**: Recreate the same architecture reliably.
- **Version control**: Review, approve, audit, and revert configuration changes.
- **Automation**: Integrate plans and applies into CI/CD.
- **Reusability**: Share modules instead of copying infrastructure manually.
- **Idempotence**: Reapplying unchanged configuration produces no changes.
- **Reduced drift**: Terraform compares configuration, state, and real infrastructure.

Terraform uses a **declarative** model: describe the desired end state, and Terraform determines the dependency order and API operations. Provisioners execute imperative scripts but should be a last resort.

### Multi-cloud and service-agnostic workflow
Terraform uses the same workflow and HCL language across AWS, Azure, Google Cloud, Kubernetes, GitHub, SaaS platforms, and on-premises systems. Providers translate Terraform operations into each target API.

Terraform is not limited to cloud resources. A single configuration can manage resources from several providers and create cross-provider dependencies.

## 2. Terraform architecture
```text
Terraform configuration (.tf)
          ↓
Terraform Core builds dependency graph and plan
          ↓ RPC
Provider plugins call remote APIs
          ↓
Real infrastructure + Terraform state
```

- **Terraform Core** reads HCL, evaluates expressions, builds the graph, compares state, and creates plans.
- **Providers** are separate plugins that implement resource and data-source types.
- **State** maps resource addresses in configuration to real remote objects.

## Terraform and provider requirements
```hcl
terraform {
  required_version = "~> 1.12.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.92"
    }
  }
}
```

- `required_version` constrains the Terraform CLI version.
- `required_providers` declares provider source addresses and version constraints.
- A provider source has the form `[hostname/]namespace/type`; the default hostname is `registry.terraform.io`.
- The dependency lock file records selected **provider** versions and checksums—not Terraform CLI or module versions.

### Version constraint operators
| Constraint | Meaning |
| --- | --- |
| `= 1.2.3` or `1.2.3` | Exact version |
| `!= 1.2.3` | Exclude version |
| `>= 1.2.0` | Version or newer |
| `>= 1.2, < 2.0` | Combined range |
| `~> 1.2.0` | At least 1.2.0, below 1.3.0 |
| `~> 1.2` | At least 1.2.0, below 2.0.0 |

## Provider configurations and aliases
```hcl
provider "aws" {
  region = "us-west-2"
}

provider "aws" {
  alias  = "east"
  region = "us-east-1"
}

resource "aws_s3_bucket" "west" {
  bucket = "example-west-bucket"
}

resource "aws_s3_bucket" "east" {
  provider = aws.east
  bucket   = "example-east-bucket"
}
```

- A provider block without `alias` is the default configuration.
- An aliased provider is referenced as `<provider>.<alias>`.
- Do not hardcode provider credentials. Use environment variables, shared credential files, workload identity, or dynamic credentials.

## Resource and data blocks
```hcl
data "aws_ami" "ubuntu" {
  most_recent = true
  owners      = ["099720109477"]

  filter {
    name   = "name"
    values = ["ubuntu/images/hvm-ssd-gp3/ubuntu-noble-24.04-amd64-server-*"]
  }
}

resource "aws_instance" "app" {
  ami           = data.aws_ami.ubuntu.id
  instance_type = "t3.micro"

  tags = {
    Name = "learn-terraform"
  }
}

output "private_dns" {
  value = aws_instance.app.private_dns
}
```

- A **resource** block creates or manages an object.
- A **data** block reads an existing object without managing its lifecycle.
- `aws_instance.app` is the resource address.
- `data.aws_ami.ubuntu.id` is a reference to a data-source attribute.
- References create **implicit dependencies**, so Terraform evaluates the AMI before the instance.

## 3. Core Terraform workflow
```text
Write → init → fmt → validate → plan → apply → repeat → destroy
```

### `terraform init`
Safe to run repeatedly. It:
- Initializes the configured backend.
- Downloads child modules.
- Installs provider plugins in `.terraform/`.
- Creates or updates `.terraform.lock.hcl`.
- Migrates backend state when configuration changes and you approve it.

Useful options:
- `terraform init -upgrade`: Select newer provider/module versions allowed by constraints.
- `terraform init -reconfigure`: Ignore saved backend configuration and reinitialize.
- `terraform init -migrate-state`: Copy existing state when changing backends.

Commit `.terraform.lock.hcl`; do **not** commit `.terraform/` or local state files.

### `terraform fmt`
Rewrites configuration into canonical Terraform style.
```bash
terraform fmt -recursive
terraform fmt -check
```

### `terraform validate`
Checks syntax and internal consistency. Run `terraform init` first so providers and modules are available. Validation does not prove that remote credentials work or that an apply will succeed.

### `terraform plan`
Refreshes state by default, compares desired and current state, and proposes actions:
- `+` create
- `~` update in place
- `-/+` replace
- `-` destroy
- `<=` read a data source

```bash
terraform plan -out=tfplan
terraform show tfplan
```

A saved plan ensures `terraform apply tfplan` applies that reviewed plan. Never commit plan files; they can contain sensitive values in cleartext.

Common options:
- `-var='name=value'` or `-var-file=prod.tfvars`
- `-replace=resource.address`: Plan replacement without editing state manually.
- `-refresh-only`: Reconcile state/output values with out-of-band changes without changing remote objects.
- `-target=address`: Exceptional recovery tool, not a normal deployment strategy.

### `terraform apply`
Creates a fresh plan and requests approval unless given a saved plan or `-auto-approve`.
```bash
terraform apply
terraform apply tfplan
```

Terraform walks the dependency graph and operates independent resources in parallel. A successful apply updates state.

### `terraform destroy`
Plans and destroys all objects managed by the current configuration/state.
```bash
terraform plan -destroy
terraform destroy
```

`terraform destroy` is effectively `terraform apply -destroy`. Lifecycle rules, provider/API restrictions, and dependencies can prevent destruction.

## Files and loading behavior
- Terraform loads all `.tf` and `.tf.json` files in a directory as one module.
- File names such as `main.tf`, `variables.tf`, and `outputs.tf` are conventions, not special behavior.
- `terraform.tfvars` and `*.auto.tfvars` load automatically.
- `.terraform/`, `*.tfstate*`, plan files, and secret `.tfvars` should generally be ignored by Git.

## State fundamentals
Local state defaults to `terraform.tfstate`. State:
- Maps resource addresses to provider object IDs.
- Stores resource attributes, dependency metadata, and outputs.
- Improves performance by avoiding unnecessary API discovery.

State can contain secrets even when values are marked `sensitive`. Protect it with access controls and encryption, and prefer a remote backend for teams.

## High-value exam traps
- `init` installs providers and modules; `validate` checks configuration; `plan` proposes changes; `apply` executes them.
- A data source reads infrastructure but does not adopt it into Terraform management.
- `sensitive = true` redacts normal CLI output but does not encrypt state.
- Provider aliases allow multiple configurations of the same provider.
- Terraform automatically infers dependencies from references; use `depends_on` only for hidden dependencies.
- A saved execution plan can contain sensitive information.
