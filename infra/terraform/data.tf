# ── PostgreSQL 16 (PostGIS is created by the first migration; RDS supports it) ──

resource "random_password" "db" {
  length  = 32
  special = false
}

resource "aws_db_subnet_group" "main" {
  name       = local.name
  subnet_ids = aws_subnet.private[*].id
}

resource "aws_db_parameter_group" "pg16" {
  name   = "${local.name}-pg16"
  family = "postgres16"
  parameter {
    name  = "rds.force_ssl"
    value = "1"
  }
  parameter {
    name  = "log_min_duration_statement"
    value = "500"
  }
}

resource "aws_db_instance" "main" {
  identifier                   = local.name
  engine                       = "postgres"
  engine_version               = "16"
  instance_class               = var.db_instance_class
  allocated_storage            = var.db_allocated_storage_gb
  max_allocated_storage        = var.db_allocated_storage_gb * 4
  storage_type                 = "gp3"
  storage_encrypted            = true
  db_name                      = "cooper"
  username                     = "cooper"
  password                     = random_password.db.result
  db_subnet_group_name         = aws_db_subnet_group.main.name
  vpc_security_group_ids       = [aws_security_group.db.id]
  parameter_group_name         = aws_db_parameter_group.pg16.name
  multi_az                     = var.db_multi_az
  backup_retention_period      = var.db_backup_retention_days
  backup_window                = "15:00-16:00" # 01:00–02:00 Port Moresby
  maintenance_window           = "sun:16:30-sun:17:30"
  auto_minor_version_upgrade   = true
  deletion_protection          = true
  skip_final_snapshot          = false
  final_snapshot_identifier    = "${local.name}-final"
  performance_insights_enabled = true
  copy_tags_to_snapshot        = true
  publicly_accessible          = false
}

# ── Redis (BullMQ queues + Socket.IO fan-out) ──

resource "random_password" "redis" {
  length  = 40
  special = false
}

resource "aws_elasticache_subnet_group" "main" {
  name       = local.name
  subnet_ids = aws_subnet.private[*].id
}

resource "aws_elasticache_parameter_group" "redis7" {
  name   = "${local.name}-redis7"
  family = "redis7"
  # BullMQ requires keys never be evicted.
  parameter {
    name  = "maxmemory-policy"
    value = "noeviction"
  }
}

resource "aws_elasticache_replication_group" "main" {
  replication_group_id       = local.name
  description                = "Cooper Waters queues and realtime"
  engine                     = "redis"
  engine_version             = "7.1"
  node_type                  = var.redis_node_type
  num_cache_clusters         = var.redis_multi_az ? 2 : 1
  automatic_failover_enabled = var.redis_multi_az
  multi_az_enabled           = var.redis_multi_az
  parameter_group_name       = aws_elasticache_parameter_group.redis7.name
  subnet_group_name          = aws_elasticache_subnet_group.main.name
  security_group_ids         = [aws_security_group.redis.id]
  at_rest_encryption_enabled = true
  transit_encryption_enabled = true
  auth_token                 = random_password.redis.result
  snapshot_retention_limit   = 3
}
