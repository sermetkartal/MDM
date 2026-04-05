import ws from 'k6/ws';
import { check, sleep } from 'k6';
import { Counter, Rate, Trend } from 'k6/metrics';
import { BASE_URLS, AUTH, randomOrg } from './config.js';

const wsConnectDuration = new Trend('ws_connect_duration', true);
const wsMessageLatency = new Trend('ws_message_latency', true);
const wsErrors = new Counter('ws_errors');
const wsSuccess = new Rate('ws_success');
const wsMessagesReceived = new Counter('ws_messages_received');

export const options = {
  stages: [
    { duration: '1m', target: 500 },
    { duration: '2m', target: 2500 },
    { duration: '3m', target: 5000 },
    { duration: '2m', target: 5000 },
    { duration: '1m', target: 0 },
  ],
  thresholds: {
    'ws_connect_duration': ['p(95)<2000'],
    'ws_message_latency': ['p(95)<500'],
    'ws_success': ['rate>0.95'],
  },
};

export default function () {
  const orgId = randomOrg();
  const url = `${BASE_URLS.wsEndpoint}/events?org_id=${orgId}&token=${AUTH.adminToken}`;

  const connectStart = Date.now();

  const res = ws.connect(url, {}, function (socket) {
    wsConnectDuration.add(Date.now() - connectStart);

    socket.on('open', () => {
      socket.send(JSON.stringify({
        type: 'subscribe',
        channels: ['device.status', 'command.result', 'policy.deployed'],
        org_id: orgId,
      }));
    });

    socket.on('message', (data) => {
      wsMessagesReceived.add(1);
      try {
        const msg = JSON.parse(data);
        if (msg.timestamp) {
          const latency = Date.now() - new Date(msg.timestamp).getTime();
          if (latency > 0 && latency < 60000) {
            wsMessageLatency.add(latency);
          }
        }
      } catch {
        // non-JSON message, ignore
      }
    });

    socket.on('error', () => {
      wsErrors.add(1);
      wsSuccess.add(false);
    });

    // Keep connection open for 30-60 seconds
    const holdTime = 30 + Math.random() * 30;
    socket.setTimeout(() => {
      socket.close();
    }, holdTime * 1000);
  });

  const ok = check(res, {
    'ws connected successfully': (r) => r && r.status === 101,
  });

  wsSuccess.add(ok);
  if (!ok) wsErrors.add(1);

  sleep(1);
}
