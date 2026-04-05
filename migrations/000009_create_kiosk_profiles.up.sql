CREATE TYPE kiosk_mode AS ENUM ('single_app', 'multi_app', 'digital_signage', 'web_kiosk');

CREATE TABLE kiosk_profiles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID REFERENCES organizations(id),
    name VARCHAR(255) NOT NULL,
    mode kiosk_mode NOT NULL,
    config JSONB NOT NULL,
    wallpaper_url VARCHAR(2048),
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE kiosk_profile_assignments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    kiosk_profile_id UUID NOT NULL REFERENCES kiosk_profiles(id),
    target_type VARCHAR(20),
    target_id UUID NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (kiosk_profile_id, target_type, target_id)
);
