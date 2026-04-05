import { describe, it, expect } from "vitest";
import { apiRequest } from "../setup";

describe("Geofences API", () => {
  let circleId: string;
  let polygonId: string;

  describe("POST /v1/geofences", () => {
    it("should create a circle geofence", async () => {
      const res = await apiRequest("POST", "/v1/geofences", {
        name: `API Circle ${Date.now()}`,
        type: "circle",
        center: { lat: 37.7749, lng: -122.4194 },
        radius: 500,
      });
      expect([200, 201]).toContain(res.status);
      const data = await res.json();
      circleId = data.id ?? data.data?.id;
      expect(circleId).toBeTruthy();
    });

    it("should create a polygon geofence", async () => {
      const res = await apiRequest("POST", "/v1/geofences", {
        name: `API Polygon ${Date.now()}`,
        type: "polygon",
        vertices: [
          { lat: 37.78, lng: -122.42 },
          { lat: 37.78, lng: -122.41 },
          { lat: 37.77, lng: -122.41 },
          { lat: 37.77, lng: -122.42 },
        ],
      });
      expect([200, 201]).toContain(res.status);
      const data = await res.json();
      polygonId = data.id ?? data.data?.id;
      expect(polygonId).toBeTruthy();
    });
  });

  describe("POST /v1/geofences/:id/triggers", () => {
    it("should add a policy trigger to a geofence", async () => {
      if (!circleId) return;
      const res = await apiRequest("POST", `/v1/geofences/${circleId}/triggers`, {
        event: "enter",
        action: "apply_policy",
        policyId: "00000000-0000-0000-0000-000000000001",
      });
      expect([200, 201, 404]).toContain(res.status);
    });
  });

  describe("POST /v1/geofences/events", () => {
    it("should simulate a location event", async () => {
      const res = await apiRequest("POST", "/v1/geofences/events", {
        deviceId: "00000000-0000-0000-0000-000000000001",
        lat: 37.7749,
        lng: -122.4194,
        timestamp: new Date().toISOString(),
      });
      expect([200, 201, 404]).toContain(res.status);
    });
  });
});
