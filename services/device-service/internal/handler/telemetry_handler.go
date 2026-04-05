package handler

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"log/slog"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/nats-io/nats.go"
)

// TelemetryEvent represents a single telemetry data point from a device.
type TelemetryEvent struct {
	DeviceID     uuid.UUID `json:"device_id"`
	MetricType   string    `json:"metric_type"`
	MetricValue  string    `json:"metric_value"`
	Timestamp    time.Time `json:"timestamp"`
}

// TelemetryBatch is a collection of telemetry events from a single device.
type TelemetryBatch struct {
	DeviceID uuid.UUID        `json:"device_id"`
	OrgID    uuid.UUID        `json:"org_id"`
	Events   []TelemetryEvent `json:"events"`
}

// TelemetryBucketRow is a time-bucketed aggregation result.
type TelemetryBucketRow struct {
	Bucket       time.Time `json:"time"`
	BatteryLevel *float64  `json:"battery"`
	StorageFreeMB *float64 `json:"storage"`
	MemoryFreeMB *float64  `json:"memory"`
	WifiSignal   *float64  `json:"wifi_signal"`
	Latitude     *float64  `json:"latitude"`
	Longitude    *float64  `json:"longitude"`
}

// LocationPoint represents a location history entry.
type LocationPoint struct {
	Latitude  float64   `json:"lat"`
	Longitude float64   `json:"lng"`
	Accuracy  float64   `json:"accuracy"`
	Timestamp time.Time `json:"timestamp"`
}

// TelemetryHandler handles ingestion and querying of device telemetry.
type TelemetryHandler struct {
	db *sql.DB
	nc *nats.Conn
}

func NewTelemetryHandler(db *sql.DB, nc *nats.Conn) *TelemetryHandler {
	return &TelemetryHandler{db: db, nc: nc}
}

// IngestBatch inserts a batch of telemetry events using multi-value INSERT for efficiency.
func (h *TelemetryHandler) IngestBatch(ctx context.Context, batch *TelemetryBatch) error {
	if len(batch.Events) == 0 {
		return nil
	}

	// Build multi-value INSERT
	valueStrings := make([]string, 0, len(batch.Events))
	valueArgs := make([]interface{}, 0, len(batch.Events)*4)

	for i, event := range batch.Events {
		base := i * 4
		valueStrings = append(valueStrings, fmt.Sprintf("($%d, $%d, $%d, $%d)", base+1, base+2, base+3, base+4))
		valueArgs = append(valueArgs, event.DeviceID, event.MetricType, event.MetricValue, event.Timestamp)
	}

	query := fmt.Sprintf(`
		INSERT INTO device_telemetry (device_id, metric_type, metric_value, time)
		VALUES %s`, strings.Join(valueStrings, ", "))

	_, err := h.db.ExecContext(ctx, query, valueArgs...)
	if err != nil {
		return fmt.Errorf("failed to insert telemetry batch: %w", err)
	}

	// Publish NATS event for real-time subscribers
	h.publishEvent("device.telemetry", map[string]interface{}{
		"device_id":   batch.DeviceID,
		"org_id":      batch.OrgID,
		"event_count": len(batch.Events),
	})

	// Check for health alert conditions
	h.checkHealthAlerts(batch)

	slog.Debug("ingested telemetry batch", "device_id", batch.DeviceID, "events", len(batch.Events))
	return nil
}

// QueryTelemetry returns time-bucketed telemetry data for a device.
func (h *TelemetryHandler) QueryTelemetry(ctx context.Context, deviceID uuid.UUID, from, to time.Time, interval string) ([]TelemetryBucketRow, error) {
	query := `
		SELECT
			time_bucket($1::interval, time) AS bucket,
			AVG(CASE WHEN metric_type = 'battery_level' THEN metric_value::numeric END) AS battery_level,
			AVG(CASE WHEN metric_type = 'storage_free_mb' THEN metric_value::numeric END) AS storage_free_mb,
			AVG(CASE WHEN metric_type = 'memory_free_mb' THEN metric_value::numeric END) AS memory_free_mb,
			AVG(CASE WHEN metric_type = 'wifi_rssi' THEN metric_value::numeric END) AS wifi_signal,
			AVG(CASE WHEN metric_type = 'gps_latitude' THEN metric_value::numeric END) AS latitude,
			AVG(CASE WHEN metric_type = 'gps_longitude' THEN metric_value::numeric END) AS longitude
		FROM device_telemetry
		WHERE device_id = $2 AND time >= $3 AND time <= $4
		GROUP BY bucket
		ORDER BY bucket ASC`

	rows, err := h.db.QueryContext(ctx, query, interval, deviceID, from, to)
	if err != nil {
		return nil, fmt.Errorf("failed to query telemetry: %w", err)
	}
	defer rows.Close()

	var results []TelemetryBucketRow
	for rows.Next() {
		var row TelemetryBucketRow
		if err := rows.Scan(
			&row.Bucket, &row.BatteryLevel, &row.StorageFreeMB,
			&row.MemoryFreeMB, &row.WifiSignal, &row.Latitude, &row.Longitude,
		); err != nil {
			return nil, err
		}
		results = append(results, row)
	}
	return results, nil
}

// QueryLocationHistory returns location data points for a device in a time range.
func (h *TelemetryHandler) QueryLocationHistory(ctx context.Context, deviceID uuid.UUID, from, to time.Time) ([]LocationPoint, error) {
	query := `
		SELECT
			time AS timestamp,
			MAX(CASE WHEN metric_type = 'gps_latitude' THEN metric_value::numeric END) AS latitude,
			MAX(CASE WHEN metric_type = 'gps_longitude' THEN metric_value::numeric END) AS longitude,
			MAX(CASE WHEN metric_type = 'gps_accuracy' THEN metric_value::numeric END) AS accuracy
		FROM device_telemetry
		WHERE device_id = $1 AND time >= $2 AND time <= $3
		AND metric_type IN ('gps_latitude', 'gps_longitude', 'gps_accuracy')
		GROUP BY time
		HAVING MAX(CASE WHEN metric_type = 'gps_latitude' THEN metric_value END) IS NOT NULL
		ORDER BY time ASC`

	rows, err := h.db.QueryContext(ctx, query, deviceID, from, to)
	if err != nil {
		return nil, fmt.Errorf("failed to query location history: %w", err)
	}
	defer rows.Close()

	var points []LocationPoint
	for rows.Next() {
		var p LocationPoint
		var ts time.Time
		if err := rows.Scan(&ts, &p.Latitude, &p.Longitude, &p.Accuracy); err != nil {
			return nil, err
		}
		p.Timestamp = ts
		points = append(points, p)
	}
	return points, nil
}

// checkHealthAlerts checks telemetry values and publishes health alert NATS events.
func (h *TelemetryHandler) checkHealthAlerts(batch *TelemetryBatch) {
	for _, event := range batch.Events {
		switch event.MetricType {
		case "battery_level":
			var level float64
			fmt.Sscanf(event.MetricValue, "%f", &level)
			if level > 0 && level < 10 {
				h.publishEvent("device.alert.low_battery", map[string]interface{}{
					"device_id":     batch.DeviceID,
					"org_id":        batch.OrgID,
					"battery_level": level,
					"timestamp":     event.Timestamp,
				})
			}
		case "storage_free_mb":
			var freeMB float64
			fmt.Sscanf(event.MetricValue, "%f", &freeMB)
			if freeMB > 0 && freeMB < 500 {
				h.publishEvent("device.alert.low_storage", map[string]interface{}{
					"device_id":       batch.DeviceID,
					"org_id":          batch.OrgID,
					"storage_free_mb": freeMB,
					"timestamp":       event.Timestamp,
				})
			}
		}
	}
}

func (h *TelemetryHandler) publishEvent(subject string, data interface{}) {
	if h.nc == nil {
		return
	}
	payload, err := json.Marshal(data)
	if err != nil {
		slog.Error("failed to marshal telemetry event", "subject", subject, "error", err)
		return
	}
	if err := h.nc.Publish(subject, payload); err != nil {
		slog.Error("failed to publish telemetry event", "subject", subject, "error", err)
	}
}
