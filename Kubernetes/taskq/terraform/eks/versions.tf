terraform {
  required_version = ">= 1.9"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = ">= 6.0"
    }
  }

  # Local state is fine for a personal lab. For a team, use an S3 backend with locking:
  # backend "s3" {
  #   bucket       = "my-tf-state"
  #   key          = "taskq/eks.tfstate"
  #   region       = "eu-west-1"
  #   use_lockfile = true
  # }
}

provider "aws" {
  region = var.region

  default_tags {
    tags = {
      Project   = "taskq"
      ManagedBy = "terraform"
    }
  }
}
