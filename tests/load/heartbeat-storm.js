import grpc from 'k6/net/grpc';
import { check, sleep } from 'k6';
import { Counter, Rate, Trend } from 'k6/metrics';
import { BASE_URLS, randomOrg } from './config.js';

const client = new grpc.Client();
client.load(['../../proto'], 'device.proto');

const heartbeatDuration = new Trend('heartbeat_duration', true);
const heartbeatErrors = new Counter('heartbeat_errors');
const heartbeatSuccess = new Rate('heartbeat_success');

export const options = {
  stages: [
    { duration: '1m', target: 1000 },
    { duration: '2m', target: 5000 },
    { duration: '3m', target: 10000 },
    { duration: '2m', target: 10000 },
    { duration: '1m', target: 0 },
  ],
  thresholds: {
    'heartbeat_duration': ['p(95)<200'],
    'grpc_req_duration': ['p(95)<200'],
    'heartbeat_success': ['rate>0.99'],
  },
};

export function setup() {
  // Pre-generate device IDs for VUs to use
  return {
    devicePrefix: `load-test-${Date.now()}`,
  };
}

export default function (data) {
  client.connect(BASE_URLS.deviceService, { plaintext: true, timeout: '5s' });

  const deviceId = `${data.devicePrefix}-${__VU}`;

  const start = Date.now();
  const response = client.invoke('mdm.DeviceService/Heartbeat', {
    device_id: deviceId,
    org_id: randomOrg(),
    timestamp: new Date().toISOString(),
    battery_level: Math.floor(Math.random() * 100),
    ip_address: `10.0.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}`,
  });
  const duration = Date.now() - start;

  heartbeatDuration.add(duration);

  const success = check(response, {
    'heartbeat status is OK': (r) => r && r.status === grpc.StatusOK,
  });

  if (!success) {
    heartbeatErrors.add(1);
    heartbeatSuccess.add(false);
  } else {
    heartbeatSuccess.add(true);
  }

  client.close();
  sleep(0.5);
}
