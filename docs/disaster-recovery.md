# Disaster Recovery Runbook

## Recovery Objectives

| Metric | Target |
|--------|--------|
| **RTO** (Recovery Time Objective) | 15 minutes |
| **RPO** (Recovery Point Objective) | 5 minutes |

## Backup Schedule

| System | Frequency | Retention | Location |
|--------|-----------|-----------|----------|
| PostgreSQL | Daily 03:00 UTC | 30 daily + 12 monthly | S3 `mdm-backups/mdm/postgres/` |
| Redis | Every 6 hours | 7 daily | S3 `mdm-backups/mdm/redis/` |
| Vault | Daily 03:30 UTC | 30 daily | S3 `mdm-backups/mdm/vault/` (KMS encrypted) |

## Scenario 1: PostgreSQL Database Failure

### Symptoms
- Services returning 503 on `/readyz`
- `livez` showing `postgres.status: "down"`
- Application logs: `pq: connection refused` or timeout errors

### Recovery Steps

1. **Assess the failure**
   ```bash
   kubectl get pods -l app=postgres -n mdm
   kubectl logs -l app=postgres -n mdm --tail=50
   ```

2. **Attempt restart** (if pod crash)
   ```bash
   kubectl delete pod postgres-0 -n mdm
   # Wait for StatefulSet to recreate
   kubectl wait --for=condition=ready pod/postgres-0 -n mdm --timeout=120s
   ```

3. **Promote read replica** (if primary is unrecoverable)
   ```bash
   # On the replica pod
   kubectl exec -it postgres-replica-0 -n mdm -- pg_ctl promote -D /var/lib/postgresql/data
   # Update service to point to new primary
   kubectl patch svc postgres -n mdm -p '{"spec":{"selector":{"role":"primary"}}}'
   ```

4. **Restore from backup** (if all replicas lost)
   ```bash
   # Download and restore latest backup
   kubectl exec -it postgres-0 -n mdm -- /scripts/pg-restore.sh latest
   # Verify
   kubectl exec -it postgres-0 -n mdm -- /scripts/backup-verify.sh
   ```

5. **Verify services**
   ```bash
   for svc in device-service policy-service command-service; do
     kubectl exec -it deploy/$svc -n mdm -- curl -s localhost:8080/readyz
   done
   ```

### Estimated Recovery Time: 5-10 minutes

## Scenario 2: Redis Failure

### Symptoms
- Command queue processing delays
- WebSocket bridge disconnections
- `livez` showing `redis.status: "down"`

### Recovery Steps

1. **Restart Redis pod**
   ```bash
   kubectl delete pod redis-0 -n mdm
   kubectl wait --for=condition=ready pod/redis-0 -n mdm --timeout=60s
   ```

2. **Restore from backup** (if data lost and persistence needed)
   ```bash
   # Download latest dump
   aws s3 cp s3://mdm-backups/mdm/redis/dump_$(date +%Y-%m-%d).rdb /tmp/dump.rdb
   # Copy to Redis pod
   kubectl cp /tmp/dump.rdb mdm/redis-0:/data/dump.rdb
   # Restart Redis to load dump
   kubectl delete pod redis-0 -n mdm
   ```

3. **Verify circuit breakers reset**
   - Services should automatically reconnect via circuit breaker half-open probes
   - Check logs: `circuit breaker closed` messages confirm recovery

### Estimated Recovery Time: 2-5 minutes

## Scenario 3: NATS Failure

### Symptoms
- Event bus disconnected
- Command dispatch delays
- `livez` showing `nats.status: "down"`

### Recovery Steps

1. **Restart NATS cluster**
   ```bash
   kubectl rollout restart statefulset/nats -n mdm
   kubectl rollout status statefulset/nats -n mdm --timeout=120s
   ```

2. **Verify JetStream**
   ```bash
   kubectl exec -it nats-0 -n mdm -- nats stream ls
   kubectl exec -it nats-0 -n mdm -- nats consumer ls COMMANDS
   ```

3. **Check service reconnection**
   - Services use automatic NATS reconnection
   - Verify via `/livez` endpoint on each service

### Estimated Recovery Time: 2-5 minutes

## Scenario 4: Full Region Outage

### Prerequisites
- Secondary region infrastructure provisioned via Terraform
- Cross-region S3 replication enabled
- DNS failover configured (Route 53 health checks)

### Recovery Steps

1. **Activate secondary region** (estimated: 5 minutes)
   ```bash
   cd infra/terraform/dr-region
   terraform apply -auto-approve
   ```

2. **Restore PostgreSQL from S3** (estimated: 5-10 minutes)
   ```bash
   # S3 backups are replicated cross-region
   kubectl exec -it postgres-0 -n mdm -- /scripts/pg-restore.sh latest
   ```

3. **Switch DNS** (estimated: 1-2 minutes)
   ```bash
   aws route53 change-resource-record-sets \
     --hosted-zone-id $ZONE_ID \
     --change-batch file://failover-dns.json
   ```

4. **Verify all services healthy**
   ```bash
   for svc in device-service policy-service command-service admin-api api-gateway; do
     echo "$svc: $(kubectl exec deploy/$svc -n mdm -- curl -s localhost:8080/readyz)"
   done
   ```

5. **Notify stakeholders** (see Communication Plan below)

### Estimated Recovery Time: 10-15 minutes

## Data Restoration Procedure

Detailed steps for restoring from backup:

1. **Download backup**
   ```bash
   aws s3 cp s3://mdm-backups/mdm/postgres/daily/mdm_backup_YYYY-MM-DD.dump /tmp/restore.dump
   ```

2. **Restore to database**
   ```bash
   pg_restore --dbname=$DATABASE_URL --clean --if-exists --no-owner /tmp/restore.dump
   ```

3. **Verify data integrity**
   ```bash
   /scripts/backup-verify.sh
   ```

4. **Rebuild continuous aggregates** (if needed)
   ```sql
   CALL refresh_continuous_aggregate('device_telemetry_hourly', NOW() - INTERVAL '7 days', NOW());
   CALL refresh_continuous_aggregate('device_telemetry_daily', NOW() - INTERVAL '30 days', NOW());
   ```

5. **Switch traffic back**
   - Update load balancer / DNS to point to restored instance
   - Monitor error rates for 15 minutes

## Communication Plan

### Escalation Path

| Severity | Trigger | Notify | Response Time |
|----------|---------|--------|---------------|
| **P1** - Full outage | All services down, region failure | On-call engineer + Engineering lead + VP Eng | Immediate |
| **P2** - Partial outage | Single critical service down (DB, auth) | On-call engineer + Engineering lead | 5 minutes |
| **P3** - Degraded | Non-critical service down, elevated errors | On-call engineer | 15 minutes |

### Notification Channels

1. **PagerDuty**: Automated alerts from monitoring (Prometheus/Grafana)
2. **Slack #incidents**: Post incident thread with status updates every 15 minutes
3. **Status page**: Update customer-facing status page within 10 minutes of confirmed outage
4. **Email**: Notify affected customers for P1/P2 lasting > 30 minutes

### Post-Incident

- Blameless post-mortem within 48 hours
- Document timeline, root cause, impact, and action items
- Update this runbook with lessons learned

## Testing Schedule

| Test | Frequency | Owner | Procedure |
|------|-----------|-------|-----------|
| Backup restore verification | Weekly (automated) | CronJob `backup-verify` | Restore to temp DB, compare counts |
| Manual restore drill | Monthly | On-call engineer | Full pg-restore to staging, verify app functionality |
| Failover drill | Quarterly | Platform team | Simulate primary DB failure, verify replica promotion |
| Full DR drill | Quarterly | Engineering team | Simulate region outage, activate secondary region |

## Runbook Maintenance

- Review and update this document after every DR drill
- Review after every P1/P2 incident
- Ensure all scripts referenced here are tested and up to date
