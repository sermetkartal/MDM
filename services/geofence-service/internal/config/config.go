package config

import (
	"fmt"
	"os"
)

type Config struct {
	GRPCPort       string
	HTTPHealthPort string
	DatabaseURL    string
	RedisURL       string
	NATSUrl        string
}

func Load() (*Config, error) {
	cfg := &Config{
		GRPCPort:       getEnv("GRPC_PORT", "50056"),
		HTTPHealthPort: getEnv("HTTP_HEALTH_PORT", "8086"),
		DatabaseURL: getEnv("DATABASE_URL", "postgres://mdm:mdm@localhost:5432/mdm?sslmode=disable"),
		RedisURL:    getEnv("REDIS_URL", "redis://localhost:6379"),
		NATSUrl:     getEnv("NATS_URL", "nats://localhost:4222"),
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
