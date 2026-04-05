# MDM Platform

Enterprise-grade Mobile Device Management platform for Android and iOS devices. Built as a multi-tenant, microservices architecture with real-time device communication, policy management, and compliance enforcement.

## Architecture

```
                              +-----------------+
                              |  Admin Console  |
                              |   (Next.js)     |
                              +--------+--------+
                                       |
                                  REST / WebSocket
                                       |
+--------------+           +-----------+-----------+
| Android/iOS  |-- gRPC -->|      API Gateway      |
|    Agent     |           +-----------+-----------+
+--------------+                       |
                   +-------------------+-------------------+
                   |         |         |         |         |
              +----v---+ +--v----+ +--v----+ +--v----+ +--v--------+
              |Device  | |Command| |Policy | |  App  | |Compliance |
              |Service | |Service| |Service| |Service| | Service   |
              +--------+ +-------+ +-------+ +-------+ +-----------+
              +----v---+ +--v----+ +--v----+ +--v----+ +--v--------+
              |Kiosk   | |Geofnc| | Cert  | |Report | |  Audit    |
              |Service | |Service| |Service| |Service| | Service   |
              +--------+ +-------+ +-------+ +-------+ +-----------+
              +----v---+ +--v----+ +--v--------+
              |  iOS   | |Remote | |Notification|
              |  MDM   | |Control| |  Service   |
              +--------+ +-------+ +------------+
                   |         |         |         |
              +----v---+ +--v----+ +--v----+ +--v----+
              |Postgres| | Redis | | NATS  | | MinIO |
              +--------+ +-------+ +-------+ +-------+
```

## Features

- **Device Management** - Enrollment (QR, NFC, Zero-Touch, Knox), inventory, remote actions (lock, wipe, reboot, message)
- **Policy Engine** - Restrictions, passcode, Wi-Fi, VPN policies with multi-level conflict resolution
- **Compliance** - Rule-based compliance evaluation, violation tracking, automated remediation
- **Kiosk Mode** - Single-app, multi-app, and digital signage lockdown
- **App Management** - App catalog, version management, silent install/uninstall
- **Geofencing** - Circle and polygon geofences with policy triggers
- **Remote Control** - Real-time screen viewing via WebRTC
- **Command Pipeline** - Reliable command delivery with FCM push, gRPC streaming, retry, and expiry
- **Compliance Scoring** - Organization-wide compliance dashboard with severity-based scoring
- **Reports** - Scheduled and on-demand reports (device inventory, compliance, audit)
- **Audit Logging** - Immutable audit trail for all admin actions
- **Multi-Tenancy** - Row-level security, per-tenant isolation
- **RBAC** - Admin, Helpdesk, and Viewer roles with granular permissions
- **SSO/LDAP** - SAML 2.0, OIDC, and LDAP directory integration
- **Webhooks** - Outbound webhooks for event-driven integrations
- **SCIM** - Automated user provisioning via SCIM 2.0
- **iOS Support** - DEP, APNs, configuration profiles (Phase 2)

## Quick Start

### Prerequisites

- Docker and Docker Compose
- Go 1.22+
- Node.js 20+ and pnpm 9+

### 1. Start infrastructure

```bash
docker compose up -d
```

### 2. Run database migrations

```bash
cd migrations && go run ./cmd/migrate up
```

### 3. Start the admin console

```bash
cd apps/admin-console
pnpm install
pnpm dev
```

### 4. Start backend services

```bash
# In separate terminals
cd services/device-service && go run ./cmd/server
cd services/command-service && go run ./cmd/server
cd services/policy-service && go run ./cmd/server
# ... other services as needed
```

Open http://localhost:3000 to access the admin console.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 14, React 18, TailwindCSS, shadcn/ui, TanStack Query |
| Backend Services | Go 1.22+ |
| Database | PostgreSQL 16 (TimescaleDB) |
| Cache | Redis 7 |
| Message Broker | NATS with JetStream |
| Object Storage | MinIO (S3-compatible) |
| Orchestration | Kubernetes (Helm), Terraform |
| Monitoring | Prometheus + Grafana |
| CI/CD | GitHub Actions |
| Protocols | gRPC, REST (OpenAPI 3.1), WebSocket, WebRTC |

## Project Structure

```
.
├── apps/
│   └── admin-console/       # Next.js admin dashboard
├── clients/
│   └── android/             # Android MDM agent (Kotlin)
├── docs/                    # Architecture, API, and deployment docs
├── infra/
│   ├── docker/              # Dockerfiles for services
│   ├── helm/                # Helm charts for Kubernetes
│   ├── monitoring/          # Prometheus, Grafana dashboards, alerts
│   ├── scripts/             # Utility scripts
│   └── terraform/           # Infrastructure as Code
├── migrations/              # Database migrations
├── packages/
│   ├── api-client/          # Shared TypeScript API client
│   ├── shared-types/        # Shared TypeScript types
│   └── ui/                  # Shared UI components
├── proto/                   # Protocol Buffer definitions
│   ├── command/
│   ├── common/
│   ├── device/
│   └── policy/
├── services/
│   ├── admin-api/           # REST API layer
│   ├── api-gateway/         # Auth, routing, rate limiting
│   ├── app-service/         # App catalog and distribution
│   ├── audit-service/       # Audit log storage and queries
│   ├── cert-service/        # PKI, SCEP, mTLS certificates
│   ├── command-service/     # Command dispatch and lifecycle
│   ├── compliance-service/  # Compliance evaluation engine
│   ├── device-service/      # Device enrollment and telemetry
│   ├── file-service/        # S3/MinIO file storage
│   ├── geofence-service/    # Geofencing and location events
│   ├── ios-mdm-service/     # Apple MDM protocol
│   ├── kiosk-service/       # Kiosk profile management
│   ├── notification-service/# Email, push, Slack/Teams
│   ├── policy-service/      # Policy CRUD and conflict resolution
│   ├── remote-control-service/ # WebRTC screen sharing
│   └── report-service/      # Report generation and scheduling
├── tests/
│   ├── api/                 # API integration tests (Vitest)
│   ├── e2e/                 # End-to-end tests (Playwright)
│   └── load/                # Load tests (k6)
├── docker-compose.yml       # Local development infrastructure
├── go.work                  # Go workspace
├── package.json             # Root monorepo config
├── pnpm-workspace.yaml      # pnpm workspace config
└── turbo.json               # Turborepo build config
```

## Documentation

- [Architecture](docs/architecture.md) - System overview, service map, data flows
- [API Guide](docs/api-guide.md) - Authentication, endpoints, examples
- [Deployment Guide](docs/deployment-guide.md) - Docker, Kubernetes, Terraform setup
- [Android Agent Guide](docs/android-agent-guide.md) - Enrollment, kiosk, troubleshooting
- [Admin Guide](docs/admin-guide.md) - Console usage, policies, compliance, SSO
- [OpenAPI Specification](docs/openapi.yaml) - Full API schema

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/my-feature`)
3. Commit your changes with clear, descriptive messages
4. Push to the branch (`git push origin feature/my-feature`)
5. Open a Pull Request

### Running Tests

```bash
# Go unit tests
cd services/device-service && go test ./...
cd services/command-service && go test ./...
cd services/compliance-service && go test ./...
cd services/policy-service && go test ./...

# API integration tests
cd tests/api && pnpm install && pnpm test

# E2E tests
cd tests/e2e && pnpm install && npx playwright install && pnpm test

# Load tests
cd tests/load && k6 run device-enrollment.js
```

## License

Proprietary. All rights reserved.
