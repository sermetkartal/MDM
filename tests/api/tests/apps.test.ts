import { describe, it, expect } from "vitest";
import { apiRequest } from "../setup";

describe("Apps API", () => {
  let appId: string;

  describe("POST /v1/apps", () => {
    it("should create an app entry", async () => {
      const res = await apiRequest("POST", "/v1/apps", {
        name: `Test App ${Date.now()}`,
        packageName: "com.test.apitest",
        platform: "android",
      });
      expect([200, 201]).toContain(res.status);
      const data = await res.json();
      appId = data.id ?? data.data?.id;
      expect(appId).toBeTruthy();
    });
  });

  describe("POST /v1/apps/:id/versions", () => {
    it("should upload a new version", async () => {
      if (!appId) return;
      const res = await apiRequest("POST", `/v1/apps/${appId}/versions`, {
        versionCode: 1,
        versionName: "1.0.0",
      });
      expect([200, 201]).toContain(res.status);
    });
  });

  describe("POST /v1/apps/:id/assign", () => {
    it("should assign app to a device", async () => {
      if (!appId) return;
      const res = await apiRequest("POST", `/v1/apps/${appId}/assign`, {
        deviceId: "00000000-0000-0000-0000-000000000001",
      });
      expect([200, 201, 404]).toContain(res.status);
    });
  });

  describe("POST /v1/apps/:id/unassign", () => {
    it("should unassign app from a device", async () => {
      if (!appId) return;
      const res = await apiRequest("POST", `/v1/apps/${appId}/unassign`, {
        deviceId: "00000000-0000-0000-0000-000000000001",
      });
      expect([200, 204, 404]).toContain(res.status);
    });
  });
});
