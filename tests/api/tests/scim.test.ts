import { describe, it, expect } from "vitest";
import { getBaseUrl, authHeaders } from "../setup";

const BASE = getBaseUrl();

describe("SCIM API", () => {
  let userId: string;

  describe("POST /scim/v2/Users", () => {
    it("should create a user via SCIM", async () => {
      const res = await fetch(`${BASE}/scim/v2/Users`, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({
          schemas: ["urn:ietf:params:scim:schemas:core:2.0:User"],
          userName: `scim-test-${Date.now()}@example.com`,
          name: { givenName: "SCIM", familyName: "Test" },
          emails: [{ value: `scim-test-${Date.now()}@example.com`, primary: true }],
          active: true,
        }),
      });
      expect([200, 201]).toContain(res.status);
      const data = await res.json();
      userId = data.id;
      expect(userId).toBeTruthy();
    });
  });

  describe("GET /scim/v2/Users/:id", () => {
    it("should get a user by ID", async () => {
      if (!userId) return;
      const res = await fetch(`${BASE}/scim/v2/Users/${userId}`, {
        headers: authHeaders(),
      });
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.id).toBe(userId);
    });
  });

  describe("PUT /scim/v2/Users/:id", () => {
    it("should update a user", async () => {
      if (!userId) return;
      const res = await fetch(`${BASE}/scim/v2/Users/${userId}`, {
        method: "PUT",
        headers: authHeaders(),
        body: JSON.stringify({
          schemas: ["urn:ietf:params:scim:schemas:core:2.0:User"],
          name: { givenName: "Updated", familyName: "User" },
          active: true,
        }),
      });
      expect([200, 204]).toContain(res.status);
    });
  });

  describe("DELETE /scim/v2/Users/:id", () => {
    it("should delete a user", async () => {
      if (!userId) return;
      const res = await fetch(`${BASE}/scim/v2/Users/${userId}`, {
        method: "DELETE",
        headers: authHeaders(),
      });
      expect([200, 204]).toContain(res.status);
    });
  });
});
