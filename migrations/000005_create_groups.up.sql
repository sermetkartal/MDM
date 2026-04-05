CREATE TABLE device_groups (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID REFERENCES organizations(id),
    name VARCHAR(255) NOT NULL,
    description TEXT,
    type VARCHAR(20) DEFAULT 'static' CHECK (type IN ('static', 'dynamic')),
    rules JSONB,
    parent_id UUID REFERENCES device_groups(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (org_id, name)
);

CREATE TABLE device_group_memberships (
    device_id UUID REFERENCES devices(id),
    group_id UUID REFERENCES device_groups(id),
    PRIMARY KEY (device_id, group_id)
);
