CREATE TYPE policy_type AS ENUM ('restriction', 'wifi', 'vpn', 'passcode', 'kiosk', 'app_management', 'compliance', 'geofence', 'certificate', 'custom');

CREATE TABLE policies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID REFERENCES organizations(id),
    name VARCHAR(255) NOT NULL,
    type policy_type NOT NULL,
    priority INTEGER DEFAULT 0,
    payload JSONB NOT NULL,
    version INTEGER DEFAULT 1,
    is_active BOOLEAN DEFAULT true,
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE policy_versions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    policy_id UUID NOT NULL REFERENCES policies(id),
    version INTEGER NOT NULL,
    payload JSONB NOT NULL,
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (policy_id, version)
);

CREATE TABLE policy_assignments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID REFERENCES organizations(id),
    policy_id UUID NOT NULL REFERENCES policies(id),
    target_type VARCHAR(20) NOT NULL CHECK (target_type IN ('device', 'device_group', 'org')),
    target_id UUID NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (policy_id, target_type, target_id)
);

CREATE INDEX idx_policy_assignments_target ON policy_assignments (target_type, target_id);
