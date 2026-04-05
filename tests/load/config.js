// Shared configuration for k6 load tests

export const BASE_URLS = {
  apiGateway: __ENV.API_GATEWAY_URL || 'http://localhost:8080',
  deviceService: __ENV.DEVICE_SERVICE_URL || 'localhost:50051',
  policyService: __ENV.POLICY_SERVICE_URL || 'localhost:50052',
  commandService: __ENV.COMMAND_SERVICE_URL || 'localhost:50053',
  wsEndpoint: __ENV.WS_URL || 'ws://localhost:8080/ws',
};

export const AUTH = {
  adminToken: __ENV.ADMIN_TOKEN || 'test-admin-token',
  serviceToken: __ENV.SERVICE_TOKEN || 'test-service-token',
};

export const ORGS = ['org-alpha', 'org-beta', 'org-gamma', 'org-delta'];

export function randomOrg() {
  return ORGS[Math.floor(Math.random() * ORGS.length)];
}

export function randomDeviceId() {
  return `device-${Date.now()}-${Math.random().toString(36).substring(2, 10)}`;
}

export function randomSerial() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let result = '';
  for (let i = 0; i < 12; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

export function randomPlatform() {
  const platforms = ['android', 'ios', 'windows', 'macos', 'linux'];
  return platforms[Math.floor(Math.random() * platforms.length)];
}

export function randomModel() {
  const models = [
    'iPhone 15 Pro', 'Samsung Galaxy S24', 'Google Pixel 8',
    'MacBook Pro 16', 'Dell XPS 15', 'ThinkPad X1 Carbon',
    'iPad Pro 12.9', 'Surface Pro 10',
  ];
  return models[Math.floor(Math.random() * models.length)];
}

export function generateDevicePayload() {
  return {
    serial_number: randomSerial(),
    platform: randomPlatform(),
    model: randomModel(),
    os_version: `${Math.floor(Math.random() * 5) + 12}.${Math.floor(Math.random() * 10)}`,
    org_id: randomOrg(),
    hostname: `device-${randomSerial().toLowerCase()}`,
  };
}

export function generatePolicyPayload() {
  return {
    name: `policy-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
    org_id: randomOrg(),
    type: ['passcode', 'wifi', 'vpn', 'restriction'][Math.floor(Math.random() * 4)],
    payload: JSON.stringify({ enforced: true, min_length: 8 }),
  };
}

export function generateGroupPayload() {
  return {
    name: `group-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
    org_id: randomOrg(),
    description: 'Load test group',
  };
}

export function authHeaders() {
  return {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${AUTH.adminToken}`,
  };
}
