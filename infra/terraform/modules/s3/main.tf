variable "environment" {
  type = string
}

locals {
  buckets = {
    apps     = "mdm-${var.environment}-apps"
    certs    = "mdm-${var.environment}-certs"
    reports  = "mdm-${var.environment}-reports"
    backups  = "mdm-${var.environment}-backups"
  }
}

resource "aws_s3_bucket" "main" {
  for_each = local.buckets
  bucket   = each.value

  tags = {
    Name = each.value
  }
}

resource "aws_s3_bucket_versioning" "main" {
  for_each = aws_s3_bucket.main
  bucket   = each.value.id

  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "main" {
  for_each = aws_s3_bucket.main
  bucket   = each.value.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_s3_bucket_public_access_block" "main" {
  for_each = aws_s3_bucket.main
  bucket   = each.value.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_lifecycle_configuration" "backups" {
  bucket = aws_s3_bucket.main["backups"].id

  rule {
    id     = "archive-old-backups"
    status = "Enabled"

    transition {
      days          = 30
      storage_class = "STANDARD_IA"
    }

    transition {
      days          = 90
      storage_class = "GLACIER"
    }

    expiration {
      days = 365
    }
  }
}

output "bucket_arns" {
  value = { for k, v in aws_s3_bucket.main : k => v.arn }
}

output "bucket_names" {
  value = { for k, v in aws_s3_bucket.main : k => v.id }
}
