CREATE TABLE apps (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID REFERENCES organizations(id),
    package_name VARCHAR(500) NOT NULL,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    type VARCHAR(20) DEFAULT 'enterprise' CHECK (type IN ('enterprise', 'public', 'web_clip')),
    icon_url VARCHAR(2048),
    is_managed BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (org_id, package_name)
);

CREATE TABLE app_versions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    app_id UUID NOT NULL REFERENCES apps(id),
    version_code INTEGER NOT NULL,
    version_name VARCHAR(100),
    file_url VARCHAR(2048),
    file_hash VARCHAR(128),
    file_size BIGINT,
    min_sdk INTEGER,
    release_notes TEXT,
    is_current BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (app_id, version_code)
);

CREATE TABLE app_assignments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID REFERENCES organizations(id),
    app_version_id UUID REFERENCES app_versions(id),
    target_type VARCHAR(20) CHECK (target_type IN ('device', 'device_group')),
    target_id UUID NOT NULL,
    install_type VARCHAR(20) DEFAULT 'required' CHECK (install_type IN ('required', 'optional', 'prohibited')),
    created_at TIMESTAMPTZ DEFAULT NOW()
);
