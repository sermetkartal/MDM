package config

import (
	"fmt"
	"os"
)

type Config struct {
	GRPCPort          string
	HTTPHealthPort    string
	SCEPPort          string
	DatabaseURL       string
	RedisURL          string
	NATSUrl           string
	CAKeyPath         string
	CACertPath        string
	SCEPChallenge     string
}

func Load() (*Config, error) {
	cfg := &Config{
		GRPCPort:          getEnv("GRPC_PORT", "50057"),
		HTTPHealthPort:    getEnv("HTTP_HEALTH_PORT", "8087"),
		SCEPPort:          getEnv("SCEP_PORT", "8080"),
		DatabaseURL:       getEnv("DATABASE_URL", "postgres://mdm:mdm@localhost:5432/mdm?sslmode=disable"),
		RedisURL:          getEnv("REDIS_URL", "redis://localhost:6379"),
		NATSUrl:           getEnv("NATS_URL", "nats://localhost:4222"),
		CAKeyPath:         getEnv("CA_KEY_PATH", ""),
		CACertPath:        getEnv("CA_CERT_PATH", ""),
		SCEPChallenge:     getEnv("SCEP_CHALLENGE", "mdm-scep-challenge"),
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
