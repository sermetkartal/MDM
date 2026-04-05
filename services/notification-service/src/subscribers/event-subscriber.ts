import { connect, StringCodec, type NatsConnection } from 'nats';
import { config } from '../config/index.js';
import { sendPush } from '../services/fcm-service.js';
import { sendTemplatedEmail } from '../services/email-service.js';
import { deliverWebhook, type Webhook } from '../services/webhook-service.js';
import { routeSlackNotification } from '../services/slack-service.js';
import { routeTeamsNotification } from '../services/teams-service.js';
import { Pool } from 'pg';

const pool = new Pool({ connectionString: config.DATABASE_URL });
const sc = StringCodec();

let nc: NatsConnection;

export async function startEventSubscriber(logger: { info: (msg: string) => void; error: (msg: string) => void }): Promise<void> {
  nc = await connect({ servers: config.NATS_URL });
  logger.info(`Connected to NATS at ${config.NATS_URL}`);

  const sub = nc.subscribe('mdm.events.>');

  (async () => {
    for await (const msg of sub) {
      try {
        const event = JSON.parse(sc.decode(msg.data));
        await dispatchNotification(event, logger);
      } catch (err) {
        logger.error(`Failed to process event: ${err}`);
      }
    }
  })();
}

interface MDMEvent {
  type: string;
  org_id: string;
  device_id?: string;
  device_name?: string;
  policy_name?: string;
  user_id?: string;
  title: string;
  body: string;
  severity?: string;
  data?: Record<string, string>;
}

const EVENT_TO_TEMPLATE: Record<string, string> = {
  'device.enrolled': 'enrollment-confirmation',
  'compliance.violated': 'compliance-alert',
  'cert.expiring': 'cert-expiry-warning',
};

function mapEventToNotificationType(eventType: string): string {
  if (eventType.startsWith('device.')) return 'device';
  if (eventType.startsWith('compliance.')) return 'compliance';
  if (eventType.startsWith('command.')) return 'command';
  if (eventType.startsWith('cert.')) return 'certificate';
  if (eventType.startsWith('geofence.')) return 'geofence';
  return 'system';
}

async function dispatchNotification(event: MDMEvent, logger: { info: (msg: string) => void; error: (msg: string) => void }): Promise<void> {
  const notificationType = mapEventToNotificationType(event.type);

  // 1. Always store in-app notification
  await pool.query(
    `INSERT INTO notifications (id, org_id, user_id, device_id, type, title, body, data, created_at)
     VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, NOW())`,
    [event.org_id, event.user_id ?? null, event.device_id ?? null, notificationType, event.title, event.body, JSON.stringify(event.data ?? {})],
  );

  // 2. Push notifications to org admins
  const tokenResult = await pool.query(
    'SELECT fcm_token FROM user_push_tokens WHERE org_id = $1 AND fcm_token IS NOT NULL',
    [event.org_id],
  );
  for (const row of tokenResult.rows) {
    try {
      await sendPush({ token: row.fcm_token, title: event.title, body: event.body, data: event.data });
    } catch (err) {
      logger.error(`FCM push failed: ${err}`);
    }
  }

  // 3. Email notifications (if template exists and user preferences allow)
  const emailTemplate = EVENT_TO_TEMPLATE[event.type];
  if (emailTemplate) {
    const adminsResult = await pool.query(
      `SELECT u.email, np.preferences
       FROM users u
       LEFT JOIN notification_preferences np ON np.user_id = u.id
       WHERE u.org_id = $1 AND u.role IN ('super_admin', 'org_admin')`,
      [event.org_id],
    );
    for (const admin of adminsResult.rows) {
      const prefs = admin.preferences ?? { email: { enabled: true, events: [] } };
      const emailEnabled = prefs.email?.enabled !== false;
      const eventAllowed = !prefs.email?.events?.length || prefs.email.events.includes(event.type);

      if (emailEnabled && eventAllowed) {
        try {
          await sendTemplatedEmail(admin.email, emailTemplate, {
            ...event.data,
            device_name: event.device_name,
            policy_name: event.policy_name,
            severity: event.severity,
            console_url: config.PUBLIC_URL,
            device_id: event.device_id,
          });
        } catch (err) {
          logger.error(`Email send failed: ${err}`);
        }
      }
    }
  }

  // 4. Deliver to registered webhooks
  const webhookResult = await pool.query(
    'SELECT * FROM webhooks WHERE org_id = $1 AND enabled = true',
    [event.org_id],
  );
  for (const row of webhookResult.rows) {
    const webhook = row as Webhook;
    webhook.events = typeof webhook.events === 'string' ? JSON.parse(webhook.events) : webhook.events;

    if (webhook.events.includes(event.type) || webhook.events.includes('*')) {
      deliverWebhook(webhook, event.type, event).catch((err) => {
        logger.error(`Webhook delivery failed: ${err}`);
      });
    }
  }

  // 5. Slack notification
  try {
    await routeSlackNotification(event.org_id, event.type, {
      title: event.title,
      message: event.body,
      type: event.type,
      device_name: event.device_name,
      policy_name: event.policy_name,
      url: event.device_id ? `${config.PUBLIC_URL}/devices/${event.device_id}` : undefined,
    });
  } catch (err) {
    logger.error(`Slack notification failed: ${err}`);
  }

  // 6. Teams notification
  try {
    await routeTeamsNotification(event.org_id, event.type, {
      title: event.title,
      message: event.body,
      type: event.type,
      device_name: event.device_name,
      policy_name: event.policy_name,
      action_url: event.device_id ? `${config.PUBLIC_URL}/devices/${event.device_id}` : undefined,
    });
  } catch (err) {
    logger.error(`Teams notification failed: ${err}`);
  }

  logger.info(`Dispatched notification for event ${event.type} in org ${event.org_id}`);
}
