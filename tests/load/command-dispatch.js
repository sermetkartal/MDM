import http from 'k6/http';
import { check, sleep, group } from 'k6';
import { Counter, Rate, Trend } from 'k6/metrics';
import { BASE_URLS, authHeaders, randomOrg } from './config.js';

const dispatchDuration = new Trend('command_dispatch_duration', true);
const completionDuration = new Trend('command_completion_duration', true);
const commandErrors = new Counter('command_errors');
const commandSuccess = new Rate('command_success');

export const options = {
  stages: [
    { duration: '30s', target: 100 },
    { duration: '2m', target: 1000 },
    { duration: '3m', target: 1000 },
    { duration: '30s', target: 0 },
  ],
  thresholds: {
    'http_req_duration': ['p(95)<1000'],
    'command_dispatch_duration': ['p(95)<500'],
    'command_success': ['rate>0.99'],
  },
};

export default function () {
  const baseUrl = BASE_URLS.apiGateway;
  const headers = authHeaders();
  const orgId = randomOrg();

  let commandId;

  group('create command', () => {
    const payload = JSON.stringify({
      org_id: orgId,
      device_id: `device-${__VU}-${__ITER}`,
      type: ['lock', 'wipe', 'restart', 'install_profile'][Math.floor(Math.random() * 4)],
      payload: JSON.stringify({ force: true }),
    });

    const start = Date.now();
    const res = http.post(`${baseUrl}/api/v1/commands`, payload, { headers });
    dispatchDuration.add(Date.now() - start);

    const ok = check(res, {
      'command created': (r) => r.status === 201 || r.status === 200,
      'command has ID': (r) => {
        try {
          const body = JSON.parse(r.body);
          commandId = body.id || body.command_id;
          return !!commandId;
        } catch {
          return false;
        }
      },
    });

    if (!ok) {
      commandErrors.add(1);
      commandSuccess.add(false);
      return;
    }
  });

  if (!commandId) return;

  group('check command status', () => {
    sleep(0.5);

    const res = http.get(`${baseUrl}/api/v1/commands/${commandId}`, { headers });
    check(res, {
      'status check OK': (r) => r.status === 200,
      'status is valid': (r) => {
        try {
          const body = JSON.parse(r.body);
          return ['pending', 'queued', 'sent', 'completed', 'failed'].includes(body.status);
        } catch {
          return false;
        }
      },
    });
  });

  group('verify completion', () => {
    const start = Date.now();
    let completed = false;

    // Poll up to 5 times with 1s intervals
    for (let i = 0; i < 5 && !completed; i++) {
      sleep(1);
      const res = http.get(`${baseUrl}/api/v1/commands/${commandId}`, { headers });
      try {
        const body = JSON.parse(res.body);
        if (body.status === 'completed' || body.status === 'failed') {
          completed = true;
        }
      } catch {
        // continue polling
      }
    }

    completionDuration.add(Date.now() - start);
    commandSuccess.add(true);
  });

  sleep(0.2);
}
