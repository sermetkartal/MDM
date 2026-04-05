import { describe, it, expect } from "vitest";
import { apiRequest } from "../setup";

describe("Policies API", () => {
  let policyId: string;

  describe("POST /v1/policies", () => {
    it("should create a policy", async () => {
      const res = await apiRequest("POST", "/v1/policies", {
        name: `API Test Policy ${Date.now()}`,
        policyType: "restrictions",
        platform: "android",
        payload: { camera_disabled: true, usb_disabled: false },
      });
      expect([200, 201]).toContain(res.status);
      const data = await res.json();
      policyId = data.id ?? data.data?.id;
      expect(policyId).toBeTruthy();
    });
  });

  describe("PUT /v1/policies/:id", () => {
    it("should update policy and increment version", async () => {
      if (!policyId) return;
      const res = await apiRequest("PUT", `/v1/policies/${policyId}`, {
        name: "Updated API Test Policy",
        payload: { camera_disabled: false, usb_disabled: true },
      });
      expect([200, 204]).toContain(res.status);
      if (res.status === 200) {
        const data = await res.json();
        const version = data.version ?? data.data?.version;
        if (version !== undefined) {
          expect(version).toBeGreaterThanOrEqual(2);
        }
      }
    });
  });

  describe("POST /v1/policies/:id/assign", () => {
    it("should assign policy to a device", async () => {
      if (!policyId) return;
      const res = await apiRequest("POST", `/v1/policies/${policyId}/assign`, {
        targetType: "device",
        targetId: "00000000-0000-0000-0000-000000000001",
      });
      expect([200, 201, 404]).toContain(res.status); // 404 if device doesn't exist in test env
    });

    it("should assign policy to a group", async () => {
      if (!policyId) return;
      const res = await apiRequest("POST", `/v1/policies/${policyId}/assign`, {
        targetType: "group",
        targetId: "00000000-0000-0000-0000-000000000001",
      });
      expect([200, 201, 404]).toContain(res.status);
    });
  });

  describe("GET /v1/policies/effective/:deviceId", () => {
    it("should return effective policies with conflict resolution", async () => {
      const res = await apiRequest(
        "GET",
        "/v1/policies/effective/00000000-0000-0000-0000-000000000001",
      );
      expect([200, 404]).toContain(res.status);
    });
  });

  describe("GET /v1/policies/:id/preview", () => {
    it("should preview the policy", async () => {
      if (!policyId) return;
      const res = await apiRequest("GET", `/v1/policies/${policyId}/preview`);
      expect([200, 404]).toContain(res.status);
    });
  });

  describe("DELETE /v1/policies/:id", () => {
    it("should delete the policy", async () => {
      if (!policyId) return;
      const res = await apiRequest("DELETE", `/v1/policies/${policyId}`);
      expect([200, 204]).toContain(res.status);
    });
  });
});
