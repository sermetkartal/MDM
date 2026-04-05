import { Writable } from 'stream';
import type { ReportData } from '../report-generator.js';

function escapeCsvField(value: unknown): string {
  if (value === null || value === undefined) return '';
  const str = String(value);
  if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
    return '"' + str.replace(/"/g, '""') + '"';
  }
  return str;
}

export async function exportCsv(report: ReportData, output: Writable): Promise<void> {
  // BOM for Excel compatibility
  output.write('\uFEFF');

  // Header row
  const headers = report.columns.map(c => escapeCsvField(c.label));
  output.write(headers.join(',') + '\r\n');

  // Data rows
  for (const row of report.rows) {
    const line = row.map(cell => escapeCsvField(cell));
    output.write(line.join(',') + '\r\n');
  }

  output.end();

  return new Promise((resolve, reject) => {
    output.on('finish', resolve);
    output.on('error', reject);
  });
}

export function getCsvContentType(): string {
  return 'text/csv; charset=utf-8';
}

export function getCsvExtension(): string {
  return 'csv';
}
