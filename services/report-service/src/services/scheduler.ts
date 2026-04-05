import { Queue } from 'bullmq';
import IORedis from 'ioredis';
import { Pool } from 'pg';
import { config } from '../config/index.js';

const pool = new Pool({ connectionString: config.DATABASE_URL });

interface ScheduleRecord {
  id: string;
  org_id: string;
  name: string;
  template_id: string;
  params: string | Record<string, unknown>;
  format: string;
  cron_expression: string;
  recipients: string | string[];
  is_active: boolean;
}

function parseJson<T>(val: string | T): T {
  return typeof val === 'string' ? JSON.parse(val) : val;
}

export class ReportScheduler {
  private queue: Queue;
  private logger: { info: (msg: string) => void; error: (msg: string) => void };

  constructor(logger: { info: (msg: string) => void; error: (msg: string) => void }) {
    const redis = new IORedis(config.REDIS_URL, { maxRetriesPerRequest: null });
    this.queue = new Queue('reports', { connection: redis });
    this.logger = logger;
  }

  async loadSchedules(): Promise<void> {
    const result = await pool.query(
      'SELECT * FROM report_schedules WHERE is_active = true',
    );

    this.logger.info(`Loading ${result.rows.length} active report schedules`);

    for (const schedule of result.rows) {
      await this.registerSchedule(schedule);
    }
  }

  async registerSchedule(schedule: ScheduleRecord): Promise<void> {
    const repeatJobKey = `schedule:${schedule.id}`;
    const params = parseJson(schedule.params);
    const recipients = parseJson<string[]>(schedule.recipients);

    await this.queue.add(
      'scheduled-report',
      {
        schedule_id: schedule.id,
        template_id: schedule.template_id,
        org_id: schedule.org_id,
        format: schedule.format,
        params,
        recipients,
      },
      {
        repeat: {
          pattern: schedule.cron_expression,
          key: repeatJobKey,
        },
        jobId: repeatJobKey,
        attempts: 3,
        backoff: { type: 'exponential', delay: 5000 },
      },
    );

    this.logger.info(`Registered schedule ${schedule.id} (${schedule.name}) with cron: ${schedule.cron_expression}`);
  }

  async updateSchedule(schedule: ScheduleRecord): Promise<void> {
    await this.removeSchedule(schedule.id);
    if (schedule.is_active) {
      await this.registerSchedule(schedule);
    }
  }

  async removeSchedule(scheduleId: string): Promise<void> {
    const repeatJobKey = `schedule:${scheduleId}`;
    try {
      await this.queue.removeRepeatableByKey(repeatJobKey);
      this.logger.info(`Removed schedule ${scheduleId}`);
    } catch {
      // Schedule may not exist, ignore
    }
  }

  async triggerNow(schedule: ScheduleRecord): Promise<string> {
    const params = parseJson(schedule.params);
    const recipients = parseJson<string[]>(schedule.recipients);

    // Create a report record
    const result = await pool.query(
      `INSERT INTO reports (id, template_id, org_id, format, filters, status, progress, created_at, schedule_id)
       VALUES (gen_random_uuid(), $1, $2, $3, $4, 'queued', 0, NOW(), $5) RETURNING id`,
      [schedule.template_id, schedule.org_id, schedule.format, JSON.stringify(params), schedule.id],
    );

    const reportId = result.rows[0].id;

    await this.queue.add('generate', {
      report_id: reportId,
      template_id: schedule.template_id,
      org_id: schedule.org_id,
      format: schedule.format,
      params,
      recipients,
      schedule_id: schedule.id,
    }, {
      jobId: reportId,
      attempts: 3,
      backoff: { type: 'exponential', delay: 5000 },
    });

    // Update last_run and next_run
    await pool.query(
      `UPDATE report_schedules SET last_run_at = NOW(), updated_at = NOW() WHERE id = $1`,
      [schedule.id],
    );

    return reportId;
  }
}

let schedulerInstance: ReportScheduler | null = null;

export function initScheduler(logger: { info: (msg: string) => void; error: (msg: string) => void }): ReportScheduler {
  schedulerInstance = new ReportScheduler(logger);
  return schedulerInstance;
}

export function getScheduler(): ReportScheduler {
  if (!schedulerInstance) throw new Error('Scheduler not initialized');
  return schedulerInstance;
}
