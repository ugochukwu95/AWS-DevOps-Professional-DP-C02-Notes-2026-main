# Terraform Associate 004: configuration and modules

## 4. Input variables
Input variables are a module's arguments.

```hcl
variable "instance_type" {
  description = "EC2 instance type"
  type        = string
  default     = "t3.micro"
  nullable    = false

  validation {
    condition     = startswith(var.instance_type, "t3.")
    error_message = "The instance type must be in the t3 family."
  }
}
```

- Without `default`, a variable is required.
- A type constraint validates and converts compatible input values.
- `nullable = false` rejects `null`.
- `sensitive = true` redacts the value from normal CLI/UI output but does not encrypt state.
- `ephemeral = true` omits eligible values from state and plan files; it can only flow into contexts that accept ephemeral values.

### Variable value precedence
Lowest to highest for local CLI runs:
1. `default`
2. `TF_VAR_name` environment variable
3. `terraform.tfvars`
4. `terraform.tfvars.json`
5. `*.auto.tfvars` / `*.auto.tfvars.json` in lexical order
6. `-var` and `-var-file` options in command-line order

HCP Terraform uses variable sets and workspace variables with its own precedence rules.

## Types and values
Primitive types:
- `string`
- `number`
- `bool`

Collection and structural types:

### `list` — ordered, indexed, duplicates allowed
```hcl
variable "subnets" {
  type = list(string)
  default = ["subnet-a", "subnet-b", "subnet-a"]
}

# Access
var.subnets[0]      # "subnet-a" — first element (zero-based index)
var.subnets[1]      # "subnet-b"
length(var.subnets) # 3

# Use in resources
resource "aws_instance" "app" {
  subnet_id = var.subnets[0]
}

# Iterate over all elements
resource "aws_subnet" "example" {
  for_each = toset(var.subnets) # toset deduplicates if needed
  # ...
}
```

### `set` — unordered, unique elements only
```hcl
variable "availability_zones" {
  type = set(string)
  default = ["eu-west-1a", "eu-west-1b", "eu-west-1a"] # stored as two unique values
}

# Access — sets have no index; convert to list or iterate
tolist(var.availability_zones)[0] # one element; order not guaranteed
length(var.availability_zones)    # 2

# Preferred: iterate (order not guaranteed)
resource "aws_subnet" "az" {
  for_each = var.availability_zones
  availability_zone = each.key
}
```

### `map` — string keys, same value type
```hcl
variable "instance_types" {
  type = map(string)
  default = {
    web = "t3.micro"
    db  = "t3.small"
  }
}

# Access
var.instance_types["web"]  # "t3.micro"
var.instance_types.web     # same — dot syntax when key is a valid identifier
lookup(var.instance_types, "api", "t3.micro") # default if key missing

# Iterate
resource "aws_instance" "tier" {
  for_each      = var.instance_types
  instance_type = each.value
  tags = { Role = each.key }
}
```

### `tuple` — fixed length, fixed type per position
```hcl
variable "endpoint" {
  type    = tuple([string, number, bool])
  default = ["api.example.com", 443, true]
}

# Access by position — each index has its own type
var.endpoint[0] # string — "api.example.com"
var.endpoint[1] # number — 443
var.endpoint[2] # bool   — true
```

### `object` — named attributes with declared types
```hcl
variable "service" {
  type = object({
    name    = string
    enabled = optional(bool, true)
    tags    = map(string)
  })
  default = {
    name = "billing"
    tags = { Team = "platform" }
    # enabled omitted → defaults to true
  }
}

# Access by attribute name
var.service.name              # "billing"
var.service.enabled           # true
var.service.tags["Team"]      # "platform"
var.service.tags.Team         # same — dot syntax for valid identifiers
```

| Type | Access pattern | Notes |
| --- | --- | --- |
| `list` | `var.name[0]` | Ordered; duplicates allowed |
| `set` | `for_each = var.name` or `tolist(var.name)[0]` | No direct index; unique values |
| `map` | `var.name["key"]` or `var.name.key` | Keys are strings |
| `tuple` | `var.name[0]`, `var.name[1]`, … | Fixed length and per-index types |
| `object` | `var.name.attr` or `var.name.tags["key"]` | Named fields; use `optional()` for defaults |

- `null` means absence/omission; `unknown` means Terraform cannot know the value until apply.

## Local values and outputs
```hcl
locals {
  common_tags = {
    Environment = var.environment
    ManagedBy   = "Terraform"
  }
  name_prefix = "${var.environment}-${var.application}"
}

output "instance_hostname" {
  description = "Private hostname of the app server"
  value       = aws_instance.app.private_dns
  sensitive   = false
}
```

- Locals name reusable expressions inside a module; callers cannot set them.
- Root outputs appear after apply and can be read with `terraform output`.
- Child-module outputs expose values to the calling module as `module.<name>.<output>`.
- Marking an output sensitive only redacts display; the value can still be stored in state.

## References and dependencies
```hcl
resource "aws_instance" "app" {
  subnet_id = aws_subnet.app.id
}
```

The reference creates an **implicit dependency**. Terraform uses references to build a directed acyclic graph.

Use explicit `depends_on` only for a dependency Terraform cannot infer:
```hcl
resource "aws_instance" "app" {
  depends_on = [aws_iam_role_policy.app]
}
```

Overusing `depends_on` creates conservative plans and more unknown values.

## Meta-arguments

### `count`
```hcl
resource "aws_instance" "worker" {
  count         = 3
  instance_type = "t3.micro"
  ami           = data.aws_ami.ubuntu.id
}

output "worker_ids" {
  value = aws_instance.worker[*].id
}
```

Addresses are index-based: `aws_instance.worker[0]`. Use `count` for nearly identical instances where index identity is stable.

### `for_each`
```hcl
resource "aws_s3_bucket" "logs" {
  for_each = toset(["dev", "stage", "prod"])
  bucket   = "example-${each.key}-logs"
}
```

Addresses use stable keys: `aws_s3_bucket.logs["prod"]`. `for_each` accepts a map or set of strings and its keys must be known before remote actions.

Do not use `count` and `for_each` in the same block. Prefer `for_each` when each instance has meaningful identity.

### Lifecycle
```hcl
resource "aws_instance" "app" {
  lifecycle {
    create_before_destroy = true
    prevent_destroy       = true
    ignore_changes        = [tags["LastPatched"]]

    precondition {
      condition     = data.aws_ami.ubuntu.architecture == "x86_64"
      error_message = "The AMI must use x86_64."
    }
  }
}
```

- `create_before_destroy`: Create replacement first when possible.
- `prevent_destroy`: Reject plans that would destroy the resource; removing the block also removes protection.
- `ignore_changes`: Ignore specified remote attribute updates after creation.
- `replace_triggered_by`: Replace when referenced managed resources/attributes change.
```hcl
resource "random_id" "suffix" {
  byte_length = 4
}

resource "aws_s3_bucket" "logs" {
  bucket = "my-logs-${random_id.suffix.hex}"

  lifecycle {
    replace_triggered_by = [
      random_id.suffix
    ]
  }
}
```
Scenario:
- Bucket exists with suffix a1b2c3d4.
- You change random_id.suffix (or taint/replace it) → new hex value.
- Bucket name in config changes — but S3 bucket names often can’t be updated in place anyway.
- replace_triggered_by ensures Terraform plans destroy + create for the bucket when the random_id changes, with an explicit dependency lin

## Expressions and functions

### Conditional
```hcl
instance_type = var.environment == "prod" ? "m7i.large" : "t3.micro"
```

Both result expressions must have compatible types.

### `for` expressions
```hcl
locals {
  uppercase = [for name in var.names : upper(name)]
  enabled   = { for k, v in var.services : k => v if v.enabled }
}
```

### Splat expressions
```hcl
aws_instance.worker[*].private_ip
```

### Dynamic blocks
Generate repeated **nested blocks**, not resource blocks:
```hcl
dynamic "ingress" {
  for_each = var.ingress_rules
  content {
    from_port   = ingress.value.port
    to_port     = ingress.value.port
    protocol    = "tcp"
    cidr_blocks = ingress.value.cidrs
  }
}
```

### Common functions
| Category | Examples |
| --- | --- |
| String | `format`, `join`, `split`, `replace`, `lower` |
| Collection | `length`, `merge`, `concat`, `flatten`, `distinct`, `lookup` |
| Type conversion | `toset`, `tolist`, `tomap`, `tostring` |
| Filesystem | `file`, `templatefile`, `fileset` |
| Encoding | `jsonencode`, `yamlencode`, `base64encode` |
| IP network | `cidrsubnet`, `cidrhost` |
| Safety | `try`, `can`, `coalesce` |

Terraform functions are called directly; there are no user-defined functions in standard HCL.

## Custom conditions
| Condition | Location | Purpose |
| --- | --- | --- |
| Variable `validation` | `variable` block | Reject invalid module input |
| `precondition` | Resource/data/output lifecycle | Validate assumptions before operation |
| `postcondition` | Resource/data/output lifecycle | Validate guarantees after evaluation/apply |
| `check` block | Root module | Continuous assertion that warns without blocking apply |

```hcl
check "health" {
  data "http" "app" {
    url = "https://${aws_lb.app.dns_name}/health"
  }

  assert {
    condition     = data.http.app.status_code == 200
    error_message = "Application health endpoint failed."
  }
}
```

Variable validations, preconditions, and postconditions can stop an operation. A failed `check` reports a warning and updates check status but does not block infrastructure changes.

### Key behavior (exam trap)

| | `precondition` / `postcondition` | `check` block |
| --- | --- | --- |
| Failed condition | Blocks plan/apply | Warning only — apply still proceeds |
| Scope | On a specific resource/data/output | Root module only |
| Typical use | Guard one operation | Continuous validation (health, config drift checks) |

HCP Terraform continuous validation can evaluate `check` blocks outside normal apply runs.

## Sensitive data and secrets
- Never commit credentials or secret `.tfvars`.
- Use provider-native credential chains, workload identity, or HCP Terraform dynamic credentials.
- Retrieve secrets from a secret manager or Vault at runtime.
- Mark variables/outputs `sensitive`, but remember ordinary sensitive values remain in state.
- Protect state and plan artifacts with encryption and access controls.
- Avoid provisioner command lines that expose secrets in logs or process lists.

The Vault provider can read dynamic, short-lived credentials, but values read into ordinary managed configuration can still reach state. Use ephemeral values/write-only arguments where supported.

## 5. Modules
Every Terraform configuration is a module:
- The directory where Terraform runs is the **root module**.
- A module called by another module is a **child module**.

```hcl
module "vpc" {
  source  = "terraform-aws-modules/vpc/aws"
  version = "~> 5.19"

  name            = "example-vpc"
  cidr            = "10.0.0.0/16"
  azs             = ["us-west-2a", "us-west-2b"]
  private_subnets = ["10.0.1.0/24", "10.0.2.0/24"]
}

output "vpc_id" {
  value = module.vpc.vpc_id
}
```

### Module sources
| Source | Example |
| --- | --- |
| Local | `./modules/vpc` |
| Public registry | `terraform-aws-modules/vpc/aws` |
| Private registry | `app.terraform.io/org/vpc/aws` |
| Git | `git::https://example.com/vpc.git?ref=v1.2.0` |
| S3/HTTP/other supported source | Source-specific URL |

- `version` works only for registry modules.
- Pin module versions for reproducibility.
- For Git, pin `ref` to a tag or commit rather than an unbounded branch.
- Run `terraform init` after adding/changing module sources; use `init -upgrade` to select newer allowed versions.
- Module versions are not recorded in `.terraform.lock.hcl`.

### Module variable scope
Child modules have isolated namespaces:
- Pass values through module arguments.
- Read results through child outputs.
- Child modules cannot directly access parent variables or resources.
- A child module declaring `required_providers` receives compatible provider configurations from its caller by default.

Reusable child modules should declare provider **requirements**, not contain environment-specific provider configurations.

For aliased providers:
```hcl
module "replica" {
  source = "./modules/database"

  providers = {
    aws = aws.east
  }
}
```

### Module design
- Keep modules focused and composable.
- Expose required inputs and useful outputs.
- Document types, descriptions, and constraints.
- Avoid thin wrappers around single resources unless they enforce meaningful policy.
- Use module `count` or `for_each` to create multiple module instances.

## Configuration exam traps
- Resources are managed; data sources are read-only.
- Locals cannot be overridden by callers.
- Sets are unordered and deduplicate values.
- `for_each` keys provide more stable identity than changing `count` indices.
- `depends_on` is for hidden dependencies, not normal attribute references.
- `prevent_destroy` is configuration protection, not an immutable cloud-side lock.
- Registry modules support `version`; Git/local modules do not.
- Child modules receive values explicitly and expose values through outputs.