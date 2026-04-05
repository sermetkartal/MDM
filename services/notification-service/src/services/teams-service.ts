import { Pool } from 'pg';
import { config } from '../config/index.js';

const pool = new Pool({ connectionString: config.DATABASE_URL });

export interface TeamsIntegration {
  id: string;
  org_id: string;
  name: string;
  webhook_url: string;
  channel_routing: Record<string, string>; // event_type -> webhook_url
  created_at: string;
}

export interface TeamsNotification {
  title: string;
  message: string;
  type: string;
  device_name?: string;
  policy_name?: string;
  action_url?: string;
}

export async function sendTeamsMessage(webhookUrl: string, notification: TeamsNotification): Promise<void> {
  const facts = [
    { title: 'Event Type', value: notification.type },
    ...(notification.device_name ? [{ title: 'Device', value: notification.device_name }] : []),
    ...(notification.policy_name ? [{ title: 'Policy', value: notification.policy_name }] : []),
    { title: 'Time', value: new Date().toLocaleString() },
  ];

  const card = {
    type: 'message',
    attachments: [
      {
        contentType: 'application/vnd.microsoft.card.adaptive',
        contentUrl: null,
        content: {
          $schema: 'http://adaptivecards.io/schemas/adaptive-card.json',
          type: 'AdaptiveCard',
          version: '1.4',
          body: [
            {
              type: 'TextBlock',
              size: 'Medium',
              weight: 'Bolder',
              text: 'MDM Platform',
            },
            {
              type: 'TextBlock',
              size: 'Medium',
              weight: 'Bolder',
              text: notification.title,
              wrap: true,
            },
            {
              type: 'TextBlock',
              text: notification.message,
              wrap: true,
            },
            {
              type: 'FactSet',
              facts,
            },
          ],
          actions: notification.action_url
            ? [
                {
                  type: 'Action.OpenUrl',
                  title: 'View in MDM Console',
                  url: notification.action_url,
                },
              ]
            : [],
        },
      },
    ],
  };

  const response = await fetch(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(card),
    signal: AbortSignal.timeout(10_000),
  });

  if (!response.ok) {
    throw new Error(`Teams webhook failed: HTTP ${response.status}`);
  }
}

export async function getTeamsIntegrations(orgId: string): Promise<TeamsIntegration[]> {
  const result = await pool.query(
    'SELECT * FROM teams_integrations WHERE org_id = $1 ORDER BY created_at DESC',
    [orgId],
  );
  return result.rows;
}

export async function routeTeamsNotification(orgId: string, eventType: string, notification: TeamsNotification): Promise<void> {
  const integrations = await getTeamsIntegrations(orgId);

  for (const integration of integrations) {
    const webhookUrl = integration.channel_routing[eventType] ?? integration.channel_routing['default'] ?? integration.webhook_url;
    if (!webhookUrl) continue;

    try {
      await sendTeamsMessage(webhookUrl, notification);
    } catch {
      // Log but don't fail other deliveries
    }
  }
}
