import nodemailer from 'nodemailer';
import { config } from '../config/index.js';

const transporter = nodemailer.createTransport({
  host: config.SMTP_HOST,
  port: config.SMTP_PORT,
  secure: config.SMTP_PORT === 465,
  ...(config.SMTP_USER && {
    auth: {
      user: config.SMTP_USER,
      pass: config.SMTP_PASS,
    },
  }),
});

export interface EmailPayload {
  to: string;
  subject: string;
  text?: string;
  html?: string;
}

export async function sendEmail(payload: EmailPayload): Promise<void> {
  await transporter.sendMail({
    from: config.SMTP_FROM,
    to: payload.to,
    subject: payload.subject,
    text: payload.text,
    html: payload.html,
  });
}

type TemplateData = Record<string, string | number | undefined>;

const templates: Record<string, (data: TemplateData) => { subject: string; html: string }> = {
  'enrollment-confirmation': (data) => ({
    subject: `Device Enrolled: ${data.device_name}`,
    html: `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background: #1a1a2e; color: white; padding: 24px; border-radius: 8px 8px 0 0;">
          <h1 style="margin: 0; font-size: 20px;">MDM Platform</h1>
        </div>
        <div style="padding: 24px; border: 1px solid #e5e7eb; border-top: 0; border-radius: 0 0 8px 8px;">
          <h2 style="margin-top: 0;">Device Successfully Enrolled</h2>
          <p>A new device has been enrolled in your organization.</p>
          <table style="width: 100%; border-collapse: collapse; margin: 16px 0;">
            <tr><td style="padding: 8px; border-bottom: 1px solid #e5e7eb; font-weight: bold;">Device Name</td><td style="padding: 8px; border-bottom: 1px solid #e5e7eb;">${data.device_name ?? 'Unknown'}</td></tr>
            <tr><td style="padding: 8px; border-bottom: 1px solid #e5e7eb; font-weight: bold;">Platform</td><td style="padding: 8px; border-bottom: 1px solid #e5e7eb;">${data.platform ?? 'N/A'}</td></tr>
            <tr><td style="padding: 8px; border-bottom: 1px solid #e5e7eb; font-weight: bold;">Serial Number</td><td style="padding: 8px; border-bottom: 1px solid #e5e7eb;">${data.serial_number ?? 'N/A'}</td></tr>
          </table>
          <h3>Getting Started</h3>
          <ol>
            <li>The device will automatically receive its assigned policies</li>
            <li>Required applications will be installed shortly</li>
            <li>Compliance checks will begin within 15 minutes</li>
          </ol>
          <a href="${data.console_url ?? '#'}/devices/${data.device_id ?? ''}" style="display: inline-block; background: #3b82f6; color: white; padding: 10px 20px; border-radius: 6px; text-decoration: none;">View Device</a>
        </div>
      </div>`,
  }),

  'compliance-alert': (data) => ({
    subject: `Compliance Violation: ${data.policy_name} - ${data.severity ?? 'Medium'}`,
    html: `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background: #dc2626; color: white; padding: 24px; border-radius: 8px 8px 0 0;">
          <h1 style="margin: 0; font-size: 20px;">MDM Platform - Compliance Alert</h1>
        </div>
        <div style="padding: 24px; border: 1px solid #e5e7eb; border-top: 0; border-radius: 0 0 8px 8px;">
          <div style="display: inline-block; padding: 4px 12px; border-radius: 9999px; font-size: 12px; font-weight: bold; color: white; background: ${data.severity === 'critical' ? '#dc2626' : data.severity === 'high' ? '#ea580c' : '#eab308'};">${(data.severity as string ?? 'medium').toUpperCase()}</div>
          <h2>${data.violation_title ?? 'Policy Violation Detected'}</h2>
          <p>${data.violation_message ?? 'A device in your organization is not compliant.'}</p>
          <table style="width: 100%; border-collapse: collapse; margin: 16px 0;">
            <tr><td style="padding: 8px; border-bottom: 1px solid #e5e7eb; font-weight: bold;">Device</td><td style="padding: 8px; border-bottom: 1px solid #e5e7eb;">${data.device_name ?? 'Unknown'}</td></tr>
            <tr><td style="padding: 8px; border-bottom: 1px solid #e5e7eb; font-weight: bold;">Policy</td><td style="padding: 8px; border-bottom: 1px solid #e5e7eb;">${data.policy_name ?? 'N/A'}</td></tr>
          </table>
          <h3>Remediation Steps</h3>
          <p>${data.remediation ?? 'Please review the device compliance status and take corrective action.'}</p>
          <a href="${data.console_url ?? '#'}/devices/${data.device_id ?? ''}" style="display: inline-block; background: #dc2626; color: white; padding: 10px 20px; border-radius: 6px; text-decoration: none;">Review Violation</a>
        </div>
      </div>`,
  }),

  'cert-expiry-warning': (data) => ({
    subject: `Certificate Expiring: ${data.cert_name} (${data.days_remaining} days)`,
    html: `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background: #f59e0b; color: white; padding: 24px; border-radius: 8px 8px 0 0;">
          <h1 style="margin: 0; font-size: 20px;">MDM Platform - Certificate Warning</h1>
        </div>
        <div style="padding: 24px; border: 1px solid #e5e7eb; border-top: 0; border-radius: 0 0 8px 8px;">
          <h2>Certificate Expiry Warning</h2>
          <p>A certificate in your organization will expire soon.</p>
          <table style="width: 100%; border-collapse: collapse; margin: 16px 0;">
            <tr><td style="padding: 8px; border-bottom: 1px solid #e5e7eb; font-weight: bold;">Certificate</td><td style="padding: 8px; border-bottom: 1px solid #e5e7eb;">${data.cert_name ?? 'Unknown'}</td></tr>
            <tr><td style="padding: 8px; border-bottom: 1px solid #e5e7eb; font-weight: bold;">Expires</td><td style="padding: 8px; border-bottom: 1px solid #e5e7eb;">${data.expiry_date ?? 'N/A'}</td></tr>
            <tr><td style="padding: 8px; border-bottom: 1px solid #e5e7eb; font-weight: bold;">Days Remaining</td><td style="padding: 8px; border-bottom: 1px solid #e5e7eb; color: ${Number(data.days_remaining) <= 7 ? '#dc2626' : '#f59e0b'}; font-weight: bold;">${data.days_remaining ?? '?'}</td></tr>
          </table>
          <a href="${data.console_url ?? '#'}/settings/certificates" style="display: inline-block; background: #f59e0b; color: white; padding: 10px 20px; border-radius: 6px; text-decoration: none;">Renew Certificate</a>
        </div>
      </div>`,
  }),

  'weekly-digest': (data) => ({
    subject: 'MDM Weekly Digest',
    html: `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background: #1a1a2e; color: white; padding: 24px; border-radius: 8px 8px 0 0;">
          <h1 style="margin: 0; font-size: 20px;">MDM Platform - Weekly Digest</h1>
        </div>
        <div style="padding: 24px; border: 1px solid #e5e7eb; border-top: 0; border-radius: 0 0 8px 8px;">
          <h2>Weekly Summary</h2>
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin: 16px 0;">
            <div style="padding: 16px; background: #f3f4f6; border-radius: 8px; text-align: center;">
              <div style="font-size: 24px; font-weight: bold;">${data.total_devices ?? 0}</div>
              <div style="font-size: 12px; color: #6b7280;">Total Devices</div>
            </div>
            <div style="padding: 16px; background: #f3f4f6; border-radius: 8px; text-align: center;">
              <div style="font-size: 24px; font-weight: bold;">${data.new_enrollments ?? 0}</div>
              <div style="font-size: 12px; color: #6b7280;">New Enrollments</div>
            </div>
            <div style="padding: 16px; background: #fef2f2; border-radius: 8px; text-align: center;">
              <div style="font-size: 24px; font-weight: bold; color: #dc2626;">${data.violations ?? 0}</div>
              <div style="font-size: 12px; color: #6b7280;">Violations</div>
            </div>
            <div style="padding: 16px; background: #f0fdf4; border-radius: 8px; text-align: center;">
              <div style="font-size: 24px; font-weight: bold; color: #16a34a;">${data.compliance_rate ?? 0}%</div>
              <div style="font-size: 12px; color: #6b7280;">Compliance Rate</div>
            </div>
          </div>
          <a href="${data.console_url ?? '#'}/reports" style="display: inline-block; background: #3b82f6; color: white; padding: 10px 20px; border-radius: 6px; text-decoration: none;">View Full Report</a>
        </div>
      </div>`,
  }),
};

export async function sendTemplatedEmail(to: string, template: string, data: TemplateData): Promise<void> {
  const templateFn = templates[template];
  if (!templateFn) throw new Error(`Unknown email template: ${template}`);

  const { subject, html } = templateFn(data);
  await sendEmail({ to, subject, html });
}
