import admin from 'firebase-admin';
import { config } from '../config/index.js';

let initialized = false;

function ensureInitialized() {
  if (initialized) return;
  if (config.FCM_SERVICE_ACCOUNT_PATH) {
    admin.initializeApp({
      credential: admin.credential.cert(config.FCM_SERVICE_ACCOUNT_PATH),
      projectId: config.FCM_PROJECT_ID,
    });
    initialized = true;
  }
}

export interface PushPayload {
  token: string;
  title: string;
  body: string;
  data?: Record<string, string>;
}

export async function sendPush(payload: PushPayload): Promise<string | null> {
  ensureInitialized();
  if (!initialized) return null;

  const response = await admin.messaging().send({
    token: payload.token,
    notification: {
      title: payload.title,
      body: payload.body,
    },
    data: payload.data,
  });
  return response;
}

export async function sendMulticast(tokens: string[], title: string, body: string, data?: Record<string, string>): Promise<{ success: number; failure: number }> {
  ensureInitialized();
  if (!initialized) return { success: 0, failure: tokens.length };

  const response = await admin.messaging().sendEachForMulticast({
    tokens,
    notification: { title, body },
    data,
  });
  return { success: response.successCount, failure: response.failureCount };
}
