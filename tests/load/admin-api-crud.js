import http from 'k6/http';
import { check, sleep, group } from 'k6';
import { Counter, Rate, Trend } from 'k6/metrics';
import {
  BASE_URLS, authHeaders, generateDevicePayload,
  generatePolicyPayload, generateGroupPayload,
} from './config.js';

const crudDuration = new Trend('crud_duration', true);
const crudErrors = new Counter('crud_errors');
const crudSuccess = new Rate('crud_success');

export const options = {
  stages: [
    { duration: '30s', target: 50 },
    { duration: '2m', target: 500 },
    { duration: '3m', target: 500 },
    { duration: '30s', target: 0 },
  ],
  thresholds: {
    'http_req_duration': ['p(95)<1000'],
    'crud_success': ['rate>0.95'],
  },
};

const resources = ['devices', 'policies', 'groups'];

function pickResource() {
  return resources[Math.floor(Math.random() * resources.length)];
}

function generatePayload(resource) {
  switch (resource) {
    case 'devices': return generateDevicePayload();
    case 'policies': return generatePolicyPayload();
    case 'groups': return generateGroupPayload();
  }
}

export default function () {
  const baseUrl = BASE_URLS.apiGateway;
  const headers = authHeaders();
  const resource = pickResource();

  // Distribution: 50% reads, 30% creates, 15% updates, 5% deletes
  const roll = Math.random();

  if (roll < 0.50) {
    group('read', () => {
      const start = Date.now();
      const res = http.get(`${baseUrl}/api/v1/${resource}`, { headers });
      crudDuration.add(Date.now() - start);

      const ok = check(res, {
        'list status OK': (r) => r.status === 200,
      });
      crudSuccess.add(ok);
      if (!ok) crudErrors.add(1);
    });
  } else if (roll < 0.80) {
    group('create', () => {
      const payload = JSON.stringify(generatePayload(resource));
      const start = Date.now();
      const res = http.post(`${baseUrl}/api/v1/${resource}`, payload, { headers });
      crudDuration.add(Date.now() - start);

      const ok = check(res, {
        'create status OK': (r) => r.status === 200 || r.status === 201,
      });
      crudSuccess.add(ok);
      if (!ok) crudErrors.add(1);
    });
  } else if (roll < 0.95) {
    group('update', () => {
      // List first, then update a random item
      const listRes = http.get(`${baseUrl}/api/v1/${resource}`, { headers });
      let itemId;
      try {
        const items = JSON.parse(listRes.body);
        const list = Array.isArray(items) ? items : (items.data || items.items || []);
        if (list.length > 0) {
          const item = list[Math.floor(Math.random() * list.length)];
          itemId = item.id;
        }
      } catch {
        // ignore
      }

      if (itemId) {
        const payload = JSON.stringify(generatePayload(resource));
        const start = Date.now();
        const res = http.put(`${baseUrl}/api/v1/${resource}/${itemId}`, payload, { headers });
        crudDuration.add(Date.now() - start);

        const ok = check(res, {
          'update status OK': (r) => r.status === 200,
        });
        crudSuccess.add(ok);
        if (!ok) crudErrors.add(1);
      }
    });
  } else {
    group('delete', () => {
      const listRes = http.get(`${baseUrl}/api/v1/${resource}`, { headers });
      let itemId;
      try {
        const items = JSON.parse(listRes.body);
        const list = Array.isArray(items) ? items : (items.data || items.items || []);
        if (list.length > 0) {
          const item = list[Math.floor(Math.random() * list.length)];
          itemId = item.id;
        }
      } catch {
        // ignore
      }

      if (itemId) {
        const start = Date.now();
        const res = http.del(`${baseUrl}/api/v1/${resource}/${itemId}`, null, { headers });
        crudDuration.add(Date.now() - start);

        const ok = check(res, {
          'delete status OK': (r) => r.status === 200 || r.status === 204,
        });
        crudSuccess.add(ok);
        if (!ok) crudErrors.add(1);
      }
    });
  }

  sleep(0.1);
}
