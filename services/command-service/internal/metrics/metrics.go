package metrics

import (
	"github.com/prometheus/client_golang/prometheus"
	"github.com/prometheus/client_golang/prometheus/promauto"
)

var (
	CommandDispatchDuration = promauto.NewHistogram(prometheus.HistogramOpts{
		Name:    "mdm_command_dispatch_duration_seconds",
		Help:    "Duration of command dispatch in seconds",
		Buckets: prometheus.DefBuckets,
	})

	APIRequestDuration = promauto.NewHistogramVec(prometheus.HistogramOpts{
		Name:    "mdm_api_request_duration_seconds",
		Help:    "Duration of API requests in seconds",
		Buckets: prometheus.DefBuckets,
	}, []string{"method", "path", "status"})

	CommandsTotal = promauto.NewCounterVec(prometheus.CounterOpts{
		Name: "mdm_commands_total",
		Help: "Total commands dispatched by type and status",
	}, []string{"type", "status"})

	WSConnections = promauto.NewGauge(prometheus.GaugeOpts{
		Name: "mdm_ws_connections_active",
		Help: "Number of active WebSocket connections",
	})

	CommandQueueDepth = promauto.NewGauge(prometheus.GaugeOpts{
		Name: "mdm_command_queue_depth",
		Help: "Number of commands waiting in the dispatch queue",
	})
)
