package config

import (
	"fmt"
	"os"
)

type Config struct {
	HTTPPort       string
	GRPCPort       string
	DatabaseURL    string
	RedisURL       string
	APNsCertPath   string
	APNsKeyPath    string
	APNsKeyID      string
	APNsTeamID     string
	APNsTopic      string
	APNsProduction bool
	DEPTokenPath   string
	DEPServerURL   string
	MDMSignCert    string
	MDMSignKey     string
	ServerURL      string
}

func Load() (*Config, error) {
	cfg := &Config{
		HTTPPort:       getEnv("HTTP_PORT", "8443"),
		GRPCPort:       getEnv("GRPC_PORT", "50060"),
		DatabaseURL:    getEnv("DATABASE_URL", "postgres://mdm:mdm@localhost:5432/mdm?sslmode=disable"),
		RedisURL:       getEnv("REDIS_URL", "redis://localhost:6379"),
		APNsCertPath:   getEnv("APNS_CERT_PATH", ""),
		APNsKeyPath:    getEnv("APNS_KEY_PATH", ""),
		APNsKeyID:      getEnv("APNS_KEY_ID", ""),
		APNsTeamID:     getEnv("APNS_TEAM_ID", ""),
		APNsTopic:      getEnv("APNS_TOPIC", ""),
		APNsProduction: getEnv("APNS_PRODUCTION", "false") == "true",
		DEPTokenPath:   getEnv("DEP_TOKEN_PATH", ""),
		DEPServerURL:   getEnv("DEP_SERVER_URL", "https://mdmenrollment.apple.com"),
		MDMSignCert:    getEnv("MDM_SIGN_CERT", ""),
		MDMSignKey:     getEnv("MDM_SIGN_KEY", ""),
		ServerURL:      getEnv("SERVER_URL", "https://mdm.example.com"),
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
