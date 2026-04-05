CREATE TYPE enrollment_status AS ENUM ('pending', 'enrolled', 'unenrolling', 'unenrolled');
CREATE TYPE compliance_state AS ENUM ('compliant', 'non_compliant', 'pending', 'unknown');

CREATE TABLE devices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL REFERENCES organizations(id),
    serial_number VARCHAR(255) NOT NULL,
    hardware_id VARCHAR(255),
    model VARCHAR(255),
    manufacturer VARCHAR(255),
    os_type VARCHAR(20) DEFAULT 'android',
    os_version VARCHAR(50),
    agent_version VARCHAR(50),
    enrollment_status enrollment_status DEFAULT 'pending',
    compliance_state compliance_state DEFAULT 'unknown',
    last_seen_at TIMESTAMPTZ,
    enrolled_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (org_id, serial_number)
);

CREATE TABLE device_properties (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    device_id UUID NOT NULL REFERENCES devices(id),
    key VARCHAR(255) NOT NULL,
    value TEXT,
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (device_id, key)
);

CREATE TABLE device_certificates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    device_id UUID NOT NULL REFERENCES devices(id),
    serial_number VARCHAR(255),
    thumbprint VARCHAR(128),
    issued_at TIMESTAMPTZ,
    expires_at TIMESTAMPTZ,
    revoked_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_devices_org_enrollment ON devices (org_id, enrollment_status);
CREATE INDEX idx_devices_org_compliance ON devices (org_id, compliance_state);
CREATE INDEX idx_devices_org_last_seen ON devices (org_id, last_seen_at);
