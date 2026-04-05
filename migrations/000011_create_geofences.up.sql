CREATE TABLE geofences (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID REFERENCES organizations(id),
    name VARCHAR(255) NOT NULL,
    type VARCHAR(20) CHECK (type IN ('circle', 'polygon')),
    center_lat DOUBLE PRECISION,
    center_lng DOUBLE PRECISION,
    radius_meters DOUBLE PRECISION,
    polygon JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE geofence_policies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    geofence_id UUID NOT NULL REFERENCES geofences(id),
    trigger_type VARCHAR(20) CHECK (trigger_type IN ('enter', 'exit', 'dwell')),
    action_type VARCHAR(20),
    action_config JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
