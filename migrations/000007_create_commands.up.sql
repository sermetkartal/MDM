CREATE TYPE command_type AS ENUM (
    'lock', 'unlock', 'wipe', 'selective_wipe', 'reboot',
    'install_app', 'uninstall_app', 'set_policy', 'clear_passcode',
    'enable_kiosk', 'disable_kiosk', 'request_location', 'send_message',
    'remote_shell', 'ring_device', 'set_brightness', 'set_volume'
);

CREATE TYPE command_status AS ENUM (
    'pending', 'queued', 'sent', 'delivered', 'acknowledged',
    'completed', 'failed', 'expired', 'cancelled'
);

CREATE TABLE commands (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID REFERENCES organizations(id),
    device_id UUID NOT NULL REFERENCES devices(id),
    type command_type NOT NULL,
    payload JSONB,
    status command_status DEFAULT 'pending',
    priority INTEGER DEFAULT 0,
    retry_count INTEGER DEFAULT 0,
    max_retries INTEGER DEFAULT 3,
    expires_at TIMESTAMPTZ,
    issued_by UUID REFERENCES users(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE command_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    command_id UUID NOT NULL REFERENCES commands(id),
    status VARCHAR(50) NOT NULL,
    detail JSONB,
    occurred_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_commands_org_device_status ON commands (org_id, device_id, status);
CREATE INDEX idx_commands_status_expires ON commands (status, expires_at);
