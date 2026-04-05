CREATE TABLE certificates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID REFERENCES organizations(id),
    name VARCHAR(255) NOT NULL,
    type VARCHAR(50) NOT NULL,
    thumbprint VARCHAR(128),
    serial_number VARCHAR(255),
    issuer VARCHAR(500),
    subject VARCHAR(500),
    not_before TIMESTAMPTZ,
    not_after TIMESTAMPTZ,
    file_url VARCHAR(2048),
    created_at TIMESTAMPTZ DEFAULT NOW()
);
