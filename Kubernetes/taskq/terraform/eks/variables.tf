variable "region" {
  type    = string
  default = "eu-west-1"
}

variable "cluster_name" {
  type    = string
  default = "taskq"
}

variable "kubernetes_version" {
  description = "Check supported versions: aws eks describe-cluster-versions --query 'clusterVersions[].clusterVersion'"
  type        = string
  default     = "1.35"
}

variable "vpc_cidr" {
  type    = string
  default = "10.0.0.0/16"
}

variable "private_subnet_newbits" {
  description = "Bits added to the VPC prefix for each private subnet: 4 gives /20 (4091 usable IPs). The IP exhaustion drill uses 11 (/27, 27 usable)."
  type        = number
  default     = 4
}

variable "node_instance_types" {
  type    = list(string)
  default = ["t3.medium"]
}

variable "node_min_size" {
  type    = number
  default = 2
}

variable "node_max_size" {
  type    = number
  default = 4
}

variable "node_desired_size" {
  type    = number
  default = 2
}

variable "enable_prefix_delegation" {
  description = "VPC CNI assigns /28 prefixes instead of single IPs to ENIs (more pods per node). See note 12."
  type        = bool
  default     = false
}

variable "viewer_role_arn" {
  description = "Optional IAM role mapped to the taskq-viewers Kubernetes group through an EKS access entry."
  type        = string
  default     = ""
}
