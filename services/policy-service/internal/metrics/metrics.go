package metrics

import (
	"github.com/prometheus/client_golang/prometheus"
	"github.com/prometheus/client_golang/prometheus/promauto"
)

var (
	PolicyDeployments = promauto.NewCounterVec(prometheus.CounterOpts{
		Name: "mdm_policy_deployments_total",
		Help: "Total policy deployments by organization and status",
	}, []string{"org", "status"})

	APIRequestDuration = promauto.NewHistogramVec(prometheus.HistogramOpts{
		Name:    "mdm_api_request_duration_seconds",
		Help:    "Duration of API requests in seconds",
		Buckets: prometheus.DefBuckets,
	}, []string{"method", "path", "status"})

	PoliciesTotal = promauto.NewGaugeVec(prometheus.GaugeOpts{
		Name: "mdm_policies_total",
		Help: "Total number of policies by organization and type",
	}, []string{"org", "type"})

	PolicyEvaluationDuration = promauto.NewHistogram(prometheus.HistogramOpts{
		Name:    "mdm_policy_evaluation_duration_seconds",
		Help:    "Duration of policy evaluation in seconds",
		Buckets: prometheus.DefBuckets,
	})

	ComplianceViolations = promauto.NewGaugeVec(prometheus.GaugeOpts{
		Name: "mdm_compliance_violations",
		Help: "Current compliance violations by organization and severity",
	}, []string{"org", "severity"})
)
