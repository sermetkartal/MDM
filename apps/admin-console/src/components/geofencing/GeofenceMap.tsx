"use client";

import * as React from "react";
import {
  MapContainer,
  TileLayer,
  Circle,
  Polygon,
  Marker,
  Popup,
  useMapEvents,
  useMap,
} from "react-leaflet";
import type { LatLngExpression } from "leaflet";
import type { Geofence, GeofencePoint } from "@/lib/types";

interface GeofenceMapProps {
  geofences: Geofence[];
  center?: [number, number];
  zoom?: number;
  selectedFenceId?: string;
  editable?: boolean;
  editType?: "circle" | "polygon";
  editCenter?: [number, number];
  editRadius?: number;
  editPoints?: GeofencePoint[];
  onMapClick?: (lat: number, lng: number) => void;
  onCenterChange?: (lat: number, lng: number) => void;
  deviceMarkers?: Array<{ id: string; name: string; lat: number; lng: number }>;
  className?: string;
}

const FENCE_COLORS: Record<string, string> = {
  active: "#3b82f6",
  inactive: "#9ca3af",
  selected: "#f59e0b",
};

function MapClickHandler({ onClick }: { onClick?: (lat: number, lng: number) => void }) {
  useMapEvents({
    click(e) {
      onClick?.(e.latlng.lat, e.latlng.lng);
    },
  });
  return null;
}

function FitBounds({ geofences }: { geofences: Geofence[] }) {
  const map = useMap();

  React.useEffect(() => {
    if (geofences.length === 0) return;

    const bounds: [number, number][] = [];
    for (const f of geofences) {
      const lat = parseFloat(f.centerLat);
      const lng = parseFloat(f.centerLng);
      if (!isNaN(lat) && !isNaN(lng)) {
        bounds.push([lat, lng]);
      }
      if (f.polygon) {
        for (const p of f.polygon) {
          bounds.push([p.lat, p.lng]);
        }
      }
    }

    if (bounds.length > 0) {
      map.fitBounds(bounds, { padding: [50, 50], maxZoom: 15 });
    }
  }, [map, geofences]);

  return null;
}

export function GeofenceMap({
  geofences,
  center = [37.7749, -122.4194],
  zoom = 12,
  selectedFenceId,
  editable = false,
  editType,
  editCenter,
  editRadius,
  editPoints,
  onMapClick,
  onCenterChange,
  deviceMarkers = [],
  className = "",
}: GeofenceMapProps) {
  return (
    <MapContainer
      center={center}
      zoom={zoom}
      className={`h-full w-full rounded-lg ${className}`}
      style={{ minHeight: "400px" }}
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />

      {geofences.length > 0 && !selectedFenceId && <FitBounds geofences={geofences} />}

      {editable && <MapClickHandler onClick={onMapClick} />}

      {/* Render existing geofences */}
      {geofences.map((fence) => {
        const isSelected = fence.id === selectedFenceId;
        const color = isSelected
          ? FENCE_COLORS.selected
          : fence.isActive
            ? FENCE_COLORS.active
            : FENCE_COLORS.inactive;

        if (fence.type === "circle") {
          const lat = parseFloat(fence.centerLat);
          const lng = parseFloat(fence.centerLng);
          if (isNaN(lat) || isNaN(lng)) return null;

          return (
            <Circle
              key={fence.id}
              center={[lat, lng] as LatLngExpression}
              radius={fence.radiusMeters}
              pathOptions={{
                color,
                fillColor: color,
                fillOpacity: isSelected ? 0.3 : 0.15,
                weight: isSelected ? 3 : 2,
              }}
            >
              <Popup>
                <div className="text-sm">
                  <p className="font-semibold">{fence.name}</p>
                  <p>Type: Circle</p>
                  <p>Radius: {fence.radiusMeters}m</p>
                  <p>Status: {fence.isActive ? "Active" : "Inactive"}</p>
                </div>
              </Popup>
            </Circle>
          );
        }

        if (fence.type === "polygon" && fence.polygon) {
          const positions = fence.polygon.map(
            (p) => [p.lat, p.lng] as LatLngExpression,
          );

          return (
            <Polygon
              key={fence.id}
              positions={positions}
              pathOptions={{
                color,
                fillColor: color,
                fillOpacity: isSelected ? 0.3 : 0.15,
                weight: isSelected ? 3 : 2,
              }}
            >
              <Popup>
                <div className="text-sm">
                  <p className="font-semibold">{fence.name}</p>
                  <p>Type: Polygon ({fence.polygon.length} points)</p>
                  <p>Status: {fence.isActive ? "Active" : "Inactive"}</p>
                </div>
              </Popup>
            </Polygon>
          );
        }

        return null;
      })}

      {/* Editable circle preview */}
      {editable && editType === "circle" && editCenter && editRadius && (
        <Circle
          center={editCenter as LatLngExpression}
          radius={editRadius}
          pathOptions={{
            color: "#22c55e",
            fillColor: "#22c55e",
            fillOpacity: 0.25,
            weight: 2,
            dashArray: "5 5",
          }}
        />
      )}

      {/* Editable polygon preview */}
      {editable && editType === "polygon" && editPoints && editPoints.length >= 3 && (
        <Polygon
          positions={editPoints.map((p) => [p.lat, p.lng] as LatLngExpression)}
          pathOptions={{
            color: "#22c55e",
            fillColor: "#22c55e",
            fillOpacity: 0.25,
            weight: 2,
            dashArray: "5 5",
          }}
        />
      )}

      {/* Polygon point markers while editing */}
      {editable && editType === "polygon" && editPoints?.map((p, i) => (
        <Circle
          key={`edit-point-${i}`}
          center={[p.lat, p.lng] as LatLngExpression}
          radius={8}
          pathOptions={{ color: "#22c55e", fillColor: "#22c55e", fillOpacity: 1, weight: 1 }}
        />
      ))}

      {/* Device markers */}
      {deviceMarkers.map((device) => (
        <Marker key={device.id} position={[device.lat, device.lng] as LatLngExpression}>
          <Popup>
            <div className="text-sm">
              <p className="font-semibold">{device.name}</p>
              <p className="text-xs text-gray-500">{device.id}</p>
            </div>
          </Popup>
        </Marker>
      ))}
    </MapContainer>
  );
}
