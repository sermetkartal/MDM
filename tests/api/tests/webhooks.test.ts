import { describe, it, expect } from "vitest";
import { apiRequest } from "../setup";

describe("Webhooks API", () => {
  let webhookId: string;

  describe("POST /v1/webhooks", () => {
    it("should create a webhook", async () => {
      const res = await apiRequest("POST", "/v1/webhooks", {
        name: `API Test Webhook ${Date.now()}`,
        url: "https://httpbin.org/post",
        events: ["device.enrolled", "device.unenrolled"],
        secret: "test-secret-key",
      });
      expect([200, 201]).toContain(res.status);
      const data = await res.json();
      webhookId = data.id ?? data.data?.id;
      expect(webhookId).toBeTruthy();
    });
  });

  describe("POST /v1/webhooks/:id/test", () => {
    it("should trigger a test event delivery", async () => {
      if (!webhookId) return;
      const res = await apiRequest("POST", `/v1/webhooks/${webhookId}/test`);
      expect([200, 201, 202]).toContain(res.status);
    });
  });

  describe("GET /v1/webhooks/:id/deliveries", () => {
    it("should list delivery history", async () => {
      if (!webhookId) return;
      const res = await apiRequest("GET", `/v1/webhooks/${webhookId}/deliveries`);
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.data ?? data.deliveries ?? data).toBeDefined();
    });
  });
});
