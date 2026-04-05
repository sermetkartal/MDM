package repository

import (
	"context"
	"database/sql"
	"encoding/json"
	"time"

	"github.com/google/uuid"
	"github.com/sermetkartal/mdm/services/command-service/internal/model"
)

type CommandRepository struct {
	db *sql.DB
}

func NewCommandRepository(db *sql.DB) *CommandRepository {
	return &CommandRepository{db: db}
}

func (r *CommandRepository) Create(ctx context.Context, cmd *model.Command) error {
	cmd.ID = uuid.New()
	cmd.CreatedAt = time.Now()
	cmd.UpdatedAt = time.Now()

	payloadJSON, err := json.Marshal(cmd.Payload)
	if err != nil {
		return err
	}

	_, err = r.db.ExecContext(ctx, `
		INSERT INTO commands (id, org_id, device_id, command_type, status,
			payload, issued_by, expires_at, created_at, updated_at)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
		cmd.ID, cmd.OrgID, cmd.DeviceID, cmd.CommandType, cmd.Status,
		payloadJSON, cmd.IssuedBy, cmd.ExpiresAt, cmd.CreatedAt, cmd.UpdatedAt,
	)
	return err
}

func (r *CommandRepository) GetByID(ctx context.Context, id uuid.UUID) (*model.Command, error) {
	cmd := &model.Command{}
	var payloadJSON []byte
	err := r.db.QueryRowContext(ctx, `
		SELECT id, org_id, device_id, command_type, status, payload,
			issued_by, expires_at, created_at, updated_at
		FROM commands WHERE id = $1`, id,
	).Scan(
		&cmd.ID, &cmd.OrgID, &cmd.DeviceID, &cmd.CommandType, &cmd.Status,
		&payloadJSON, &cmd.IssuedBy, &cmd.ExpiresAt, &cmd.CreatedAt, &cmd.UpdatedAt,
	)
	if err != nil {
		return nil, err
	}

	if err := json.Unmarshal(payloadJSON, &cmd.Payload); err != nil {
		return nil, err
	}
	return cmd, nil
}

func (r *CommandRepository) UpdateStatus(ctx context.Context, id uuid.UUID, status model.CommandStatus, message string) error {
	tx, err := r.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()

	_, err = tx.ExecContext(ctx, `
		UPDATE commands SET status = $2, updated_at = NOW() WHERE id = $1`, id, status)
	if err != nil {
		return err
	}

	_, err = tx.ExecContext(ctx, `
		INSERT INTO command_history (id, command_id, status, message, created_at)
		VALUES ($1, $2, $3, $4, $5)`,
		uuid.New(), id, status, message, time.Now(),
	)
	if err != nil {
		return err
	}

	return tx.Commit()
}

func (r *CommandRepository) ListByDevice(ctx context.Context, deviceID uuid.UUID, limit, offset int) ([]*model.Command, error) {
	rows, err := r.db.QueryContext(ctx, `
		SELECT id, org_id, device_id, command_type, status, payload,
			issued_by, expires_at, created_at, updated_at
		FROM commands WHERE device_id = $1 ORDER BY created_at DESC
		LIMIT $2 OFFSET $3`, deviceID, limit, offset,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var commands []*model.Command
	for rows.Next() {
		cmd := &model.Command{}
		var payloadJSON []byte
		if err := rows.Scan(
			&cmd.ID, &cmd.OrgID, &cmd.DeviceID, &cmd.CommandType, &cmd.Status,
			&payloadJSON, &cmd.IssuedBy, &cmd.ExpiresAt, &cmd.CreatedAt, &cmd.UpdatedAt,
		); err != nil {
			return nil, err
		}
		json.Unmarshal(payloadJSON, &cmd.Payload)
		commands = append(commands, cmd)
	}
	return commands, nil
}

func (r *CommandRepository) GetHistory(ctx context.Context, commandID uuid.UUID) ([]model.CommandHistory, error) {
	rows, err := r.db.QueryContext(ctx, `
		SELECT id, command_id, status, message, created_at
		FROM command_history WHERE command_id = $1
		ORDER BY created_at ASC`, commandID,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var history []model.CommandHistory
	for rows.Next() {
		h := model.CommandHistory{}
		if err := rows.Scan(&h.ID, &h.CommandID, &h.Status, &h.Message, &h.CreatedAt); err != nil {
			return nil, err
		}
		history = append(history, h)
	}
	return history, nil
}

func (r *CommandRepository) GetExpiredPending(ctx context.Context) ([]*model.Command, error) {
	rows, err := r.db.QueryContext(ctx, `
		SELECT id, org_id, device_id, command_type, status, payload,
			issued_by, expires_at, created_at, updated_at
		FROM commands
		WHERE status IN ('pending', 'queued', 'delivered')
			AND expires_at IS NOT NULL AND expires_at < NOW()`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var commands []*model.Command
	for rows.Next() {
		cmd := &model.Command{}
		var payloadJSON []byte
		if err := rows.Scan(
			&cmd.ID, &cmd.OrgID, &cmd.DeviceID, &cmd.CommandType, &cmd.Status,
			&payloadJSON, &cmd.IssuedBy, &cmd.ExpiresAt, &cmd.CreatedAt, &cmd.UpdatedAt,
		); err != nil {
			return nil, err
		}
		json.Unmarshal(payloadJSON, &cmd.Payload)
		commands = append(commands, cmd)
	}
	return commands, nil
}

func (r *CommandRepository) CancelCommand(ctx context.Context, id uuid.UUID) error {
	return r.UpdateStatus(ctx, id, model.CommandStatusCancelled, "command cancelled by user")
}

// GetGroupMembers returns the device IDs belonging to a device group.
func (r *CommandRepository) GetGroupMembers(ctx context.Context, groupID uuid.UUID) ([]uuid.UUID, error) {
	rows, err := r.db.QueryContext(ctx, `
		SELECT device_id FROM device_group_members WHERE group_id = $1`, groupID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var deviceIDs []uuid.UUID
	for rows.Next() {
		var id uuid.UUID
		if err := rows.Scan(&id); err != nil {
			return nil, err
		}
		deviceIDs = append(deviceIDs, id)
	}
	return deviceIDs, nil
}

// GetPendingForDevice returns commands pending delivery for a specific device.
func (r *CommandRepository) GetPendingForDevice(ctx context.Context, deviceID uuid.UUID) ([]*model.Command, error) {
	rows, err := r.db.QueryContext(ctx, `
		SELECT id, org_id, device_id, command_type, status, payload,
			issued_by, expires_at, created_at, updated_at
		FROM commands
		WHERE device_id = $1 AND status IN ('pending', 'queued', 'sent')
		ORDER BY created_at ASC`, deviceID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var commands []*model.Command
	for rows.Next() {
		cmd := &model.Command{}
		var payloadJSON []byte
		if err := rows.Scan(
			&cmd.ID, &cmd.OrgID, &cmd.DeviceID, &cmd.CommandType, &cmd.Status,
			&payloadJSON, &cmd.IssuedBy, &cmd.ExpiresAt, &cmd.CreatedAt, &cmd.UpdatedAt,
		); err != nil {
			return nil, err
		}
		json.Unmarshal(payloadJSON, &cmd.Payload)
		commands = append(commands, cmd)
	}
	return commands, nil
}
