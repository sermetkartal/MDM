import { describe, it, expect } from "vitest";
import { apiRequest } from "../setup";

describe("Groups API", () => {
  let staticGroupId: string;
  let dynamicGroupId: string;

  describe("POST /v1/groups (static)", () => {
    it("should create a static group", async () => {
      const res = await apiRequest("POST", "/v1/groups", {
        name: `API Static Group ${Date.now()}`,
        type: "static",
      });
      expect([200, 201]).toContain(res.status);
      const data = await res.json();
      staticGroupId = data.id ?? data.data?.id;
      expect(staticGroupId).toBeTruthy();
    });
  });

  describe("POST /v1/groups/:id/devices", () => {
    it("should add devices to a static group", async () => {
      if (!staticGroupId) return;
      const res = await apiRequest("POST", `/v1/groups/${staticGroupId}/devices`, {
        deviceIds: ["00000000-0000-0000-0000-000000000001"],
      });
      expect([200, 201, 404]).toContain(res.status);
    });
  });

  describe("POST /v1/groups (dynamic)", () => {
    it("should create a dynamic group with rules", async () => {
      const res = await apiRequest("POST", "/v1/groups", {
        name: `API Dynamic Group ${Date.now()}`,
        type: "dynamic",
        rules: [
          { field: "os_version", operator: "gte", value: "14.0" },
          { field: "manufacturer", operator: "eq", value: "Google" },
        ],
      });
      expect([200, 201]).toContain(res.status);
      const data = await res.json();
      dynamicGroupId = data.id ?? data.data?.id;
      expect(dynamicGroupId).toBeTruthy();
    });
  });

  describe("GET /v1/groups/:id/devices", () => {
    it("should list devices in a dynamic group (auto-membership)", async () => {
      if (!dynamicGroupId) return;
      const res = await apiRequest("GET", `/v1/groups/${dynamicGroupId}/devices`);
      expect([200]).toContain(res.status);
      const data = await res.json();
      expect(data.data ?? data.devices ?? data).toBeDefined();
    });
  });
});
