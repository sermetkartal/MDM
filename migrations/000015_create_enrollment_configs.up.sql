CREATE TABLE enrollment_configs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID REFERENCES organizations(id),
    method VARCHAR(20) CHECK (method IN ('qr_code', 'nfc', 'zero_touch', 'knox', 'manual')),
    config JSONB,
    token VARCHAR(255) UNIQUE,
    expires_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
