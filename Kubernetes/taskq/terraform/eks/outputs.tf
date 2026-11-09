output "region" {
  value = var.region
}

output "cluster_name" {
  value = module.eks.cluster_name
}

output "configure_kubectl" {
  value = "aws eks update-kubeconfig --region ${var.region} --name ${module.eks.cluster_name} --alias taskq-eks"
}

output "vpc_id" {
  value = module.vpc.vpc_id
}

output "private_subnets" {
  value = module.vpc.private_subnets
}

output "results_bucket" {
  value = aws_s3_bucket.results.id
}

output "ecr_repository_url" {
  value = aws_ecr_repository.taskq.repository_url
}
