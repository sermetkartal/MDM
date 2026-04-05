import grpc from 'k6/net/grpc';
import { check, sleep } from 'k6';
import { Counter, Rate, Trend } from 'k6/metrics';
import { BASE_URLS, generateDevicePayload } from './config.js';

const client = new grpc.Client();
client.load(['../../proto'], 'device.proto');

const enrollmentDuration = new Trend('enrollment_duration', true);
const enrollmentErrors = new Counter('enrollment_errors');
const enrollmentSuccess = new Rate('enrollment_success');

export const options = {
  stages: [
    { duration: '1m', target: 100 },   // ramp up to 100 VUs
    { duration: '3m', target: 100 },   // hold at 100 VUs
    { duration: '30s', target: 0 },    // ramp down
  ],
  thresholds: {
    'enrollment_duration': ['p(95)<500'],
    'grpc_req_duration': ['p(95)<500'],
    'enrollment_success': ['rate>0.99'],
  },
};

export default function () {
  client.connect(BASE_URLS.deviceService, { plaintext: true, timeout: '10s' });

  const device = generateDevicePayload();

  const start = Date.now();
  const response = client.invoke('mdm.DeviceService/EnrollDevice', {
    serial_number: device.serial_number,
    platform: device.platform,
    model: device.model,
    os_version: device.os_version,
    org_id: device.org_id,
    hostname: device.hostname,
  });
  const duration = Date.now() - start;

  enrollmentDuration.add(duration);

  const success = check(response, {
    'enrollment status is OK': (r) => r && r.status === grpc.StatusOK,
    'enrollment returns device ID': (r) => r && r.message && r.message.device_id,
  });

  if (!success) {
    enrollmentErrors.add(1);
    enrollmentSuccess.add(false);
  } else {
    enrollmentSuccess.add(true);
  }

  client.close();
  sleep(0.1);
}
