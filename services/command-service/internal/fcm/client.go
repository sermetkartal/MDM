package fcm

import (
	"context"
	"fmt"
	"log/slog"

	firebase "firebase.google.com/go/v4"
	"firebase.google.com/go/v4/messaging"
	"github.com/sermetkartal/mdm/services/command-service/internal/model"
	"google.golang.org/api/option"
)

// Client sends push notifications to devices via Firebase Cloud Messaging.
type Client struct {
	messagingClient *messaging.Client
	disabled        bool
}

func NewClient(credentialsFile string) (*Client, error) {
	if credentialsFile == "" {
		slog.Warn("FCM credentials not configured, push notifications disabled")
		return &Client{disabled: true}, nil
	}

	ctx := context.Background()
	opt := option.WithCredentialsFile(credentialsFile)
	app, err := firebase.NewApp(ctx, nil, opt)
	if err != nil {
		return nil, fmt.Errorf("failed to initialize Firebase app: %w", err)
	}

	msgClient, err := app.Messaging(ctx)
	if err != nil {
		return nil, fmt.Errorf("failed to initialize FCM messaging client: %w", err)
	}

	slog.Info("FCM client initialized")
	return &Client{messagingClient: msgClient}, nil
}

// SendToDevice sends a data-only FCM push notification to wake a device.
func (c *Client) SendToDevice(ctx context.Context, fcmToken string, commandID string, commandType string) error {
	if c.disabled {
		slog.Warn("FCM disabled, skipping push", "command_id", commandID)
		return nil
	}

	message := &messaging.Message{
		Token: fcmToken,
		Data: map[string]string{
			"command_id": commandID,
			"type":       commandType,
			"priority":   "high",
		},
		Android: &messaging.AndroidConfig{
			Priority: "high",
		},
	}

	response, err := c.messagingClient.Send(ctx, message)
	if err != nil {
		return fmt.Errorf("failed to send FCM message: %w", err)
	}

	slog.Info("FCM push sent",
		"command_id", commandID,
		"command_type", commandType,
		"fcm_response", response,
	)
	return nil
}

// SendCommand sends a command to a device via FCM push notification.
// This is a convenience wrapper around SendToDevice.
func (c *Client) SendCommand(ctx context.Context, deviceToken string, cmd *model.Command) error {
	return c.SendToDevice(ctx, deviceToken, cmd.ID.String(), string(cmd.CommandType))
}
