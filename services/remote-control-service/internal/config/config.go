package config

import (
	"fmt"
	"os"
	"time"
)

type ICEServer struct {
	URLs       []string `json:"urls"`
	Username   string   `json:"username,omitempty"`
	Credential string   `json:"credential,omitempty"`
}

type Config struct {
	GRPCPort       string
	HTTPPort       string
	HTTPHealthPort string
	DatabaseURL    string
	RedisURL       string
	NATSUrl        string

	SessionTTL            time.Duration
	SessionCleanupInterval time.Duration
	MaxSessionsPerDevice  int

	ICEServers []ICEServer
}

func Load() (*Config, error) {
	cfg := &Config{
		GRPCPort:       getEnv("GRPC_PORT", "50058"),
		HTTPPort:       getEnv("HTTP_PORT", "8058"),
		HTTPHealthPort: getEnv("HTTP_HEALTH_PORT", "8088"),
		DatabaseURL: getEnv("DATABASE_URL", "postgres://mdm:mdm@localhost:5432/mdm?sslmode=disable"),
		RedisURL:    getEnv("REDIS_URL", "redis://localhost:6379"),
		NATSUrl:     getEnv("NATS_URL", "nats://localhost:4222"),

		SessionTTL:            30 * time.Minute,
		SessionCleanupInterval: 1 * time.Minute,
		MaxSessionsPerDevice:  1,

		ICEServers: []ICEServer{
			{URLs: []string{"stun:stun.l.google.com:19302"}},
			{URLs: []string{"stun:stun1.l.google.com:19302"}},
			{
				URLs:       []string{getEnv("TURN_SERVER_URL", "turn:turn.example.com:3478")},
				Username:   getEnv("TURN_USERNAME", ""),
				Credential: getEnv("TURN_CREDENTIAL", ""),
			},
		},
	}

	if cfg.DatabaseURL == "" {
		return nil, fmt.Errorf("DATABASE_URL is required")
	}

	return cfg, nil
}

func getEnv(key, defaultValue string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return defaultValue
}
