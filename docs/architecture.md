# Architecture

## System Overview

```
                                 +-----------------+
                                 |  Admin Console  |
                                 |   (Next.js)     |
                                 +--------+--------+
                                          |
                                          | REST/WebSocket
                                          v
+----------------+            +-----------+-----------+
|  Android Agent | -- gRPC -->|      API Gateway      |<-- SCIM/REST -- IdP
|    (Kotlin)    |            |    (Go / Express)     |
+----------------+            +-----------+-----------+
                                          |
                    +---------------------+---------------------+
                    |           |          |          |          |
               +----v----+ +---v----+ +---v----+ +---v----+ +---v--------+
               | Device  | |Command | |Policy  | | App    | | Compliance |
               | Service | |Service | |Service | |Service | |  Service   |
               +---------+ +--------+ +--------+ +--------+ +------------+
               +----v----+ +---v----+ +---v----+ +---v----+ +---v--------+
               | Kiosk   | |Geofence| |Cert    | |Report  | |   Audit    |
               | Service | |Service | |Service | |Service | |  Service   |
               +---------+ +--------+ +--------+ +--------+ +------------+
               +----v----+ +---v----+
               |  iOS    | | Remote |
               |  MDM    | |Control |
               +---------+ +--------+
                    |           |          |          |          |
                    +-----+----+----+-----+----+-----+----+----+
                          |         |          |          |
                     +----v---+ +---v----+ +---v---+ +---v----+
                     |Postgres| | Redis  | | NATS  | | MinIO  |
                     +--------+ +--------+ +-------+ +--------+
```

## Service Responsibilities

| Service | Port | Responsibility |
|---------|------|----------------|
| API Gateway | 3001 | Auth, routing, rate limiting, request validation |
| Admin API | 3001 | REST endpoints for the admin console |
| Device Service | 50051 | Enrollment, heartbeat, device lifecycle, telemetry |
| Command Service | 50052 | Command dispatch, retry, expiry, FCM push |
| Policy Service | 50053 | Policy CRUD, conflict resolution, effective policy computation |
| App Service | 50054 | App catalog, version management, app assignment |
| Compliance Service | 50055 | Rule evaluation, violation tracking, scoring |
| Kiosk Service | 50056 | Kiosk profile management, lockdown configuration |
| Geofence Service | 50057 | Geofence CRUD, location event processing, triggers |
| Cert Service | 50058 | Certificate authority, SCEP, mTLS cert issuance |
| Report Service | 50059 | Report generation, scheduling, template management |
| Audit Service | 50060 | Audit log ingestion and querying |
| Notification Service | 50061 | Email, push, Slack/Teams notifications |
| iOS MDM Service | 50062 | APNs, DEP, MDM protocol for Apple devices |
| Remote Control Service | 50063 | WebRTC signaling, screen sharing, remote view |
| File Service | 50064 | S3/MinIO file storage for APKs, logs, reports |

## Communication Patterns

| Pattern | Technology | Use Case |
|---------|-----------|----------|
| Synchronous API | REST (HTTP/JSON) | Admin console to API gateway |
| Inter-service RPC | gRPC (Protocol Buffers) | Service-to-service calls |
| Event streaming | NATS JetStream | Async events (heartbeat, enrollment, compliance) |
| Real-time push | WebSocket | Live device status, command results to console |
| Device push | FCM (Firebase Cloud Messaging) | Wake device for command delivery |
| Device streaming | gRPC bidirectional stream | Command delivery and acknowledgement |

## Data Flow Diagrams

### Device Enrollment

```
Agent -> API Gateway: POST /v1/enroll (serial, hardware_id, CSR)
API Gateway -> Cert Service: Validate CSR, issue client certificate
API Gateway -> Device Service: Create device record
Device Service -> NATS: Publish "device.enrolled"
NATS -> Compliance Service: Evaluate initial compliance
NATS -> Audit Service: Log enrollment event
API Gateway -> Agent: 200 OK (cert, config, policies)
```

### Command Dispatch

```
Admin -> API Gateway: POST /v1/commands {device_id, type: "lock"}
API Gateway -> Command Service: Create command (status: pending)
Command Service -> NATS: Publish to command queue
Command Service -> FCM: Push notification to wake device
Agent -> Device Service: gRPC stream connect
Device Service -> Agent: Send pending command
Agent -> Device Service: ACK (status: completed)
Device Service -> NATS: Publish "command.status_changed"
NATS -> WebSocket Bridge: Push status update to console
```

### Heartbeat

```
Agent -> Device Service: gRPC Heartbeat (battery, storage, apps, security)
Device Service -> DB: Update last_seen_at, telemetry
Device Service -> NATS: Publish "device.heartbeat"
NATS -> Compliance Service: Re-evaluate device state
Compliance Service -> DB: Create/resolve violations
Compliance Service -> NATS: Publish "compliance.changed" (if changed)
```

### Policy Deployment

```
Admin -> API Gateway: PUT /v1/policies/:id (updated payload)
API Gateway -> Policy Service: Update policy, increment version
Policy Service -> Policy Service: Resolve conflicts (multi-level merge)
Policy Service -> NATS: Publish "policy.updated"
NATS -> Command Service: Queue SET_POLICY commands for affected devices
Command Service -> FCM: Push to affected devices
Agent -> Device Service: gRPC stream, receive new policy
Agent: Apply policy locally
```

## Technology Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 14, React 18, TailwindCSS, shadcn/ui, TanStack Query |
| API Gateway | Go / Express.js |
| Backend Services | Go 1.22+ |
| Database | PostgreSQL 16 (TimescaleDB for telemetry) |
| Cache | Redis 7 |
| Message Broker | NATS with JetStream |
| Object Storage | MinIO (S3-compatible) |
| Container Orchestration | Kubernetes (Helm charts) |
| Infrastructure as Code | Terraform (AWS/GCP) |
| Monitoring | Prometheus + Grafana |
| CI/CD | GitHub Actions |
| Protocol | gRPC (Protobuf), REST (OpenAPI 3.1) |

## Database Schema Overview

The platform uses a multi-tenant PostgreSQL database with Row-Level Security (RLS). Each table includes an `org_id` column for tenant isolation. Key tables:

- `organizations` - Tenant accounts
- `users` - Admin console users with RBAC roles
- `devices` - Enrolled device inventory
- `commands` / `command_history` - Command lifecycle tracking
- `policies` / `policy_assignments` - Policy definitions and assignments
- `compliance_rules` / `compliance_violations` - Compliance engine state
- `apps` / `app_versions` / `app_assignments` - Application catalog
- `kiosk_profiles` - Kiosk lockdown configurations
- `geofences` / `geofence_triggers` - Geofencing rules
- `certificates` - Device and CA certificates
- `audit_logs` - Immutable audit trail (TimescaleDB hypertable)
- `groups` / `group_memberships` - Static and dynamic device groups
- `webhooks` / `webhook_deliveries` - Outbound webhook configuration
