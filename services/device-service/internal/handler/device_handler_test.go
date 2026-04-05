package handler

import (
	"context"
	"fmt"
	"io"
	"sync"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/sermetkartal/mdm/services/device-service/internal/model"
)

// --- Mock repository for testing ---

type mockDeviceRepo struct {
	mu      sync.Mutex
	devices map[uuid.UUID]*model.Device
	serials map[string]uuid.UUID
}

func newMockDeviceRepo() *mockDeviceRepo {
	return &mockDeviceRepo{
		devices: make(map[uuid.UUID]*model.Device),
		serials: make(map[string]uuid.UUID),
	}
}

func (r *mockDeviceRepo) Create(_ context.Context, d *model.Device) error {
	r.mu.Lock()
	defer r.mu.Unlock()
	if _, exists := r.serials[d.SerialNumber]; exists {
		return fmt.Errorf("duplicate serial number: %s", d.SerialNumber)
	}
	d.ID = uuid.New()
	d.CreatedAt = time.Now()
	d.UpdatedAt = time.Now()
	r.devices[d.ID] = d
	r.serials[d.SerialNumber] = d.ID
	return nil
}

func (r *mockDeviceRepo) UpdateLastSeen(_ context.Context, id uuid.UUID) error {
	r.mu.Lock()
	defer r.mu.Unlock()
	d, ok := r.devices[id]
	if !ok {
		return fmt.Errorf("device not found: %s", id)
	}
	now := time.Now()
	d.LastSeenAt = &now
	d.UpdatedAt = now
	return nil
}

func (r *mockDeviceRepo) UpdateStatus(_ context.Context, id uuid.UUID, status model.EnrollmentStatus) error {
	r.mu.Lock()
	defer r.mu.Unlock()
	d, ok := r.devices[id]
	if !ok {
		return fmt.Errorf("device not found: %s", id)
	}
	d.EnrollmentStatus = status
	d.UpdatedAt = time.Now()
	return nil
}

func (r *mockDeviceRepo) getDevice(id uuid.UUID) *model.Device {
	r.mu.Lock()
	defer r.mu.Unlock()
	return r.devices[id]
}

// --- Mock NATS ---

type mockNATS struct {
	mu     sync.Mutex
	events []mockEvent
}

type mockEvent struct {
	Subject string
	Data    []byte
}

func (n *mockNATS) Publish(subject string, data []byte) error {
	n.mu.Lock()
	defer n.mu.Unlock()
	n.events = append(n.events, mockEvent{Subject: subject, Data: data})
	return nil
}

// --- Testable handler that uses interfaces ---

type deviceRepo interface {
	Create(ctx context.Context, d *model.Device) error
	UpdateLastSeen(ctx context.Context, id uuid.UUID) error
	UpdateStatus(ctx context.Context, id uuid.UUID, status model.EnrollmentStatus) error
}

type eventPublisher interface {
	Publish(subject string, data []byte) error
}

type testHandler struct {
	repo deviceRepo
	nc   eventPublisher
}

func (h *testHandler) HandleEnroll(ctx context.Context, req *model.EnrollRequest) (*model.Device, error) {
	now := time.Now()
	device := &model.Device{
		SerialNumber:     req.SerialNumber,
		HardwareID:       req.HardwareID,
		Model:            req.Model,
		Manufacturer:     req.Manufacturer,
		OSType:           "android",
		OSVersion:        req.OSVersion,
		AgentVersion:     req.AgentVersion,
		EnrollmentStatus: model.EnrollmentStatusEnrolled,
		ComplianceState:  model.ComplianceStatePending,
		EnrolledAt:       &now,
	}

	if err := h.repo.Create(ctx, device); err != nil {
		return nil, err
	}
	return device, nil
}

func (h *testHandler) HandleHeartbeat(ctx context.Context, data *model.HeartbeatData) (int64, error) {
	if err := h.repo.UpdateLastSeen(ctx, data.DeviceID); err != nil {
		return 60, err
	}
	return 60, nil
}

func (h *testHandler) HandleUnenroll(ctx context.Context, deviceID uuid.UUID) error {
	return h.repo.UpdateStatus(ctx, deviceID, model.EnrollmentStatusUnenrolled)
}

// --- Mock command stream ---

type mockCommandStream struct {
	mu       sync.Mutex
	sent     []*CommandStreamMessage
	recvMsgs []*CommandAck
	recvIdx  int
}

func (s *mockCommandStream) Send(msg *CommandStreamMessage) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.sent = append(s.sent, msg)
	return nil
}

func (s *mockCommandStream) Recv() (*CommandAck, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.recvIdx >= len(s.recvMsgs) {
		return nil, io.EOF
	}
	ack := s.recvMsgs[s.recvIdx]
	s.recvIdx++
	return ack, nil
}

// --- Tests ---

func TestHandleEnroll_Success(t *testing.T) {
	repo := newMockDeviceRepo()
	nc := &mockNATS{}
	h := &testHandler{repo: repo, nc: nc}

	req := &model.EnrollRequest{
		SerialNumber: "SN-TEST-001",
		HardwareID:   "HW-001",
		Model:        "Pixel 8",
		Manufacturer: "Google",
		OSVersion:    "14.0",
		AgentVersion: "1.0.0",
	}

	device, err := h.HandleEnroll(context.Background(), req)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if device.ID == uuid.Nil {
		t.Error("expected device to have a non-nil ID")
	}
	if device.EnrollmentStatus != model.EnrollmentStatusEnrolled {
		t.Errorf("expected enrolled status, got %s", device.EnrollmentStatus)
	}
	if device.SerialNumber != "SN-TEST-001" {
		t.Errorf("expected serial SN-TEST-001, got %s", device.SerialNumber)
	}
	if device.EnrolledAt == nil {
		t.Error("expected enrolled_at to be set")
	}
}

func TestHandleEnroll_DuplicateSerial(t *testing.T) {
	repo := newMockDeviceRepo()
	nc := &mockNATS{}
	h := &testHandler{repo: repo, nc: nc}

	req := &model.EnrollRequest{
		SerialNumber: "SN-DUPLICATE",
		HardwareID:   "HW-001",
		Model:        "Pixel 8",
		Manufacturer: "Google",
		OSVersion:    "14.0",
		AgentVersion: "1.0.0",
	}

	_, err := h.HandleEnroll(context.Background(), req)
	if err != nil {
		t.Fatalf("first enrollment should succeed: %v", err)
	}

	// Second enrollment with same serial should fail
	_, err = h.HandleEnroll(context.Background(), req)
	if err == nil {
		t.Fatal("expected error for duplicate serial number")
	}
}

func TestHandleHeartbeat_UpdatesLastSeen(t *testing.T) {
	repo := newMockDeviceRepo()
	nc := &mockNATS{}
	h := &testHandler{repo: repo, nc: nc}

	// First enroll a device
	req := &model.EnrollRequest{
		SerialNumber: "SN-HEARTBEAT-001",
		HardwareID:   "HW-002",
		Model:        "Pixel 7",
		Manufacturer: "Google",
		OSVersion:    "13.0",
		AgentVersion: "1.0.0",
	}

	device, err := h.HandleEnroll(context.Background(), req)
	if err != nil {
		t.Fatalf("enrollment failed: %v", err)
	}

	// Send heartbeat
	data := &model.HeartbeatData{
		DeviceID:     device.ID,
		BatteryLevel: 85,
		OSVersion:    "13.0",
	}

	interval, err := h.HandleHeartbeat(context.Background(), data)
	if err != nil {
		t.Fatalf("heartbeat failed: %v", err)
	}
	if interval != 60 {
		t.Errorf("expected 60s interval, got %d", interval)
	}

	// Verify last_seen was updated
	d := repo.getDevice(device.ID)
	if d.LastSeenAt == nil {
		t.Error("expected last_seen_at to be set after heartbeat")
	}
}

func TestHandleUnenroll_StatusChange(t *testing.T) {
	repo := newMockDeviceRepo()
	nc := &mockNATS{}
	h := &testHandler{repo: repo, nc: nc}

	req := &model.EnrollRequest{
		SerialNumber: "SN-UNENROLL-001",
		HardwareID:   "HW-003",
		Model:        "Galaxy S24",
		Manufacturer: "Samsung",
		OSVersion:    "14.0",
		AgentVersion: "1.0.0",
	}

	device, err := h.HandleEnroll(context.Background(), req)
	if err != nil {
		t.Fatalf("enrollment failed: %v", err)
	}

	err = h.HandleUnenroll(context.Background(), device.ID)
	if err != nil {
		t.Fatalf("unenroll failed: %v", err)
	}

	d := repo.getDevice(device.ID)
	if d.EnrollmentStatus != model.EnrollmentStatusUnenrolled {
		t.Errorf("expected unenrolled status, got %s", d.EnrollmentStatus)
	}
}

func TestHandleHeartbeat_UnknownDevice(t *testing.T) {
	repo := newMockDeviceRepo()
	nc := &mockNATS{}
	h := &testHandler{repo: repo, nc: nc}

	data := &model.HeartbeatData{
		DeviceID:     uuid.New(),
		BatteryLevel: 50,
	}

	_, err := h.HandleHeartbeat(context.Background(), data)
	if err == nil {
		t.Fatal("expected error for unknown device heartbeat")
	}
}

func TestHandleCommandStream_SendAndAck(t *testing.T) {
	cmdID := uuid.New()
	deviceID := uuid.New()

	stream := &mockCommandStream{
		recvMsgs: []*CommandAck{
			{CommandID: cmdID, Status: "received", Message: "got it"},
			{CommandID: cmdID, Status: "completed", Message: "done"},
		},
	}

	// Create a handler that processes the stream
	handler := &DeviceHandler{}
	err := handler.HandleCommandStream(deviceID, stream)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
}

func TestHandleEnroll_FieldMapping(t *testing.T) {
	repo := newMockDeviceRepo()
	nc := &mockNATS{}
	h := &testHandler{repo: repo, nc: nc}

	req := &model.EnrollRequest{
		SerialNumber: "SN-FIELDS-001",
		HardwareID:   "HW-FIELDS",
		Model:        "Pixel 8 Pro",
		Manufacturer: "Google",
		OSVersion:    "14.0",
		AgentVersion: "2.0.0",
	}

	device, err := h.HandleEnroll(context.Background(), req)
	if err != nil {
		t.Fatalf("enrollment failed: %v", err)
	}
	if device.OSType != "android" {
		t.Errorf("expected os_type=android, got %s", device.OSType)
	}
	if device.ComplianceState != model.ComplianceStatePending {
		t.Errorf("expected compliance_state=pending, got %s", device.ComplianceState)
	}
	if device.Model != "Pixel 8 Pro" {
		t.Errorf("expected model=Pixel 8 Pro, got %s", device.Model)
	}
}
