package apns

import (
	"fmt"
	"log/slog"

	"github.com/sideshow/apns2"
	"github.com/sideshow/apns2/token"
)

type Client struct {
	apnsClient *apns2.Client
	topic      string
}

type Config struct {
	KeyPath    string
	KeyID      string
	TeamID     string
	Topic      string
	Production bool
}

func NewClient(cfg Config) (*Client, error) {
	if cfg.KeyPath == "" {
		slog.Warn("APNs key path not configured, push notifications disabled")
		return &Client{topic: cfg.Topic}, nil
	}

	authKey, err := token.AuthKeyFromFile(cfg.KeyPath)
	if err != nil {
		return nil, fmt.Errorf("load APNs auth key: %w", err)
	}

	authToken := &token.Token{
		AuthKey: authKey,
		KeyID:   cfg.KeyID,
		TeamID:  cfg.TeamID,
	}

	var client *apns2.Client
	if cfg.Production {
		client = apns2.NewTokenClient(authToken).Production()
	} else {
		client = apns2.NewTokenClient(authToken).Development()
	}

	return &Client{
		apnsClient: client,
		topic:      cfg.Topic,
	}, nil
}

// SendMDMPush sends an empty push notification to wake a device for MDM check-in.
func (c *Client) SendMDMPush(deviceToken string, pushMagic string) error {
	if c.apnsClient == nil {
		slog.Warn("APNs client not configured, skipping push", "device_token", deviceToken)
		return nil
	}

	notification := &apns2.Notification{
		DeviceToken: deviceToken,
		Topic:       c.topic,
		Payload:     []byte(`{"mdm":"` + pushMagic + `"}`),
		Priority:    apns2.PriorityHigh,
	}

	resp, err := c.apnsClient.Push(notification)
	if err != nil {
		return fmt.Errorf("apns push: %w", err)
	}

	if !resp.Sent() {
		switch resp.Reason {
		case apns2.ReasonBadDeviceToken:
			slog.Error("bad device token", "device_token", deviceToken, "reason", resp.Reason)
			return fmt.Errorf("bad device token: %s", resp.Reason)
		case apns2.ReasonUnregistered:
			slog.Error("device unregistered", "device_token", deviceToken, "reason", resp.Reason)
			return fmt.Errorf("device unregistered: %s", resp.Reason)
		default:
			return fmt.Errorf("apns push failed: %d %s", resp.StatusCode, resp.Reason)
		}
	}

	slog.Info("MDM push sent", "device_token", deviceToken, "apns_id", resp.ApnsID)
	return nil
}
