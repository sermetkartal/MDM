# API Guide

## Authentication

The MDM API supports two authentication methods:

### JWT Bearer Token

Obtain a token by calling the login endpoint, then include it in subsequent requests.

```bash
# Login
curl -X POST http://localhost:3001/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email": "admin@example.com", "password": "your_password"}'

# Use the token
curl http://localhost:3001/api/v1/devices \
  -H "Authorization: Bearer <token>"
```

### API Key

For service-to-service or automation use cases, create an API key in Settings > API Keys.

```bash
curl http://localhost:3001/api/v1/devices \
  -H "x-api-key: mdm_live_abc123..."
```

## Base URL and Versioning

| Environment | Base URL |
|-------------|----------|
| Local | `http://localhost:3001/api/v1` |
| Staging | `https://api.staging.mdm.example.com/api/v1` |
| Production | `https://api.mdm.example.com/api/v1` |

All endpoints are versioned under `/v1`. Breaking changes will increment the version prefix.

## Request / Response Format

- Request bodies: JSON (`Content-Type: application/json`)
- Successful responses: `200 OK` or `201 Created` with JSON body
- Delete operations: `204 No Content`

Single resource response:

```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "name": "Production Lockdown",
  "policyType": "restrictions",
  "version": 3,
  "isActive": true,
  "createdAt": "2026-01-15T10:30:00Z",
  "updatedAt": "2026-03-20T14:22:00Z"
}
```

## Pagination

List endpoints accept standard pagination parameters:

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `page` | integer | 1 | Page number (1-indexed) |
| `limit` | integer | 25 | Items per page (max 100) |
| `sortBy` | string | `createdAt` | Sort field |
| `sortOrder` | string | `desc` | `asc` or `desc` |

Paginated response:

```json
{
  "data": [ ... ],
  "pagination": {
    "page": 1,
    "limit": 25,
    "total": 142,
    "totalPages": 6
  }
}
```

## Error Format

All errors follow a consistent structure:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid request body",
    "details": [
      { "field": "email", "message": "must be a valid email address" }
    ]
  }
}
```

Common error codes:

| HTTP Status | Code | Description |
|-------------|------|-------------|
| 400 | `VALIDATION_ERROR` | Invalid request body or parameters |
| 401 | `UNAUTHORIZED` | Missing or invalid authentication |
| 403 | `FORBIDDEN` | Insufficient permissions |
| 404 | `NOT_FOUND` | Resource does not exist |
| 409 | `CONFLICT` | Duplicate resource or state conflict |
| 429 | `RATE_LIMITED` | Too many requests |
| 500 | `INTERNAL_ERROR` | Server error |

## Rate Limiting

Rate limits are applied per API key or user session:

| Tier | Limit | Window |
|------|-------|--------|
| Standard | 100 requests | 1 minute |
| Bulk operations | 10 requests | 1 minute |
| Auth endpoints | 20 requests | 1 minute |

Rate limit headers included in every response:

```
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 87
X-RateLimit-Reset: 1711234567
```

## Quick Start Examples

### Login

```bash
TOKEN=$(curl -s -X POST http://localhost:3001/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email": "admin@example.com", "password": "password123"}' \
  | jq -r '.token // .accessToken // .data.token')
```

### List Devices

```bash
curl -s http://localhost:3001/api/v1/devices?page=1&limit=10 \
  -H "Authorization: Bearer $TOKEN" | jq
```

### Create a Policy

```bash
curl -s -X POST http://localhost:3001/api/v1/policies \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Security Baseline",
    "policyType": "restrictions",
    "platform": "android",
    "payload": {
      "camera_disabled": true,
      "usb_disabled": true,
      "min_password_length": 8
    }
  }' | jq
```

### Dispatch a Command

```bash
curl -s -X POST http://localhost:3001/api/v1/commands \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "deviceId": "DEVICE_UUID",
    "commandType": "lock",
    "payload": {"message": "This device has been locked by IT."}
  }' | jq
```

### Search Audit Logs

```bash
curl -s "http://localhost:3001/api/v1/audit?action=device.enrolled&from=2026-01-01" \
  -H "Authorization: Bearer $TOKEN" | jq
```

For the full OpenAPI specification, see [openapi.yaml](./openapi.yaml).
