import ExcelJS from 'exceljs';
import { Writable } from 'stream';
import type { ReportData } from '../report-generator.js';

const HEADER_FILL: ExcelJS.Fill = {
  type: 'pattern',
  pattern: 'solid',
  fgColor: { argb: 'FF1A365D' },
};

const HEADER_FONT: Partial<ExcelJS.Font> = {
  bold: true,
  color: { argb: 'FFFFFFFF' },
  size: 11,
};

const COMPLIANT_FILL: ExcelJS.Fill = {
  type: 'pattern',
  pattern: 'solid',
  fgColor: { argb: 'FFC6F6D5' },
};

const NON_COMPLIANT_FILL: ExcelJS.Fill = {
  type: 'pattern',
  pattern: 'solid',
  fgColor: { argb: 'FFFED7D7' },
};

export async function exportExcel(report: ReportData, output: Writable): Promise<void> {
  const workbook = new ExcelJS.stream.xlsx.WorkbookWriter({
    stream: output,
    useStyles: true,
  });

  // Summary sheet
  const summarySheet = workbook.addWorksheet('Summary');
  summarySheet.columns = [
    { header: 'Metric', key: 'metric', width: 30 },
    { header: 'Value', key: 'value', width: 30 },
  ];

  // Style summary header
  const summaryHeaderRow = summarySheet.getRow(1);
  summaryHeaderRow.font = HEADER_FONT;
  summaryHeaderRow.fill = HEADER_FILL;
  summaryHeaderRow.commit();

  const summaryEntries = Object.entries(report.summary).filter(
    ([, v]) => typeof v === 'string' || typeof v === 'number',
  );

  for (const [key, value] of summaryEntries) {
    const label = key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
    const row = summarySheet.addRow({ metric: label, value: String(value) });
    row.commit();
  }

  summarySheet.addRow({ metric: '', value: '' }).commit();
  summarySheet.addRow({ metric: 'Report', value: report.title }).commit();
  summarySheet.addRow({ metric: 'Generated', value: new Date(report.generated_at).toLocaleString() }).commit();
  summarySheet.commit();

  // Data sheet
  const dataSheet = workbook.addWorksheet('Data');

  // Set columns with auto-width estimation
  dataSheet.columns = report.columns.map(col => ({
    header: col.label,
    key: col.key,
    width: Math.max(col.label.length + 4, 15),
  }));

  // Style header row
  const headerRow = dataSheet.getRow(1);
  headerRow.font = HEADER_FONT;
  headerRow.fill = HEADER_FILL;
  headerRow.alignment = { vertical: 'middle', horizontal: 'center' };
  headerRow.commit();

  // Find compliance column index for conditional formatting
  const complianceColIdx = report.columns.findIndex(
    c => c.key === 'compliance_state' || c.key === 'compliance' || c.label.toLowerCase().includes('compliance'),
  );

  // Data rows
  for (const row of report.rows) {
    const rowData: Record<string, unknown> = {};
    report.columns.forEach((col, i) => {
      rowData[col.key] = row[i];
    });
    const excelRow = dataSheet.addRow(rowData);

    // Conditional formatting for compliance column
    if (complianceColIdx >= 0) {
      const cellValue = String(row[complianceColIdx] ?? '').toUpperCase();
      const cell = excelRow.getCell(complianceColIdx + 1);
      if (cellValue === 'COMPLIANT') {
        cell.fill = COMPLIANT_FILL;
      } else if (cellValue === 'NON_COMPLIANT') {
        cell.fill = NON_COMPLIANT_FILL;
      }
    }

    excelRow.commit();
  }

  dataSheet.commit();
  await workbook.commit();
}

export function getExcelContentType(): string {
  return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
}

export function getExcelExtension(): string {
  return 'xlsx';
}
