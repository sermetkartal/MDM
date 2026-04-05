import PDFDocument from 'pdfkit';
import { Writable } from 'stream';
import type { ReportData } from '../report-generator.js';

const MARGIN = 50;
const PAGE_WIDTH = 595.28; // A4
const PAGE_HEIGHT = 841.89;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;
const ROW_HEIGHT = 20;
const HEADER_BG = '#1a365d';
const HEADER_TEXT = '#ffffff';
const ALT_ROW_BG = '#f7fafc';
const FONT_SIZE = 8;
const HEADER_FONT_SIZE = 9;

export async function exportPdf(report: ReportData, output: Writable): Promise<void> {
  const doc = new PDFDocument({
    size: 'A4',
    margins: { top: MARGIN, bottom: MARGIN, left: MARGIN, right: MARGIN },
    bufferPages: true,
  });

  doc.pipe(output);

  // Title header
  doc.fontSize(18).font('Helvetica-Bold').text(report.title, MARGIN, MARGIN);
  doc.fontSize(10).font('Helvetica')
    .fillColor('#666666')
    .text(`Generated: ${new Date(report.generated_at).toLocaleString()}`, MARGIN, MARGIN + 25);

  // Summary section
  let yPos = MARGIN + 55;
  const summaryEntries = Object.entries(report.summary).filter(
    ([, v]) => typeof v === 'string' || typeof v === 'number',
  );

  if (summaryEntries.length > 0) {
    doc.fontSize(12).font('Helvetica-Bold').fillColor('#000000')
      .text('Summary', MARGIN, yPos);
    yPos += 20;

    for (const [key, value] of summaryEntries) {
      const label = key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
      doc.fontSize(9).font('Helvetica-Bold').fillColor('#333333')
        .text(`${label}: `, MARGIN, yPos, { continued: true });
      doc.font('Helvetica').text(String(value));
      yPos += 15;
    }
    yPos += 10;
  }

  // Data table
  const colCount = report.columns.length;
  const colWidth = CONTENT_WIDTH / colCount;

  function drawTableHeader(y: number): number {
    // Header background
    doc.rect(MARGIN, y, CONTENT_WIDTH, ROW_HEIGHT + 4).fill(HEADER_BG);

    // Header text
    doc.fontSize(HEADER_FONT_SIZE).font('Helvetica-Bold').fillColor(HEADER_TEXT);
    for (let i = 0; i < colCount; i++) {
      doc.text(
        report.columns[i].label,
        MARGIN + i * colWidth + 4,
        y + 5,
        { width: colWidth - 8, ellipsis: true },
      );
    }
    return y + ROW_HEIGHT + 4;
  }

  yPos = drawTableHeader(yPos);

  for (let rowIdx = 0; rowIdx < report.rows.length; rowIdx++) {
    // Check for page break
    if (yPos + ROW_HEIGHT > PAGE_HEIGHT - MARGIN - 20) {
      doc.addPage();
      yPos = MARGIN;
      yPos = drawTableHeader(yPos);
    }

    // Alternating row color
    if (rowIdx % 2 === 1) {
      doc.rect(MARGIN, yPos, CONTENT_WIDTH, ROW_HEIGHT).fill(ALT_ROW_BG);
    }

    // Row data
    doc.fontSize(FONT_SIZE).font('Helvetica').fillColor('#000000');
    const row = report.rows[rowIdx];
    for (let i = 0; i < colCount; i++) {
      const cellValue = row[i] !== null && row[i] !== undefined ? String(row[i]) : '';
      doc.text(
        cellValue,
        MARGIN + i * colWidth + 4,
        yPos + 5,
        { width: colWidth - 8, ellipsis: true },
      );
    }

    yPos += ROW_HEIGHT;
  }

  // Page numbers
  const pageCount = doc.bufferedPageRange().count;
  for (let i = 0; i < pageCount; i++) {
    doc.switchToPage(i);
    doc.fontSize(8).font('Helvetica').fillColor('#999999')
      .text(
        `Page ${i + 1} of ${pageCount}`,
        MARGIN,
        PAGE_HEIGHT - MARGIN + 5,
        { align: 'center', width: CONTENT_WIDTH },
      );
  }

  doc.end();

  return new Promise((resolve, reject) => {
    output.on('finish', resolve);
    output.on('error', reject);
  });
}

export function getPdfContentType(): string {
  return 'application/pdf';
}

export function getPdfExtension(): string {
  return 'pdf';
}
