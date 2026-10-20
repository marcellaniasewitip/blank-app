output "api_url" {
  description = "Public HTTPS address of the API. Without api_domain/certificate it is the free CloudFront address."
  value       = local.https ? "https://${var.api_domain}" : "https://${aws_cloudfront_distribution.api[0].domain_name}"
}

output "alb_dns_name" {
  description = "Point the api_domain CNAME/alias here."
  value       = aws_lb.api.dns_name
}

output "admin_url" {
  value = var.admin_domain != "" ? "https://${var.admin_domain}" : "https://${aws_cloudfront_distribution.admin.domain_name}"
}

output "cloudfront_domain" {
  value = aws_cloudfront_distribution.admin.domain_name
}

output "cloudfront_distribution_id" {
  value = aws_cloudfront_distribution.admin.id
}

output "admin_bucket" {
  value = aws_s3_bucket.admin.bucket
}

output "uploads_bucket" {
  value = aws_s3_bucket.uploads.bucket
}

output "ecr_repository_url" {
  value = aws_ecr_repository.api.repository_url
}

output "ecs_cluster" {
  value = aws_ecs_cluster.main.name
}

output "task_families" {
  value = { api = aws_ecs_task_definition.api.family, worker = aws_ecs_task_definition.worker.family, migrate = aws_ecs_task_definition.migrate.family }
}

output "private_subnet_ids" {
  value = aws_subnet.private[*].id
}

output "app_security_group_id" {
  value = aws_security_group.app.id
}

output "deploy_role_arn" {
  value = var.github_repository != "" ? aws_iam_role.deploy[0].arn : null
}

output "secrets_to_fill" {
  description = "Set these in Secrets Manager after the first apply."
  value       = [for k, s in aws_secretsmanager_secret.external : s.name]
}
