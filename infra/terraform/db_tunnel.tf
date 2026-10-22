# Optional secure route to the private database for admin tools (pgAdmin, DBeaver, psql).
#
# A t4g.nano instance in a private subnet with no inbound ports. You reach it only through
# AWS Systems Manager Session Manager (signed with your AWS credentials) and forward the
# database port to your PC with scripts/db-tunnel.sh. Enable with enable_db_tunnel = true.

data "aws_ssm_parameter" "al2023_arm64" {
  count = var.enable_db_tunnel ? 1 : 0
  name  = "/aws/service/ami-amazon-linux-latest/al2023-ami-kernel-default-arm64"
}

resource "aws_security_group" "db_tunnel" {
  count       = var.enable_db_tunnel ? 1 : 0
  name        = "${local.name}-db-tunnel"
  description = "Session Manager port-forwarding host (no inbound)"
  vpc_id      = aws_vpc.main.id
  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
}

resource "aws_iam_role" "db_tunnel" {
  count = var.enable_db_tunnel ? 1 : 0
  name  = "${local.name}-db-tunnel"
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "ec2.amazonaws.com" }
      Action    = "sts:AssumeRole"
    }]
  })
}

resource "aws_iam_role_policy_attachment" "db_tunnel_ssm" {
  count      = var.enable_db_tunnel ? 1 : 0
  role       = aws_iam_role.db_tunnel[0].name
  policy_arn = "arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore"
}

resource "aws_iam_instance_profile" "db_tunnel" {
  count = var.enable_db_tunnel ? 1 : 0
  name  = "${local.name}-db-tunnel"
  role  = aws_iam_role.db_tunnel[0].name
}

resource "aws_instance" "db_tunnel" {
  count                  = var.enable_db_tunnel ? 1 : 0
  ami                    = data.aws_ssm_parameter.al2023_arm64[0].value
  instance_type          = "t4g.nano"
  subnet_id              = aws_subnet.private[0].id
  vpc_security_group_ids = [aws_security_group.db_tunnel[0].id]
  iam_instance_profile   = aws_iam_instance_profile.db_tunnel[0].name

  metadata_options {
    http_tokens = "required"
  }

  root_block_device {
    volume_size = 8
    volume_type = "gp3"
    encrypted   = true
  }

  tags = { Name = "${local.name}-db-tunnel" }

  lifecycle {
    ignore_changes = [ami]
  }
}
