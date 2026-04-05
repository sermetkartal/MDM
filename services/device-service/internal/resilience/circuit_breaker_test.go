package resilience

import (
	"errors"
	"testing"
	"time"
)

func TestCircuitBreaker_ClosedState(t *testing.T) {
	cb := New(Config{
		Name:             "test",
		FailureThreshold: 3,
		ResetTimeout:     100 * time.Millisecond,
		HalfOpenMaxCalls: 2,
	})

	// Successful calls keep the circuit closed
	for i := 0; i < 10; i++ {
		err := cb.Execute(func() error { return nil })
		if err != nil {
			t.Fatalf("expected no error, got %v", err)
		}
	}

	if cb.State() != StateClosed {
		t.Fatalf("expected closed, got %s", cb.State())
	}
}

func TestCircuitBreaker_OpensAfterThreshold(t *testing.T) {
	cb := New(Config{
		Name:             "test",
		FailureThreshold: 3,
		ResetTimeout:     100 * time.Millisecond,
		HalfOpenMaxCalls: 2,
	})

	testErr := errors.New("fail")
	for i := 0; i < 3; i++ {
		_ = cb.Execute(func() error { return testErr })
	}

	if cb.State() != StateOpen {
		t.Fatalf("expected open, got %s", cb.State())
	}

	// Further calls should fail fast
	err := cb.Execute(func() error { return nil })
	if !errors.Is(err, ErrCircuitOpen) {
		t.Fatalf("expected ErrCircuitOpen, got %v", err)
	}
}

func TestCircuitBreaker_HalfOpenRecovery(t *testing.T) {
	cb := New(Config{
		Name:             "test",
		FailureThreshold: 2,
		ResetTimeout:     50 * time.Millisecond,
		HalfOpenMaxCalls: 2,
	})

	testErr := errors.New("fail")
	for i := 0; i < 2; i++ {
		_ = cb.Execute(func() error { return testErr })
	}
	if cb.State() != StateOpen {
		t.Fatalf("expected open, got %s", cb.State())
	}

	// Wait for reset timeout
	time.Sleep(60 * time.Millisecond)

	if cb.State() != StateHalfOpen {
		t.Fatalf("expected half-open, got %s", cb.State())
	}

	// Successful probe calls should close the circuit
	for i := 0; i < 2; i++ {
		err := cb.Execute(func() error { return nil })
		if err != nil {
			t.Fatalf("expected no error in half-open, got %v", err)
		}
	}

	if cb.State() != StateClosed {
		t.Fatalf("expected closed after recovery, got %s", cb.State())
	}
}

func TestCircuitBreaker_HalfOpenFailure(t *testing.T) {
	cb := New(Config{
		Name:             "test",
		FailureThreshold: 2,
		ResetTimeout:     50 * time.Millisecond,
		HalfOpenMaxCalls: 2,
	})

	testErr := errors.New("fail")
	for i := 0; i < 2; i++ {
		_ = cb.Execute(func() error { return testErr })
	}

	time.Sleep(60 * time.Millisecond)

	// One failure in half-open should re-open
	_ = cb.Execute(func() error { return testErr })

	if cb.State() != StateOpen {
		t.Fatalf("expected open after half-open failure, got %s", cb.State())
	}
}
