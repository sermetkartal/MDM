export const testAdmin = {
  email: process.env.TEST_ADMIN_EMAIL ?? "admin@example.com",
  password: process.env.TEST_ADMIN_PASSWORD ?? "password123",
};

export const testDevice = {
  name: "E2E Test Device",
  serialNumber: "E2E-SN-001",
  model: "Pixel 8",
  osVersion: "14.0",
  manufacturer: "Google",
};

export const testPolicy = {
  name: "E2E Restriction Policy",
  type: "restrictions",
  platform: "android",
};

export const testKioskProfile = {
  name: "E2E Kiosk Profile",
  mode: "single_app",
  packageName: "com.example.kiosk",
};

export const testComplianceRule = {
  name: "E2E Compliance Rule",
  field: "os_version",
  operator: "gte",
  value: "13.0",
  severity: "high",
};
