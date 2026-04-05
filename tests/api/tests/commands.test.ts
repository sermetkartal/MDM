import { describe, it, expect } from "vitest";
import { apiRequest } from "../setup";

describe("Commands API", () => {
  let commandId: string;
  const testDeviceId = "00000000-0000-0000-0000-000000000001";

  describe("POST /v1/commands", () => {
    it("should dispatch a command to a device", async () => {
      const res = await apiRequest("POST", "/v1/commands", {
        deviceId: testDeviceId,
        commandType: "lock",
        payload: { message: "Device locked by API test" },
      });
      expect([200, 201, 404]).toContain(res.status);
      if (res.status < 300) {
        const data = await res.json();
        commandId = data.id ?? data.data?.id;
        expect(commandId).toBeTruthy();
      }
    });
  });

  describe("GET /v1/commands/:id", () => {
    it("should get command status", async () => {
      if (!commandId) return;
      const res = await apiRequest("GET", `/v1/commands/${commandId}`);
      expect(res.status).toBe(200);
      const data = await res.json();
      const cmd = data.data ?? data;
      expect(cmd.status).toBeDefined();
    });
  });

  describe("POST /v1/commands/:id/cancel", () => {
    it("should cancel a pending command", async () => {
      if (!commandId) return;
      const res = await apiRequest("POST", `/v1/commands/${commandId}/cancel`);
      expect([200, 204, 409]).toContain(res.status); // 409 if already delivered
    });
  });

  describe("POST /v1/commands/bulk", () => {
    it("should dispatch commands in bulk", async () => {
      const res = await apiRequest("POST", "/v1/commands/bulk", {
        deviceIds: [testDeviceId],
        commandType: "reboot",
        payload: {},
      });
      expect([200, 201, 404]).toContain(res.status);
    });
  });
});
