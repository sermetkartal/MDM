package dep

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"os"
	"sync"
	"time"

	"github.com/sermetkartal/mdm/services/ios-mdm-service/internal/model"
)

type Client struct {
	serverURL   string
	accessToken string
	httpClient  *http.Client
	mu          sync.RWMutex
}

type depServerToken struct {
	ConsumerKey       string `json:"consumer_key"`
	ConsumerSecret    string `json:"consumer_secret"`
	AccessToken       string `json:"access_token"`
	AccessSecret      string `json:"access_secret"`
	AccessTokenExpiry string `json:"access_token_expiry"`
}

func NewClient(tokenPath, serverURL string) (*Client, error) {
	c := &Client{
		serverURL: serverURL,
		httpClient: &http.Client{
			Timeout: 30 * time.Second,
		},
	}

	if tokenPath == "" {
		slog.Warn("DEP token path not configured, DEP integration disabled")
		return c, nil
	}

	data, err := os.ReadFile(tokenPath)
	if err != nil {
		return nil, fmt.Errorf("read DEP token: %w", err)
	}

	var token depServerToken
	if err := json.Unmarshal(data, &token); err != nil {
		return nil, fmt.Errorf("parse DEP token: %w", err)
	}

	c.accessToken = token.AccessToken
	return c, nil
}

func (c *Client) doRequest(ctx context.Context, method, path string, body interface{}) ([]byte, error) {
	c.mu.RLock()
	token := c.accessToken
	c.mu.RUnlock()

	if token == "" {
		return nil, fmt.Errorf("DEP not configured")
	}

	var reqBody io.Reader
	if body != nil {
		data, err := json.Marshal(body)
		if err != nil {
			return nil, fmt.Errorf("marshal request: %w", err)
		}
		reqBody = bytes.NewReader(data)
	}

	req, err := http.NewRequestWithContext(ctx, method, c.serverURL+path, reqBody)
	if err != nil {
		return nil, fmt.Errorf("create request: %w", err)
	}

	req.Header.Set("Authorization", "Bearer "+token)
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-ADM-Auth-Session", token)

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("do request: %w", err)
	}
	defer resp.Body.Close()

	respBody, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("read response: %w", err)
	}

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return nil, fmt.Errorf("DEP API error: %d %s", resp.StatusCode, string(respBody))
	}

	return respBody, nil
}

// FetchDevices returns all devices assigned to this MDM server.
func (c *Client) FetchDevices(ctx context.Context) ([]model.DEPDevice, error) {
	data, err := c.doRequest(ctx, http.MethodPost, "/server/devices", map[string]int{"limit": 1000})
	if err != nil {
		return nil, err
	}

	var resp struct {
		Devices []model.DEPDevice `json:"devices"`
	}
	if err := json.Unmarshal(data, &resp); err != nil {
		return nil, fmt.Errorf("unmarshal devices: %w", err)
	}

	slog.Info("fetched DEP devices", "count", len(resp.Devices))
	return resp.Devices, nil
}

// AssignProfile assigns a DEP profile to one or more device serial numbers.
func (c *Client) AssignProfile(ctx context.Context, profileUUID string, serials []string) error {
	body := map[string]interface{}{
		"profile_uuid": profileUUID,
		"devices":      serials,
	}

	_, err := c.doRequest(ctx, http.MethodPut, "/profile/devices", body)
	if err != nil {
		return fmt.Errorf("assign profile: %w", err)
	}

	slog.Info("assigned DEP profile", "profile_uuid", profileUUID, "devices", len(serials))
	return nil
}

// SyncDevices fetches new or updated devices since the last sync cursor.
func (c *Client) SyncDevices(ctx context.Context, cursor string) (*model.DEPSyncResponse, error) {
	body := map[string]string{}
	if cursor != "" {
		body["cursor"] = cursor
	}

	data, err := c.doRequest(ctx, http.MethodPost, "/devices/sync", body)
	if err != nil {
		return nil, err
	}

	var resp model.DEPSyncResponse
	if err := json.Unmarshal(data, &resp); err != nil {
		return nil, fmt.Errorf("unmarshal sync response: %w", err)
	}

	slog.Info("synced DEP devices", "count", len(resp.Devices), "more", resp.MoreToFollow)
	return &resp, nil
}
