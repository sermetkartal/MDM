import { Pool } from 'pg';
import { config } from '../config/index.js';

const pool = new Pool({ connectionString: config.DATABASE_URL });

export interface SlackIntegration {
  id: string;
  org_id: string;
  team_id: string;
  team_name: string;
  bot_token: string;
  channel_routing: Record<string, string>; // event_type -> channel_id
  installed_at: string;
}

export interface SlackNotification {
  title: string;
  message: string;
  type: string;
  device_name?: string;
  policy_name?: string;
  url?: string;
}

export function getSlackInstallUrl(orgId: string): string {
  const state = Buffer.from(JSON.stringify({ org_id: orgId })).toString('base64url');
  const params = new URLSearchParams({
    client_id: config.SLACK_CLIENT_ID ?? '',
    scope: 'chat:write,channels:read',
    redirect_uri: `${config.PUBLIC_URL}/api/v1/integrations/slack/callback`,
    state,
  });
  return `https://slack.com/oauth/v2/authorize?${params.toString()}`;
}

export async function handleSlackCallback(code: string, state: string): Promise<SlackIntegration> {
  const { org_id } = JSON.parse(Buffer.from(state, 'base64url').toString());

  const tokenResponse = await fetch('https://slack.com/api/oauth.v2.access', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: config.SLACK_CLIENT_ID ?? '',
      client_secret: config.SLACK_CLIENT_SECRET ?? '',
      code,
      redirect_uri: `${config.PUBLIC_URL}/api/v1/integrations/slack/callback`,
    }),
  });

  const data = await tokenResponse.json() as {
    ok: boolean;
    access_token: string;
    team: { id: string; name: string };
    error?: string;
  };

  if (!data.ok) {
    throw new Error(`Slack OAuth error: ${data.error}`);
  }

  const id = crypto.randomUUID();
  await pool.query(
    `INSERT INTO slack_integrations (id, org_id, team_id, team_name, bot_token, channel_routing, installed_at)
     VALUES ($1, $2, $3, $4, $5, '{}', NOW())
     ON CONFLICT (org_id) DO UPDATE SET team_id = $3, team_name = $4, bot_token = $5, installed_at = NOW()`,
    [id, org_id, data.team.id, data.team.name, data.access_token],
  );

  return {
    id,
    org_id,
    team_id: data.team.id,
    team_name: data.team.name,
    bot_token: data.access_token,
    channel_routing: {},
    installed_at: new Date().toISOString(),
  };
}

export async function sendSlackMessage(integration: SlackIntegration, channel: string, notification: SlackNotification): Promise<void> {
  const blocks = [
    {
      type: 'header',
      text: { type: 'plain_text', text: 'MDM Platform', emoji: true },
    },
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*${notification.title}*\n${notification.message}`,
      },
    },
    {
      type: 'context',
      elements: [
        {
          type: 'mrkdwn',
          text: [
            `*Type:* ${notification.type}`,
            notification.device_name ? `*Device:* ${notification.device_name}` : null,
            notification.policy_name ? `*Policy:* ${notification.policy_name}` : null,
            `*Time:* <!date^${Math.floor(Date.now() / 1000)}^{date_short_pretty} at {time}|${new Date().toISOString()}>`,
          ].filter(Boolean).join(' | '),
        },
      ],
    },
    ...(notification.url
      ? [{
          type: 'actions',
          elements: [
            {
              type: 'button',
              text: { type: 'plain_text', text: 'View Details' },
              url: notification.url,
              action_id: 'view_details',
            },
            {
              type: 'button',
              text: { type: 'plain_text', text: 'Acknowledge' },
              action_id: 'acknowledge',
              value: JSON.stringify({ type: notification.type }),
            },
          ],
        }]
      : []),
  ];

  const response = await fetch('https://slack.com/api/chat.postMessage', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${integration.bot_token}`,
    },
    body: JSON.stringify({ channel, blocks, text: notification.title }),
  });

  const result = await response.json() as { ok: boolean; error?: string };
  if (!result.ok) {
    throw new Error(`Slack API error: ${result.error}`);
  }
}

export async function handleSlackAction(payload: {
  actions: Array<{ action_id: string; value?: string }>;
  user: { id: string; name: string };
  message: { ts: string };
  channel: { id: string };
}): Promise<{ text: string }> {
  const action = payload.actions[0];
  if (action.action_id === 'acknowledge') {
    return { text: `Acknowledged by ${payload.user.name}` };
  }
  return { text: 'Action processed' };
}

export async function getSlackIntegration(orgId: string): Promise<SlackIntegration | null> {
  const result = await pool.query(
    'SELECT * FROM slack_integrations WHERE org_id = $1',
    [orgId],
  );
  return result.rows[0] ?? null;
}

export async function routeSlackNotification(orgId: string, eventType: string, notification: SlackNotification): Promise<void> {
  const integration = await getSlackIntegration(orgId);
  if (!integration) return;

  const channel = integration.channel_routing[eventType] ?? integration.channel_routing['default'];
  if (!channel) return;

  await sendSlackMessage(integration, channel, notification);
}
