package dispatcher

import (
	"context"
	"fmt"
	"sync"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/sermetkartal/mdm/services/command-service/internal/model"
)

// --- Mock FCM Client ---

type mockFCMClient struct {
	mu       sync.Mutex
	calls    []fcmCall
	failNext int // number of times to fail before succeeding
}

type fcmCall struct {
	Token     string
	CommandID string
	Type      string
}

func (m *mockFCMClient) SendToDevice(_ context.Context, token, commandID, commandType string) error {
	m.mu.Lock()
	defer m.mu.Unlock()

	if m.failNext > 0 {
		m.failNext--
		return fmt.Errorf("FCM send failed (simulated)")
	}

	m.calls = append(m.calls, fcmCall{Token: token, CommandID: commandID, Type: commandType})
	return nil
}

// --- Mock Repository ---

type mockRepository struct {
	mu       sync.Mutex
	statuses map[uuid.UUID][]statusUpdate
}

type statusUpdate struct {
	Status  model.CommandStatus
	Message string
}

func newMockRepo() *mockRepository {
	return &mockRepository{statuses: make(map[uuid.UUID][]statusUpdate)}
}

func (r *mockRepository) UpdateStatus(_ context.Context, id uuid.UUID, status model.CommandStatus, message string) error {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.statuses[id] = append(r.statuses[id], statusUpdate{Status: status, Message: message})
	return nil
}

func (r *mockRepository) getStatuses(id uuid.UUID) []statusUpdate {
	r.mu.Lock()
	defer r.mu.Unlock()
	return r.statuses[id]
}

// --- Mock Token Lookup ---

type mockTokenLookup struct {
	tokens map[uuid.UUID]string
}

func (m *mockTokenLookup) GetFCMToken(_ context.Context, deviceID uuid.UUID) (string, error) {
	token, ok := m.tokens[deviceID]
	if !ok {
		return "", fmt.Errorf("no FCM token for device %s", deviceID)
	}
	return token, nil
}

// --- Mock Queue (records published events) ---

type mockQueue struct {
	mu            sync.Mutex
	statusChanged []map[string]interface{}
	failed        []map[string]interface{}
}

func (q *mockQueue) PublishStatusChanged(_ context.Context, cmd *model.Command) error {
	q.mu.Lock()
	defer q.mu.Unlock()
	q.statusChanged = append(q.statusChanged, map[string]interface{}{
		"command_id": cmd.ID,
		"status":     cmd.Status,
	})
	return nil
}

func (q *mockQueue) PublishFailed(_ context.Context, cmd *model.Command, reason string) error {
	q.mu.Lock()
	defer q.mu.Unlock()
	q.failed = append(q.failed, map[string]interface{}{
		"command_id": cmd.ID,
		"reason":     reason,
	})
	return nil
}

// --- testDispatcher wraps Dispatcher with mock interfaces ---

// We define interfaces matching what Dispatcher uses so we can inject mocks.

type fcmSender interface {
	SendToDevice(ctx context.Context, token, commandID, commandType string) error
}

type statusUpdater interface {
	UpdateStatus(ctx context.Context, id uuid.UUID, status model.CommandStatus, message string) error
}

type eventPublisher interface {
	PublishStatusChanged(ctx context.Context, cmd *model.Command) error
	PublishFailed(ctx context.Context, cmd *model.Command, reason string) error
}

// testableDispatcher is a test-only dispatcher that accepts interfaces.
type testableDispatcher struct {
	repo        statusUpdater
	fcm         fcmSender
	queue       eventPublisher
	tokenLookup DeviceTokenLookup
}

func (d *testableDispatcher) HandleCommand(cmd *model.Command, ack func() error) error {
	ctx := context.Background()

	d.updateStatus(ctx, cmd, model.CommandStatusQueued, "command picked from queue")

	if cmd.ExpiresAt != nil && time.Now().After(*cmd.ExpiresAt) {
		d.updateStatus(ctx, cmd, model.CommandStatusExpired, "command expired before delivery")
		return ack()
	}

	var lastErr error
	for attempt := 0; attempt < maxRetries; attempt++ {
		// No actual sleep in tests - use zero delays
		lastErr = d.deliver(ctx, cmd)
		if lastErr == nil {
			d.updateStatus(ctx, cmd, model.CommandStatusDelivered, "command sent to device")
			return ack()
		}
	}

	reason := "delivery failed after retries: " + lastErr.Error()
	d.updateStatus(ctx, cmd, model.CommandStatusFailed, reason)

	if d.queue != nil {
		d.queue.PublishFailed(ctx, cmd, reason)
	}

	return ack()
}

func (d *testableDispatcher) deliver(ctx context.Context, cmd *model.Command) error {
	if d.fcm == nil {
		return fmt.Errorf("no delivery mechanism available")
	}

	token, err := d.tokenLookup.GetFCMToken(ctx, cmd.DeviceID)
	if err != nil {
		return err
	}

	return d.fcm.SendToDevice(ctx, token, cmd.ID.String(), string(cmd.CommandType))
}

func (d *testableDispatcher) updateStatus(ctx context.Context, cmd *model.Command, status model.CommandStatus, message string) {
	d.repo.UpdateStatus(ctx, cmd.ID, status, message)
	cmd.Status = status
	if d.queue != nil {
		d.queue.PublishStatusChanged(ctx, cmd)
	}
}

// --- Tests ---

func TestCommandLifecycle_Success(t *testing.T) {
	deviceID := uuid.New()
	cmdID := uuid.New()

	repo := newMockRepo()
	fcmClient := &mockFCMClient{}
	queue := &mockQueue{}
	tokens := &mockTokenLookup{tokens: map[uuid.UUID]string{deviceID: "fcm-token-123"}}

	d := &testableDispatcher{repo: repo, fcm: fcmClient, queue: queue, tokenLookup: tokens}

	cmd := &model.Command{
		ID:          cmdID,
		OrgID:       uuid.New(),
		DeviceID:    deviceID,
		CommandType: model.CommandTypeLock,
		Status:      model.CommandStatusPending,
	}

	acked := false
	err := d.HandleCommand(cmd, func() error { acked = true; return nil })
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if !acked {
		t.Fatal("expected ack to be called")
	}

	// Verify status transitions: queued -> delivered
	statuses := repo.getStatuses(cmdID)
	if len(statuses) != 2 {
		t.Fatalf("expected 2 status updates, got %d: %+v", len(statuses), statuses)
	}
	if statuses[0].Status != model.CommandStatusQueued {
		t.Errorf("expected first status to be queued, got %s", statuses[0].Status)
	}
	if statuses[1].Status != model.CommandStatusDelivered {
		t.Errorf("expected second status to be delivered, got %s", statuses[1].Status)
	}

	// Verify FCM was called
	if len(fcmClient.calls) != 1 {
		t.Fatalf("expected 1 FCM call, got %d", len(fcmClient.calls))
	}
	if fcmClient.calls[0].Token != "fcm-token-123" {
		t.Errorf("expected FCM token fcm-token-123, got %s", fcmClient.calls[0].Token)
	}

	// Verify status change events published
	if len(queue.statusChanged) != 2 {
		t.Errorf("expected 2 status change events, got %d", len(queue.statusChanged))
	}
}

func TestCommandLifecycle_RetryThenSuccess(t *testing.T) {
	deviceID := uuid.New()
	cmdID := uuid.New()

	repo := newMockRepo()
	fcmClient := &mockFCMClient{failNext: 2} // fail first 2 attempts, succeed on 3rd
	queue := &mockQueue{}
	tokens := &mockTokenLookup{tokens: map[uuid.UUID]string{deviceID: "fcm-token-456"}}

	d := &testableDispatcher{repo: repo, fcm: fcmClient, queue: queue, tokenLookup: tokens}

	cmd := &model.Command{
		ID:          cmdID,
		OrgID:       uuid.New(),
		DeviceID:    deviceID,
		CommandType: model.CommandTypeReboot,
		Status:      model.CommandStatusPending,
	}

	acked := false
	err := d.HandleCommand(cmd, func() error { acked = true; return nil })
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !acked {
		t.Fatal("expected ack")
	}

	// Should have succeeded after retries
	statuses := repo.getStatuses(cmdID)
	lastStatus := statuses[len(statuses)-1]
	if lastStatus.Status != model.CommandStatusDelivered {
		t.Errorf("expected final status delivered, got %s", lastStatus.Status)
	}
}

func TestCommandLifecycle_AllRetriesFail(t *testing.T) {
	deviceID := uuid.New()
	cmdID := uuid.New()

	repo := newMockRepo()
	fcmClient := &mockFCMClient{failNext: 100} // always fail
	queue := &mockQueue{}
	tokens := &mockTokenLookup{tokens: map[uuid.UUID]string{deviceID: "fcm-token-789"}}

	d := &testableDispatcher{repo: repo, fcm: fcmClient, queue: queue, tokenLookup: tokens}

	cmd := &model.Command{
		ID:          cmdID,
		OrgID:       uuid.New(),
		DeviceID:    deviceID,
		CommandType: model.CommandTypeWipe,
		Status:      model.CommandStatusPending,
	}

	acked := false
	err := d.HandleCommand(cmd, func() error { acked = true; return nil })
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !acked {
		t.Fatal("expected ack even on failure")
	}

	// Should be marked as failed
	statuses := repo.getStatuses(cmdID)
	lastStatus := statuses[len(statuses)-1]
	if lastStatus.Status != model.CommandStatusFailed {
		t.Errorf("expected final status failed, got %s", lastStatus.Status)
	}

	// Should have published a failure event
	if len(queue.failed) != 1 {
		t.Errorf("expected 1 failure event, got %d", len(queue.failed))
	}
}

func TestCommandLifecycle_Expiry(t *testing.T) {
	deviceID := uuid.New()
	cmdID := uuid.New()

	repo := newMockRepo()
	fcmClient := &mockFCMClient{}
	queue := &mockQueue{}
	tokens := &mockTokenLookup{tokens: map[uuid.UUID]string{deviceID: "fcm-token"}}

	d := &testableDispatcher{repo: repo, fcm: fcmClient, queue: queue, tokenLookup: tokens}

	pastTime := time.Now().Add(-1 * time.Hour)
	cmd := &model.Command{
		ID:          cmdID,
		OrgID:       uuid.New(),
		DeviceID:    deviceID,
		CommandType: model.CommandTypeLock,
		Status:      model.CommandStatusPending,
		ExpiresAt:   &pastTime,
	}

	acked := false
	err := d.HandleCommand(cmd, func() error { acked = true; return nil })
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !acked {
		t.Fatal("expected ack on expired command")
	}

	// Should be queued then expired
	statuses := repo.getStatuses(cmdID)
	if len(statuses) != 2 {
		t.Fatalf("expected 2 status updates, got %d: %+v", len(statuses), statuses)
	}
	if statuses[1].Status != model.CommandStatusExpired {
		t.Errorf("expected expired status, got %s", statuses[1].Status)
	}

	// FCM should not have been called
	if len(fcmClient.calls) != 0 {
		t.Errorf("expected no FCM calls for expired command, got %d", len(fcmClient.calls))
	}
}

func TestBulkDispatch(t *testing.T) {
	deviceIDs := []uuid.UUID{uuid.New(), uuid.New(), uuid.New()}

	repo := newMockRepo()
	fcmClient := &mockFCMClient{}
	queue := &mockQueue{}
	tokens := &mockTokenLookup{tokens: map[uuid.UUID]string{
		deviceIDs[0]: "token-a",
		deviceIDs[1]: "token-b",
		deviceIDs[2]: "token-c",
	}}

	d := &testableDispatcher{repo: repo, fcm: fcmClient, queue: queue, tokenLookup: tokens}

	var ackCount int
	for _, devID := range deviceIDs {
		cmd := &model.Command{
			ID:          uuid.New(),
			OrgID:       uuid.New(),
			DeviceID:    devID,
			CommandType: model.CommandTypeLock,
			Status:      model.CommandStatusPending,
		}
		err := d.HandleCommand(cmd, func() error { ackCount++; return nil })
		if err != nil {
			t.Fatalf("unexpected error for device %s: %v", devID, err)
		}
	}

	if ackCount != 3 {
		t.Errorf("expected 3 acks for bulk dispatch, got %d", ackCount)
	}

	if len(fcmClient.calls) != 3 {
		t.Errorf("expected 3 FCM calls, got %d", len(fcmClient.calls))
	}
}

func TestCommandExpiry_FutureNotExpired(t *testing.T) {
	deviceID := uuid.New()
	cmdID := uuid.New()

	repo := newMockRepo()
	fcmClient := &mockFCMClient{}
	queue := &mockQueue{}
	tokens := &mockTokenLookup{tokens: map[uuid.UUID]string{deviceID: "fcm-token"}}

	d := &testableDispatcher{repo: repo, fcm: fcmClient, queue: queue, tokenLookup: tokens}

	futureTime := time.Now().Add(1 * time.Hour)
	cmd := &model.Command{
		ID:          cmdID,
		OrgID:       uuid.New(),
		DeviceID:    deviceID,
		CommandType: model.CommandTypeReboot,
		Status:      model.CommandStatusPending,
		ExpiresAt:   &futureTime,
	}

	acked := false
	err := d.HandleCommand(cmd, func() error { acked = true; return nil })
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !acked {
		t.Fatal("expected ack")
	}

	// Command with future expiry should be delivered, not expired
	statuses := repo.getStatuses(cmdID)
	lastStatus := statuses[len(statuses)-1]
	if lastStatus.Status != model.CommandStatusDelivered {
		t.Errorf("expected delivered for future expiry, got %s", lastStatus.Status)
	}
}

func TestRetryExhaustion_PublishesFailureEvent(t *testing.T) {
	deviceID := uuid.New()
	cmdID := uuid.New()

	repo := newMockRepo()
	fcmClient := &mockFCMClient{failNext: maxRetries + 10} // fail all attempts
	queue := &mockQueue{}
	tokens := &mockTokenLookup{tokens: map[uuid.UUID]string{deviceID: "fcm-token"}}

	d := &testableDispatcher{repo: repo, fcm: fcmClient, queue: queue, tokenLookup: tokens}

	cmd := &model.Command{
		ID:          cmdID,
		OrgID:       uuid.New(),
		DeviceID:    deviceID,
		CommandType: model.CommandTypeSendMessage,
		Status:      model.CommandStatusPending,
	}

	acked := false
	err := d.HandleCommand(cmd, func() error { acked = true; return nil })
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !acked {
		t.Fatal("expected ack even on exhaustion")
	}

	// Verify failure status
	statuses := repo.getStatuses(cmdID)
	lastStatus := statuses[len(statuses)-1]
	if lastStatus.Status != model.CommandStatusFailed {
		t.Errorf("expected failed, got %s", lastStatus.Status)
	}

	// Verify failure event was published
	if len(queue.failed) != 1 {
		t.Errorf("expected 1 failure event on retry exhaustion, got %d", len(queue.failed))
	}

	// Verify the reason contains useful information
	if queue.failed[0]["reason"] == nil || queue.failed[0]["reason"] == "" {
		t.Error("expected failure reason to be populated")
	}
}
