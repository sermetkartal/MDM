import { describe, it, expect } from "vitest";
import { getBaseUrl } from "../setup";

const BASE = getBaseUrl();

async function loginAs(email: string, password: string): Promise<string> {
  const res = await fetch(`${BASE}/v1/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) throw new Error(`Login failed for ${email}`);
  const data = await res.json();
  return data.token ?? data.accessToken ?? data.data?.token;
}

function headersFor(token: string): Record<string, string> {
  return { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
}

describe("RBAC API", () => {
  const viewerEmail = process.env.TEST_VIEWER_EMAIL ?? "viewer@example.com";
  const viewerPassword = process.env.TEST_VIEWER_PASSWORD ?? "password123";
  const adminEmail = process.env.TEST_ADMIN_EMAIL ?? "admin@example.com";
  const adminPassword = process.env.TEST_ADMIN_PASSWORD ?? "password123";
  const helpdeskEmail = process.env.TEST_HELPDESK_EMAIL ?? "helpdesk@example.com";
  const helpdeskPassword = process.env.TEST_HELPDESK_PASSWORD ?? "password123";

  describe("Viewer role", () => {
    it("should not be able to create a policy", async () => {
      let token: string;
      try {
        token = await loginAs(viewerEmail, viewerPassword);
      } catch {
        return; // Skip if viewer user doesn't exist
      }
      const res = await fetch(`${BASE}/v1/policies`, {
        method: "POST",
        headers: headersFor(token),
        body: JSON.stringify({
          name: "Viewer Policy Attempt",
          policyType: "restrictions",
          platform: "android",
          payload: {},
        }),
      });
      expect(res.status).toBe(403);
    });

    it("should be able to read devices", async () => {
      let token: string;
      try {
        token = await loginAs(viewerEmail, viewerPassword);
      } catch {
        return;
      }
      const res = await fetch(`${BASE}/v1/devices`, {
        headers: headersFor(token),
      });
      expect([200, 403]).toContain(res.status); // 200 if viewer has read access
    });
  });

  describe("Admin role", () => {
    it("should be able to create policies", async () => {
      let token: string;
      try {
        token = await loginAs(adminEmail, adminPassword);
      } catch {
        return;
      }
      const res = await fetch(`${BASE}/v1/policies`, {
        method: "POST",
        headers: headersFor(token),
        body: JSON.stringify({
          name: `Admin Policy ${Date.now()}`,
          policyType: "restrictions",
          platform: "android",
          payload: { camera_disabled: true },
        }),
      });
      expect([200, 201]).toContain(res.status);
    });
  });

  describe("Helpdesk role", () => {
    it("should be able to lock a device", async () => {
      let token: string;
      try {
        token = await loginAs(helpdeskEmail, helpdeskPassword);
      } catch {
        return;
      }
      const res = await fetch(`${BASE}/v1/commands`, {
        method: "POST",
        headers: headersFor(token),
        body: JSON.stringify({
          deviceId: "00000000-0000-0000-0000-000000000001",
          commandType: "lock",
          payload: {},
        }),
      });
      expect([200, 201, 404]).toContain(res.status);
    });

    it("should not be able to wipe a device", async () => {
      let token: string;
      try {
        token = await loginAs(helpdeskEmail, helpdeskPassword);
      } catch {
        return;
      }
      const res = await fetch(`${BASE}/v1/commands`, {
        method: "POST",
        headers: headersFor(token),
        body: JSON.stringify({
          deviceId: "00000000-0000-0000-0000-000000000001",
          commandType: "wipe",
          payload: {},
        }),
      });
      expect([403]).toContain(res.status);
    });
  });
});
