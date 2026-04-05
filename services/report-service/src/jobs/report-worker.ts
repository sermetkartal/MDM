import { Worker, Job } from 'bullmq';
import IORedis from 'ioredis';
import { Pool } from 'pg';
import { createWriteStream } from 'fs';
import { mkdir } from 'fs/promises';
import { join } from 'path';
import { config } from '../config/index.js';
import { generateReport, type ReportParams } from '../services/report-generator.js';
import { exportCsv } from '../services/exporters/csv-exporter.js';
import { exportPdf } from '../services/exporters/pdf-exporter.js';
import { exportExcel } from '../services/exporters/excel-exporter.js';

const pool = new Pool({ connectionString: config.DATABASE_URL });

interface ReportJobData {
  report_id: string;
  template_id: string;
  org_id: string;
  format: 'csv' | 'pdf' | 'xlsx';
  params: ReportParams;
}

async function updateProgress(reportId: string, progress: number): Promise<void> {
  await pool.query('UPDATE reports SET progress = $1 WHERE id = $2', [progress, reportId]);
}

async function processReport(job: Job<ReportJobData>, logger: { info: (msg: string) => void }): Promise<void> {
  const { report_id, template_id, org_id, format, params } = job.data;
  logger.info(`Processing report ${report_id} (${template_id}, ${format})`);

  // Update status to processing
  await pool.query("UPDATE reports SET status = 'processing', progress = 5 WHERE id = $1", [report_id]);
  await job.updateProgress(5);

  // Generate report data
  const data = await generateReport(template_id, org_id, params);
  await updateProgress(report_id, 50);
  await job.updateProgress(50);

  // Export to requested format
  const outputDir = join(config.REPORT_OUTPUT_DIR, org_id);
  await mkdir(outputDir, { recursive: true });

  const extensions: Record<string, string> = { csv: 'csv', pdf: 'pdf', xlsx: 'xlsx' };
  const ext = extensions[format] ?? format;
  const filePath = join(outputDir, `${report_id}.${ext}`);
  const stream = createWriteStream(filePath);

  await updateProgress(report_id, 60);
  await job.updateProgress(60);

  switch (format) {
    case 'csv':
      await exportCsv(data, stream);
      break;
    case 'pdf':
      await exportPdf(data, stream);
      break;
    case 'xlsx':
      await exportExcel(data, stream);
      break;
    default:
      throw new Error(`Unsupported format: ${format}`);
  }

  await updateProgress(report_id, 90);
  await job.updateProgress(90);

  // Update completed status with file URL
  const fileUrl = `/api/v1/reports/${report_id}/download`;
  await pool.query(
    `UPDATE reports SET status = 'completed', progress = 100, file_url = $1,
     file_path = $2, result_data = $3, completed_at = NOW()
     WHERE id = $4`,
    [fileUrl, filePath, JSON.stringify(data), report_id],
  );
  await job.updateProgress(100);

  logger.info(`Report ${report_id} completed`);
}

export async function startReportWorker(logger: { info: (msg: string) => void; error: (msg: string) => void }): Promise<Worker> {
  const redis = new IORedis(config.REDIS_URL, { maxRetriesPerRequest: null });

  const worker = new Worker<ReportJobData>(
    'reports',
    async (job) => {
      try {
        await processReport(job, logger);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        await pool.query(
          "UPDATE reports SET status = 'failed', error = $1 WHERE id = $2",
          [message, job.data.report_id],
        );
        throw err;
      }
    },
    {
      connection: redis,
      concurrency: 3,
      limiter: { max: 10, duration: 60000 },
    },
  );

  worker.on('failed', (job, err) => {
    logger.error(`Report job ${job?.id} failed: ${err.message}`);
  });

  worker.on('completed', (job) => {
    logger.info(`Report job ${job.id} completed`);
  });

  logger.info('Report worker started (concurrency: 3)');
  return worker;
}
