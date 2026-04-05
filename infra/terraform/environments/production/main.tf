locals {
  environment = "production"
  region      = "us-east-1"
}

module "networking" {
  source      = "../../modules/networking"
  environment = local.environment
  vpc_cidr    = "10.0.0.0/16"
}

module "eks" {
  source             = "../../modules/eks"
  environment        = local.environment
  vpc_id             = module.networking.vpc_id
  private_subnet_ids = module.networking.private_subnet_ids
  cluster_version    = "1.29"
}

module "rds" {
  source             = "../../modules/rds"
  environment        = local.environment
  vpc_id             = module.networking.vpc_id
  private_subnet_ids = module.networking.private_subnet_ids
  db_password        = var.db_password
}

module "redis" {
  source             = "../../modules/redis"
  environment        = local.environment
  vpc_id             = module.networking.vpc_id
  private_subnet_ids = module.networking.private_subnet_ids
}

module "s3" {
  source      = "../../modules/s3"
  environment = local.environment
}

variable "db_password" {
  type      = string
  sensitive = true
}

output "eks_cluster_endpoint" {
  value = module.eks.cluster_endpoint
}

output "rds_endpoint" {
  value = module.rds.cluster_endpoint
}

output "redis_endpoint" {
  value = module.redis.primary_endpoint
}
