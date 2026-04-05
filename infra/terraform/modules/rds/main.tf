variable "environment" {
  type = string
}

variable "vpc_id" {
  type = string
}

variable "private_subnet_ids" {
  type = list(string)
}

variable "db_password" {
  type      = string
  sensitive = true
}

resource "aws_db_subnet_group" "main" {
  name       = "mdm-${var.environment}"
  subnet_ids = var.private_subnet_ids

  tags = {
    Name = "mdm-${var.environment}-db-subnet-group"
  }
}

resource "aws_security_group" "rds" {
  name   = "mdm-${var.environment}-rds-sg"
  vpc_id = var.vpc_id

  ingress {
    from_port   = 5432
    to_port     = 5432
    protocol    = "tcp"
    cidr_blocks = ["10.0.0.0/16"]
    description = "PostgreSQL from VPC"
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = {
    Name = "mdm-${var.environment}-rds-sg"
  }
}

resource "aws_rds_cluster" "main" {
  cluster_identifier     = "mdm-${var.environment}"
  engine                 = "aurora-postgresql"
  engine_version         = "16.1"
  database_name          = "mdm"
  master_username        = "mdm_admin"
  master_password        = var.db_password
  db_subnet_group_name   = aws_db_subnet_group.main.name
  vpc_security_group_ids = [aws_security_group.rds.id]

  backup_retention_period = 35
  preferred_backup_window = "03:00-04:00"
  storage_encrypted       = true
  deletion_protection     = true

  tags = {
    Name = "mdm-${var.environment}-aurora"
  }
}

resource "aws_rds_cluster_instance" "main" {
  count              = 2
  identifier         = "mdm-${var.environment}-${count.index + 1}"
  cluster_identifier = aws_rds_cluster.main.id
  instance_class     = "db.r6g.xlarge"
  engine             = aws_rds_cluster.main.engine
  engine_version     = aws_rds_cluster.main.engine_version

  tags = {
    Name = "mdm-${var.environment}-aurora-${count.index + 1}"
  }
}

output "cluster_endpoint" {
  value = aws_rds_cluster.main.endpoint
}

output "reader_endpoint" {
  value = aws_rds_cluster.main.reader_endpoint
}
