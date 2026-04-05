package metrics

import (
	"github.com/prometheus/client_golang/prometheus"
	"github.com/prometheus/client_golang/prometheus/promauto"
)

var (
	DevicesTotal = promauto.NewGaugeVec(prometheus.GaugeOpts{
		Name: "mdm_devices_total",
		Help: "Total number of managed devices by organization and status",
	}, []string{"org", "status"})

	DeviceCheckins = promauto.NewCounter(prometheus.CounterOpts{
		Name: "mdm_device_checkins_total",
		Help: "Total number of device check-ins/heartbeats",
	})

	APIRequestDuration = promauto.NewHistogramVec(prometheus.HistogramOpts{
		Name:    "mdm_api_request_duration_seconds",
		Help:    "Duration of API requests in seconds",
		Buckets: prometheus.DefBuckets,
	}, []string{"method", "path", "status"})

	WSConnections = promauto.NewGauge(prometheus.GaugeOpts{
		Name: "mdm_ws_connections_active",
		Help: "Number of active WebSocket connections",
	})

	ComplianceViolations = promauto.NewGaugeVec(prometheus.GaugeOpts{
		Name: "mdm_compliance_violations",
		Help: "Current compliance violations by organization and severity",
	}, []string{"org", "severity"})

	EnrollmentDuration = promauto.NewHistogram(prometheus.HistogramOpts{
		Name:    "mdm_enrollment_duration_seconds",
		Help:    "Duration of device enrollment in seconds",
		Buckets: prometheus.DefBuckets,
	})
)
