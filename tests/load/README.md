# MDM Platform Load Tests

Load tests using [k6](https://k6.io/) to validate platform performance under stress.

## Prerequisites

- [k6](https://k6.io/docs/get-started/installation/) installed
- MDM platform running (locally or target environment)
- For gRPC tests: proto files available at `../../proto/`

## Test Scenarios

| Test | File | VUs | Description |
|------|------|-----|-------------|
| Device Enrollment | `device-enrollment.js` | 100 | Simulates 1000 devices enrolling via gRPC |
| Heartbeat Storm | `heartbeat-storm.js` | 10,000 | Concurrent heartbeats at scale |
| Command Dispatch | `command-dispatch.js` | 1,000 | REST command create/check/verify lifecycle |
| Admin API CRUD | `admin-api-crud.js` | 500 | Mixed CRUD (50R/30C/15U/5D) on all resources |
| WebSocket Connections | `websocket-connections.js` | 5,000 | Concurrent WS connections receiving events |

## Running Tests

### Against local environment

```bash
# Single test
k6 run device-enrollment.js

# With custom target
k6 run -e API_GATEWAY_URL=http://staging:8080 admin-api-crud.js

# With custom auth
k6 run -e ADMIN_TOKEN=your-token command-dispatch.js
```

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `API_GATEWAY_URL` | `http://localhost:8080` | API gateway base URL |
| `DEVICE_SERVICE_URL` | `localhost:50051` | Device service gRPC address |
| `POLICY_SERVICE_URL` | `localhost:50052` | Policy service gRPC address |
| `COMMAND_SERVICE_URL` | `localhost:50053` | Command service gRPC address |
| `WS_URL` | `ws://localhost:8080/ws` | WebSocket endpoint base URL |
| `ADMIN_TOKEN` | `test-admin-token` | Auth token for API requests |

### Run all tests sequentially

```bash
for f in device-enrollment.js heartbeat-storm.js command-dispatch.js admin-api-crud.js websocket-connections.js; do
  echo "Running $f..."
  k6 run "$f"
done
```

## Thresholds

Each test defines pass/fail thresholds:

- **Device Enrollment**: p95 < 500ms, error rate < 1%
- **Heartbeat Storm**: p95 < 200ms, error rate < 1%
- **Command Dispatch**: p95 < 1000ms, error rate < 1%
- **Admin API CRUD**: p95 < 1000ms, success rate > 95%
- **WebSocket**: connect p95 < 2s, message latency p95 < 500ms

## Tuning Thresholds

Adjust thresholds in each test's `options.thresholds` based on your environment:

- **Local dev**: relax thresholds 2-3x (higher latency expected)
- **Staging**: use default thresholds
- **Production**: tighten thresholds, reduce VU counts to avoid impacting users

## Interpreting Results

k6 outputs summary statistics after each run. Key metrics:

- `http_req_duration` / `grpc_req_duration`: request latency percentiles
- `http_req_failed` / custom error counters: failure rates
- `vus`: concurrent virtual users over time
- `iterations`: total completed test iterations

Export results for analysis:

```bash
# JSON output
k6 run --out json=results.json device-enrollment.js

# Prometheus remote write (for Grafana dashboards)
k6 run --out experimental-prometheus-rw device-enrollment.js
```
