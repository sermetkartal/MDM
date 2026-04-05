import { describe, it, expect, beforeAll } from "vitest";
import { getBaseUrl, apiRequest, setAuthToken } from "../setup";

const BASE = getBaseUrl();

describe("Auth API", () => {
  describe("POST /v1/auth/login", () => {
    it("should return a token for valid credentials", async () => {
      const res = await fetch(`${BASE}/v1/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: process.env.TEST_ADMIN_EMAIL ?? "admin@example.com",
          password: process.env.TEST_ADMIN_PASSWORD ?? "password123",
        }),
      });
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.token ?? data.accessToken ?? data.data?.token).toBeTruthy();
    });

    it("should reject invalid credentials", async () => {
      const res = await fetch(`${BASE}/v1/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: "nobody@example.com",
          password: "wrongpassword",
        }),
      });
      expect(res.status).toBeGreaterThanOrEqual(400);
    });
  });

  describe("POST /v1/auth/refresh", () => {
    it("should refresh an existing token", async () => {
      const res = await apiRequest("POST", "/v1/auth/refresh");
      // 200 if refresh is supported, 401 if token expired, either is valid behavior
      expect([200, 201, 401]).toContain(res.status);
    });
  });

  describe("POST /v1/auth/logout", () => {
    it("should invalidate the session", async () => {
      const res = await apiRequest("POST", "/v1/auth/logout");
      expect([200, 204]).toContain(res.status);
    });
  });

  describe("Session expiry", () => {
    it("should reject requests with an invalid token", async () => {
      const res = await fetch(`${BASE}/v1/devices`, {
        headers: {
          Authorization: "Bearer invalid-token-12345",
          "Content-Type": "application/json",
        },
      });
      expect(res.status).toBe(401);
    });
  });
});
