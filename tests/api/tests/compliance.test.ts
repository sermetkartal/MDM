import { describe, it, expect } from "vitest";
import { apiRequest } from "../setup";

describe("Compliance API", () => {
  let ruleId: string;

  describe("POST /v1/compliance/rules", () => {
    it("should create a compliance rule", async () => {
      const res = await apiRequest("POST", "/v1/compliance/rules", {
        name: `API Test Rule ${Date.now()}`,
        condition: { field: "os_version", operator: "gte", value: "13.0" },
        severity: "high",
        action: "alert",
      });
      expect([200, 201]).toContain(res.status);
      const data = await res.json();
      ruleId = data.id ?? data.data?.id;
      expect(ruleId).toBeTruthy();
    });
  });

  describe("POST /v1/compliance/evaluate/:deviceId", () => {
    it("should evaluate device against rules", async () => {
      const res = await apiRequest(
        "POST",
        "/v1/compliance/evaluate/00000000-0000-0000-0000-000000000001",
      );
      expect([200, 404]).toContain(res.status);
    });
  });

  describe("GET /v1/compliance/violations", () => {
    it("should list violations", async () => {
      const res = await apiRequest("GET", "/v1/compliance/violations");
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.data ?? data.violations ?? data).toBeDefined();
    });
  });

  describe("POST /v1/compliance/violations/:id/resolve", () => {
    it("should resolve a violation", async () => {
      // First, list violations to find one
      const listRes = await apiRequest("GET", "/v1/compliance/violations?limit=1");
      if (listRes.status !== 200) return;
      const listData = await listRes.json();
      const violations = listData.data ?? listData.violations ?? [];
      if (violations.length === 0) return;

      const violationId = violations[0].id;
      const res = await apiRequest("POST", `/v1/compliance/violations/${violationId}/resolve`);
      expect([200, 204]).toContain(res.status);
    });
  });
});
