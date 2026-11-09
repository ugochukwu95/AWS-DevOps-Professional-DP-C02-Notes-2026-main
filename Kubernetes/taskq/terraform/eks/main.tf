# COST WARNING: an EKS control plane, 2 t3.medium nodes and a NAT gateway cost
# roughly USD 6-8 per day. Run `terraform destroy` at the end of every session
# (delete the Ingress first so the controller removes the ALB; see note 11).

data "aws_availability_zones" "available" {
  state = "available"
}

locals {
  azs = slice(data.aws_availability_zones.available.names, 0, 3)
}

################################################################################
# VPC: public subnets for load balancers, private subnets for nodes and pods
################################################################################

module "vpc" {
  source  = "terraform-aws-modules/vpc/aws"
  version = "~> 6.0"

  name = var.cluster_name
  cidr = var.vpc_cidr
  azs  = local.azs

  private_subnets = [for i, _ in local.azs : cidrsubnet(var.vpc_cidr, var.private_subnet_newbits, i)]
  public_subnets  = [for i, _ in local.azs : cidrsubnet(var.vpc_cidr, 8, i + 48)]

  # One NAT gateway saves money; production uses one per AZ.
  enable_nat_gateway = true
  single_nat_gateway = true

  # The AWS Load Balancer Controller discovers subnets by these tags.
  public_subnet_tags  = { "kubernetes.io/role/elb" = 1 }
  private_subnet_tags = { "kubernetes.io/role/internal-elb" = 1 }
}

################################################################################
# EKS cluster, managed node group and add-ons
################################################################################

module "eks" {
  source  = "terraform-aws-modules/eks/aws"
  version = "~> 21.0"

  name               = var.cluster_name
  kubernetes_version = var.kubernetes_version

  # Public API endpoint so you can reach it from your laptop. Restrict with
  # endpoint_public_access_cidrs = ["<your-ip>/32"] in anything beyond a lab.
  endpoint_public_access = true

  # Gives the identity running Terraform cluster-admin through an access entry.
  enable_cluster_creator_admin_permissions = true

  vpc_id     = module.vpc.vpc_id
  subnet_ids = module.vpc.private_subnets

  addons = {
    vpc-cni = {
      before_compute = true
      configuration_values = jsonencode({
        env = {
          ENABLE_PREFIX_DELEGATION = tostring(var.enable_prefix_delegation)
        }
      })
    }
    eks-pod-identity-agent = {
      before_compute = true
    }
    kube-proxy         = {}
    coredns            = {}
    aws-ebs-csi-driver = {}
  }

  eks_managed_node_groups = {
    default = {
      ami_type       = "AL2023_x86_64_STANDARD"
      instance_types = var.node_instance_types

      min_size     = var.node_min_size
      max_size     = var.node_max_size
      desired_size = var.node_desired_size

      # Replace nodes one at a time during AMI or version updates.
      update_config = {
        max_unavailable = 1
      }
    }
  }

  access_entries = var.viewer_role_arn == "" ? {} : {
    taskq_viewers = {
      principal_arn     = var.viewer_role_arn
      kubernetes_groups = ["taskq-viewers"]
    }
  }
}

################################################################################
# Workload IAM with EKS Pod Identity (note 13)
################################################################################

module "ebs_csi_pod_identity" {
  source  = "terraform-aws-modules/eks-pod-identity/aws"
  version = "~> 2.0"

  name                      = "${var.cluster_name}-ebs-csi"
  attach_aws_ebs_csi_policy = true

  associations = {
    ebs = {
      cluster_name    = module.eks.cluster_name
      namespace       = "kube-system"
      service_account = "ebs-csi-controller-sa"
    }
  }
}

module "lb_controller_pod_identity" {
  source  = "terraform-aws-modules/eks-pod-identity/aws"
  version = "~> 2.0"

  name                            = "${var.cluster_name}-lb-controller"
  attach_aws_lb_controller_policy = true

  associations = {
    lbc = {
      cluster_name    = module.eks.cluster_name
      namespace       = "kube-system"
      service_account = "aws-load-balancer-controller"
    }
  }
}

module "worker_pod_identity" {
  source  = "terraform-aws-modules/eks-pod-identity/aws"
  version = "~> 2.0"

  name                 = "${var.cluster_name}-worker"
  attach_custom_policy = true
  policy_statements = [
    {
      sid       = "WriteResults"
      actions   = ["s3:PutObject"]
      resources = ["${aws_s3_bucket.results.arn}/results/*"]
    }
  ]

  associations = {
    worker = {
      cluster_name    = module.eks.cluster_name
      namespace       = "taskq"
      service_account = "worker"
    }
  }
}

################################################################################
# Application resources
################################################################################

resource "aws_s3_bucket" "results" {
  bucket_prefix = "${var.cluster_name}-results-"
  force_destroy = true
}

resource "aws_s3_bucket_public_access_block" "results" {
  bucket                  = aws_s3_bucket.results.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_ecr_repository" "taskq" {
  name                 = var.cluster_name
  image_tag_mutability = "IMMUTABLE"
  force_delete         = true

  image_scanning_configuration {
    scan_on_push = true
  }
}
