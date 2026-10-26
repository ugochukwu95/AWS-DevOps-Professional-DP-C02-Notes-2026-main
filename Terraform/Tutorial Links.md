# Terraform Associate 004: HCP Terraform and study checklist

Official exam content list:

- [https://developer.hashicorp.com/terraform/tutorials/certification-004/associate-review-004](https://developer.hashicorp.com/terraform/tutorials/certification-004/associate-review-004)
- Learning path: [https://developer.hashicorp.com/terraform/tutorials/certification-004/associate-study-004](https://developer.hashicorp.com/terraform/tutorials/certification-004/associate-study-004)
- Sample questions: [https://developer.hashicorp.com/terraform/tutorials/certification-004/associate-questions-004](https://developer.hashicorp.com/terraform/tutorials/certification-004/associate-questions-004)

The 004 exam targets Terraform 1.12 concepts. Provider-specific AWS knowledge is not required.

## 8. HCP Terraform

HCP Terraform is HashiCorp's managed Terraform platform. It provides shared state, remote runs, VCS integration, collaboration, private modules/providers, governance, health assessments, and secure variable/credential management.

## Workspaces and projects



### HCP Terraform workspace

An HCP Terraform workspace contains:

- Terraform configuration connection (VCS, CLI, or API)
- State and state-version history
- Runs and plans
- Terraform and environment variables
- Terraform version and execution settings
- Team permissions, notifications, run tasks, and policy results

An HCP Terraform workspace typically maps to one independently managed infrastructure/state lifecycle.

### HCP workspace vs CLI workspace


| HCP Terraform workspace                                        | CLI workspace                                           |
| -------------------------------------------------------------- | ------------------------------------------------------- |
| Separate state, variables, runs, access controls, and settings | Separate state instance under one backend configuration |
| Strong collaboration boundary                                  | Lightweight environment switching                       |
| Managed through HCP Terraform                                  | Managed with `terraform workspace` CLI                  |




### Projects

Projects group related HCP workspaces and apply organization at scale.

- Assign project-level team access.
- Apply variable sets and policy organization consistently.
- Separate teams, applications, business units, or environments.

Projects do not combine workspace state. Each workspace retains its own runs and state.

## HCP Terraform workflows


| Workflow   | How a run starts                                                |
| ---------- | --------------------------------------------------------------- |
| VCS-driven | Commit or pull request in connected repository                  |
| CLI-driven | Local `terraform plan` or `apply` queues a remote run           |
| API-driven | CI/CD or another system uploads configuration and creates a run |




### VCS-driven workflow

- A branch commit can queue a plan and apply according to workspace settings.
- A pull request produces a **speculative plan** for review; it cannot be applied.
- VCS webhooks trigger runs automatically.
- The workspace's working directory can point to a subdirectory in a monorepo.



### Execution modes

- **Remote**: Runs execute on HCP Terraform infrastructure.
- **Agent**: Runs execute on self-hosted HCP Terraform agents with private-network access.
- **Local**: HCP stores state, but commands execute on the operator's machine.

Agents initiate outbound connections, avoiding inbound access from HCP into private networks.

## Connect the CLI to HCP Terraform

Authenticate:

```bash
terraform login
```

Configure the HCP Terraform integration:

```hcl
terraform {
  cloud {
    organization = "example-org"

    workspaces {
      name = "network-production"
    }
  }
}
```

Then run:

```bash
terraform init
terraform plan
terraform apply
```

With remote execution, the CLI streams remote run output. HCP Terraform securely stores the workspace state.

When migrating from local/another backend, update the configuration and run `terraform init`; review and approve the offered state migration.

## Variables and variable sets

HCP Terraform has two variable categories:

- **Terraform variables**: Equivalent to input variables (`var.name`).
- **Environment variables**: Available to the process, such as provider settings.

Variables can be:

- Workspace-specific
- Applied through reusable **variable sets**
- Marked sensitive/write-only in the UI where supported

Variable sets distribute shared values such as regions, account identifiers, or credential configuration to multiple workspaces/projects. Resolve variable precedence carefully when the same key exists at several scopes.

## Dynamic provider credentials

HCP Terraform can use OIDC/workload identity to obtain short-lived cloud credentials for each run.

Benefits:

- No long-lived static cloud keys in workspace variables
- Credentials are scoped and expire automatically
- Separate plan and apply roles can enforce least privilege

Dynamic credentials require trust configuration in the target cloud and HCP environment variables identifying the role/account.

## Collaboration features

- **Teams and permissions**: Control read, plan, write, state, and administration access.
- **Run history**: Audit plans, applies, comments, approvals, and users.
- **State versioning**: Retain and recover previous state versions.
- **Notifications**: Send run events to supported integrations or webhooks.
- **Change requests**: Coordinate and review proposed infrastructure changes.
- **Run triggers**: Queue a downstream workspace after a successful upstream apply.

Run triggers coordinate loosely coupled workspaces but do not directly share state. Publish required outputs explicitly.

## Private registry

The HCP Terraform private registry distributes:

- Private modules
- Private providers

Benefits:

- Versioned reusable components
- Discoverability and documentation
- Controlled internal sharing
- VCS-backed module publishing

Private registry modules use the same module workflow and version constraints as public registry modules.

## Governance



### Policy as code

HCP Terraform can evaluate Sentinel and OPA policies against run data.

Policies can enforce requirements such as:

- Allowed cloud regions
- Mandatory tags
- Approved instance sizes
- Prohibited public access
- Cost or architecture constraints

Policy sets group policies and apply them to workspaces/projects. Enforcement can range from advisory to mandatory depending on policy framework and configuration.

Policies evaluate plans; they do not replace IAM/cloud-side controls. Use defense in depth.

### Run tasks

Run tasks integrate external systems into the run lifecycle for security scanning, cost checks, ticketing, or custom validation. Depending on configuration, failed mandatory tasks can stop a run.

### Health assessments

HCP Terraform health assessments include:

- **Drift detection**: Compares state/configuration with real infrastructure for out-of-band changes.
- **Continuous validation**: Evaluates `check` blocks outside normal apply runs.

Health assessments report problems; they do not automatically remediate infrastructure.

### Explorer

Explorer provides organization-wide visibility and queries across projects/workspaces, such as health, drift, resources, providers, and module usage.

## HCP Terraform exam traps

- HCP workspaces are not CLI workspaces.
- A speculative plan from a pull request cannot be applied.
- Projects organize workspaces; they do not share one state.
- Variable sets reuse values across workspaces/projects.
- Run triggers queue dependent workspace runs; they are not resource dependencies.
- Dynamic credentials avoid stored long-lived cloud credentials.
- Drift detection reports drift; it does not fix it.
- Remote state storage and remote execution are separate concepts.
- Agent execution reaches private networks through outbound agent connections.



## Official objective checklist


| Domain           | You must be able to explain/do                                    | Notes file                                                 |
| ---------------- | ----------------------------------------------------------------- | ---------------------------------------------------------- |
| 1. IaC           | Benefits, declarative workflow, multi-cloud                       | `Create Infra.md`                                          |
| 2. Fundamentals  | Providers, aliases, lock file, state purpose                      | `Create Infra.md`, `Lock and upgrade provider versions.md` |
| 3. Workflow      | init, fmt, validate, plan, apply, destroy                         | `Create Infra.md`                                          |
| 4. Configuration | Types, variables, expressions, dependencies, conditions, secrets  | `Manage.md`                                                |
| 5. Modules       | Sources, scope, usage, versions, providers                        | `Manage.md`                                                |
| 6. State         | Local/remote backends, locking, drift, moved/removed              | `Lock and upgrade provider versions.md`                    |
| 7. Maintain      | Import, state CLI, verbose logging                                | `Lock and upgrade provider versions.md`                    |
| 8. HCP Terraform | Runs, workspaces/projects, collaboration, governance, integration | This file                                                  |




## Commands to memorize

```bash
terraform version
terraform init
terraform init -upgrade
terraform fmt -recursive
terraform validate
terraform plan
terraform plan -out=tfplan
terraform show tfplan
terraform apply tfplan
terraform plan -refresh-only
terraform apply -refresh-only
terraform plan -replace=ADDRESS
terraform destroy
terraform output
terraform state list
terraform state show ADDRESS
terraform state mv OLD NEW
terraform state rm ADDRESS
terraform import ADDRESS ID
terraform workspace list
terraform providers
terraform force-unlock LOCK_ID
terraform login
```



## Suggested final preparation

1. Read all four note files and complete the official learning path.
2. Build one small project using variables, `for_each`, a child module, outputs, and a remote backend.
3. Practice introducing drift, using refresh-only mode, importing a resource, and moving its address.
4. Connect a test configuration to HCP Terraform and run a speculative VCS plan.
5. Complete the official sample questions without notes.
6. Revisit every incorrect answer in the objective checklist rather than memorizing question wording.



## Concepts most likely to be confused

- `resource` vs `data`
- `count` vs `for_each`
- implicit vs explicit dependency
- `sensitive` vs encrypted/ephemeral
- provider constraints vs lock-file selections
- module version vs provider lock
- local state vs remote state vs remote execution
- refresh-only vs normal apply
- `state rm` vs destroy vs `removed` block
- CLI import vs `import` block
- CLI workspace vs HCP workspace
- Config validation conditions vs HCP policy enforcement

