CREATE TABLE audit_logs (
    id UUID DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL,
    actor_type VARCHAR(20) CHECK (actor_type IN ('user', 'system', 'device', 'api_key')),
    actor_id UUID,
    action VARCHAR(255) NOT NULL,
    resource_type VARCHAR(100),
    resource_id UUID,
    detail JSONB,
    ip_address INET,
    user_agent VARCHAR(500),
    occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
) PARTITION BY RANGE (occurred_at);

-- Create initial partitions for current and next month
CREATE TABLE audit_logs_y2026m04 PARTITION OF audit_logs
    FOR VALUES FROM ('2026-04-01') TO ('2026-05-01');

CREATE TABLE audit_logs_y2026m05 PARTITION OF audit_logs
    FOR VALUES FROM ('2026-05-01') TO ('2026-06-01');

CREATE INDEX idx_audit_logs_org_occurred ON audit_logs (org_id, occurred_at);
CREATE INDEX idx_audit_logs_org_action ON audit_logs (org_id, action);
CREATE INDEX idx_audit_logs_resource ON audit_logs (resource_type, resource_id);

COMMENT ON TABLE audit_logs IS 'No UPDATE or DELETE permitted (enforce via application layer or trigger)';
