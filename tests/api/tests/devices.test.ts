import { describe, it, expect } from "vitest";
import { apiRequest } from "../setup";

describe("Devices API", () => {
  let createdDeviceId: string;

  describe("POST /v1/devices", () => {
    it("should create a device", async () => {
      const res = await apiRequest("POST", "/v1/devices", {
        serialNumber: `API-TEST-${Date.now()}`,
        model: "Pixel 8 Pro",
        manufacturer: "Google",
        osVersion: "14.0",
        platform: "android",
      });
      expect([200, 201]).toContain(res.status);
      const data = await res.json();
      createdDeviceId = data.id ?? data.data?.id;
      expect(createdDeviceId).toBeTruthy();
    });
  });

  describe("GET /v1/devices", () => {
    it("should list devices with pagination", async () => {
      const res = await apiRequest("GET", "/v1/devices?page=1&limit=10");
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.data ?? data.devices).toBeDefined();
      expect(data.pagination ?? data.meta).toBeDefined();
    });
  });

  describe("GET /v1/devices/:id", () => {
    it("should get a device by ID", async () => {
      if (!createdDeviceId) return;
      const res = await apiRequest("GET", `/v1/devices/${createdDeviceId}`);
      expect(res.status).toBe(200);
      const data = await res.json();
      const device = data.data ?? data;
      expect(device.id ?? device.ID).toBe(createdDeviceId);
    });
  });

  describe("PUT /v1/devices/:id", () => {
    it("should update device fields", async () => {
      if (!createdDeviceId) return;
      const res = await apiRequest("PUT", `/v1/devices/${createdDeviceId}`, {
        name: "Updated API Test Device",
      });
      expect([200, 204]).toContain(res.status);
    });
  });

  describe("DELETE /v1/devices/:id", () => {
    it("should unenroll/delete a device", async () => {
      if (!createdDeviceId) return;
      const res = await apiRequest("DELETE", `/v1/devices/${createdDeviceId}`);
      expect([200, 204]).toContain(res.status);
    });
  });
});
