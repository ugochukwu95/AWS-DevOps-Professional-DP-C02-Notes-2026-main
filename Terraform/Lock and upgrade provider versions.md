# Terraform Associate 004: provider locking, state, and maintenance

## Provider version selection

Provider constraints define the versions Terraform **may** install. The dependency lock file records the exact provider versions Terraform selected.

```hcl
terraform {
  required_version = "~> 1.12.0"

  required_providers {
    random = {
      source  = "hashicorp/random"
      version = "~> 3.7"
    }
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}
```

Reusable modules should usually declare a minimum compatible provider version, while root modules can use tighter constraints to control upgrades.

## `.terraform.lock.hcl`

`terraform init` creates the dependency lock file when provider selections are needed.

The lock file contains:

- Provider source addresses
- Selected provider versions
- Version constraints known during selection
- Package checksums for supported platforms

It does **not** lock:

- Terraform CLI versions
- Module versions
- Backend versions

Commit `.terraform.lock.hcl` to version control. This makes local and CI runs select the same providers and verify downloaded packages.

Without a lock entry, Terraform selects the newest available provider satisfying all constraints. Normal `terraform init` honors existing selections; this can keep an older allowed version.

### Upgrade providers

```bash
terraform init -upgrade
```

This reevaluates selections and chooses newer provider/module versions that still satisfy constraints. Review lock-file changes, provider changelogs, and the execution plan before applying.

Create checksums for additional CI platforms:

```bash
terraform providers lock \
  -platform=darwin_arm64 \
  -platform=linux_amd64
```



## 6. Terraform state management



### Why Terraform uses state

State:

- Maps configuration addresses to remote object IDs.
- Tracks resource metadata and dependencies.
- Stores attributes and output values.
- Helps Terraform calculate changes efficiently.

Terraform expects a one-to-one binding between each managed resource instance and a real remote object. Do not import the same object to multiple addresses.

State may contain secrets. Treat it as sensitive data even if the configuration uses `sensitive = true`.

## Local backend

Without a backend configuration, Terraform uses the `local` backend:

- State: `terraform.tfstate`
- Backup: `terraform.tfstate.backup`
- Operations execute on the local machine
- Team sharing and reliable locking are limited

Local state is suitable for learning or isolated work, not most production teams.

## Remote backend

```hcl
terraform {
  backend "s3" {
    bucket       = "example-terraform-state"
    key          = "network/prod.tfstate"
    region       = "us-east-1"
    use_lockfile = true
    encrypt      = true
  }
}
```

Remote backends can provide:

- Shared state
- State locking, if the backend supports it
- Encryption and access control
- Versioning/recovery through the storage service
- Remote operations for enhanced backends such as HCP Terraform

Backend blocks cannot use input variables, locals, or data-source values because the backend is initialized before expression evaluation. Avoid hardcoding credentials; use environment variables, credential files, workload identity, or partial backend configuration.

After changing backend configuration:

```bash
terraform init -migrate-state
```



### State locking

Terraform automatically locks state for operations that can write it when the backend supports locking. If locking fails, Terraform stops rather than risk concurrent writes.

- Do not disable locking in normal operation.
- `terraform force-unlock LOCK_ID` removes a stale lock; use it only after confirming no other operation is running.
- Locking prevents simultaneous writes, not all logical conflicts between separately reviewed plans.



### CLI workspaces

CLI workspaces provide multiple state instances for the same configuration/backend:

```bash
terraform workspace new dev
terraform workspace select prod
terraform workspace list
terraform workspace show
```

`${terraform.workspace}` returns the current workspace name. CLI workspaces are not the same as HCP Terraform workspaces and are not strong isolation for separate credentials or access controls.

## Inspecting and modifying state


| Command                            | Purpose                                   |
| ---------------------------------- | ----------------------------------------- |
| `terraform state list`             | List resource addresses                   |
| `terraform state show ADDRESS`     | Show one resource instance                |
| `terraform show`                   | Show current state in readable form       |
| `terraform output`                 | Display root outputs                      |
| `terraform state mv OLD NEW`       | Move binding to a new address             |
| `terraform state rm ADDRESS`       | Forget an object without destroying it    |
| `terraform state pull`             | Download raw state                        |
| `terraform state push`             | Upload state; dangerous and rarely needed |
| `terraform state replace-provider` | Replace provider source address in state  |


State-modifying commands create backups where supported, but commit configuration and back up state first. Prefer configuration-driven `moved`, `removed`, and `import` blocks because they are reviewable.

## Drift and refresh

**Drift** is a difference caused by out-of-band changes to remote infrastructure.

Normal `plan` and `apply` refresh resource data before comparing it with configuration.

Choose based on intent:

- **Revert drift to configuration**: Review a normal plan and apply.
- **Accept drift into configuration**: Update HCL to match, then plan/apply.
- **Update state only**: `terraform plan -refresh-only`, then `terraform apply -refresh-only`.

The legacy `terraform refresh` command auto-applies refresh changes without reviewing a plan; prefer refresh-only mode.

### Refactoring without recreation

```hcl
moved {
  from = aws_instance.app
  to   = module.compute.aws_instance.app
}
```

A `moved` block changes the resource address while preserving the existing object.

To stop managing without destroying:

```hcl
removed {
  from = aws_instance.legacy

  lifecycle {
    destroy = false
  }
}
```

This is the reviewable alternative to `terraform state rm`.

To force replacement:

```bash
terraform plan -replace=aws_instance.app
terraform apply -replace=aws_instance.app
```

`-replace` is preferred over the deprecated `terraform taint` workflow.

## Remote state data

```hcl
data "terraform_remote_state" "network" {
  backend = "s3"
  config = {
    bucket = "example-terraform-state"
    key    = "network/prod.tfstate"
    region = "us-east-1"
  }
}
```

Consumers can reference only root outputs:

```hcl
vpc_id = data.terraform_remote_state.network.outputs.vpc_id
```

Although only outputs are exposed in configuration, access to `terraform_remote_state` generally requires permission to read the entire state snapshot. Prefer publishing shared values to a dedicated system such as Parameter Store when consumers should not access state.

## 7. Import existing infrastructure



### CLI import

1. Write a destination resource block.
2. Run:
  ```bash
   terraform import aws_s3_bucket.logs example-logs-bucket
  ```
3. Run `terraform plan` and update configuration until no unintended changes remain.

CLI import binds an object to state; it does not normally generate complete configuration.

### Import blocks

```hcl
import {
  to = aws_s3_bucket.logs
  id = "example-logs-bucket"
}
```

Import blocks are declarative, reviewable, and can be processed during plan/apply. Terraform can generate a starting configuration for import targets:

```bash
terraform plan -generate-config-out=generated.tf
```

Generated configuration requires review and cleanup.

## Verbose logging and debugging

Set `TF_LOG` to:

- `TRACE`
- `DEBUG`
- `INFO`
- `WARN`
- `ERROR`

```bash
TF_LOG=DEBUG terraform plan
TF_LOG=TRACE TF_LOG_PATH=terraform.log terraform apply
TF_LOG_PROVIDER=TRACE terraform plan
```

- Logs can expose credentials and sensitive values; store and delete them securely.
- Unset `TF_LOG` to disable verbose logging.
- Use `TF_LOG_PATH` with `TF_LOG`; setting a path alone does not enable logging.
- Provider-specific logs help distinguish Terraform Core problems from API/provider problems.



## State and maintenance exam traps

- The lock file locks providers, not Terraform or modules.
- Remote state does not automatically mean remote execution.
- Not every backend supports state locking.
- `state rm` forgets a resource; it does not destroy it.
- `destroy` deletes managed infrastructure; removing HCL alone also plans destruction unless a `removed` block says otherwise.
- Import adopts an existing object; it does not recreate it.
- `moved` blocks preserve objects during address refactoring.
- An aggregator or remote-state reader needs appropriate access to source state/data.

