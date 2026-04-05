# Deployment Guide

## Prerequisites

| Tool | Version | Purpose |
|------|---------|---------|
| Go | 1.22+ | Backend services |
| Node.js | 20+ | Admin console, API gateway |
| pnpm | 9+ | Node package manager |
| Docker | 24+ | Containerization |
| Docker Compose | 2.20+ | Local development |
| Kubernetes | 1.28+ | Production orchestration |
| Helm | 3.14+ | K8s package management |
| Terraform | 1.7+ | Infrastructure provisioning |

## Local Development with Docker Compose

### 1. Start infrastructure

```bash
docker compose up -d
```

This starts PostgreSQL (TimescaleDB), Redis, NATS, and MinIO.

### 2. Run database migrations

```bash
cd migrations
go run ./cmd/migrate up
```

### 3. Start the admin console

```bash
cd apps/admin-console
pnpm install
pnpm dev
```

The console will be available at `http://localhost:3000`.

### 4. Start Go services (in separate terminals)

```bash
cd services/device-service && go run ./cmd/server
cd services/command-service && go run ./cmd/server
cd services/policy-service && go run ./cmd/server
cd services/compliance-service && go run ./cmd/server
# ... repeat for other services
```

### 5. Verify

- Admin Console: http://localhost:3000
- API Gateway: http://localhost:3001/api/v1/health
- NATS Dashboard: http://localhost:8222
- MinIO Console: http://localhost:9001

## Production Kubernetes with Helm

### 1. Add the Helm repository

```bash
cd infra/helm
```

### 2. Configure values

Create a `values-prod.yaml` with your environment-specific overrides:

```yaml
global:
  domain: mdm.example.com
  tls:
    enabled: true
    secretName: mdm-tls-cert

postgres:
  host: your-rds-endpoint.amazonaws.com
  port: 5432
  database: mdm
  existingSecret: mdm-db-credentials

redis:
  host: your-elasticache-endpoint.amazonaws.com
  port: 6379

nats:
  url: nats://nats.mdm-system.svc:4222

services:
  replicas: 3
  resources:
    requests:
      cpu: 250m
      memory: 256Mi
    limits:
      cpu: 1000m
      memory: 1Gi
```

### 3. Deploy

```bash
helm upgrade --install mdm ./infra/helm/mdm \
  -f values-prod.yaml \
  -n mdm-system --create-namespace
```

### 4. Verify the deployment

```bash
kubectl get pods -n mdm-system
kubectl get svc -n mdm-system
```

## Terraform Infrastructure Setup

Terraform modules are in `infra/terraform/`. They provision:

- VPC with public/private subnets
- RDS PostgreSQL (TimescaleDB)
- ElastiCache Redis
- EKS cluster
- S3 bucket (or MinIO on self-hosted)
- NAT Gateway, security groups

### 1. Initialize

```bash
cd infra/terraform
terraform init
```

### 2. Plan and apply

```bash
terraform plan -var-file=prod.tfvars -out=plan.out
terraform apply plan.out
```

## Environment Variables Reference

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `DATABASE_URL` | Yes | - | PostgreSQL connection string |
| `REDIS_URL` | Yes | - | Redis connection string |
| `NATS_URL` | Yes | `nats://localhost:4222` | NATS server URL |
| `JWT_SECRET` | Yes | - | Secret for signing JWT tokens |
| `FCM_CREDENTIALS` | Yes | - | Firebase Cloud Messaging credentials JSON |
| `S3_ENDPOINT` | No | - | MinIO/S3 endpoint |
| `S3_ACCESS_KEY` | No | - | S3 access key |
| `S3_SECRET_KEY` | No | - | S3 secret key |
| `S3_BUCKET` | No | `mdm-files` | S3 bucket name |
| `SMTP_HOST` | No | - | SMTP server for email notifications |
| `SMTP_PORT` | No | `587` | SMTP port |
| `SLACK_WEBHOOK_URL` | No | - | Slack incoming webhook URL |
| `LOG_LEVEL` | No | `info` | Log level (debug, info, warn, error) |
| `PORT` | No | `3001` | API gateway port |

## SSL/TLS Setup

### Let's Encrypt with cert-manager (Kubernetes)

```yaml
# Install cert-manager
kubectl apply -f https://github.com/cert-manager/cert-manager/releases/latest/download/cert-manager.yaml

# Create ClusterIssuer
apiVersion: cert-manager.io/v1
kind: ClusterIssuer
metadata:
  name: letsencrypt-prod
spec:
  acme:
    server: https://acme-v02.api.letsencrypt.org/directory
    email: ops@example.com
    privateKeySecretRef:
      name: letsencrypt-prod
    solvers:
      - http01:
          ingress:
            class: nginx
```

### mTLS for device communication

The Cert Service issues device client certificates via SCEP. The API Gateway validates mTLS on gRPC endpoints used by the Android agent.

## Monitoring Setup (Prometheus + Grafana)

Monitoring configuration is in `infra/monitoring/`.

### Prometheus

Each Go service exposes metrics on `/metrics` (Prometheus format). Key metrics:

- `mdm_devices_total` - Total enrolled devices by status
- `mdm_commands_dispatched_total` - Commands dispatched by type
- `mdm_command_latency_seconds` - Command delivery latency histogram
- `mdm_compliance_violations_total` - Active violations by severity
- `mdm_heartbeat_lag_seconds` - Time since last heartbeat per device

### Grafana Dashboards

Pre-built dashboards are in `infra/monitoring/dashboards/`:

- **Fleet Overview** - Device count, enrollment trends, compliance score
- **Command Pipeline** - Dispatch rate, delivery latency, failure rate
- **Compliance** - Violation trends, top failing rules, score over time
- **Infrastructure** - Service health, DB connections, NATS throughput

### Alerting Rules

Alerts are defined in `infra/monitoring/alerts/`:

- Device offline > 1 hour (high)
- Command failure rate > 5% (critical)
- Compliance score < 80% (warning)
- Service health check failing (critical)
- Database connection pool exhaustion (critical)
