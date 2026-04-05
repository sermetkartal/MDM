import { beforeAll, afterAll } from "vitest";

const API_BASE_URL = process.env.API_BASE_URL ?? "http://localhost:3001/api";

let authToken: string = "";

export function getBaseUrl(): string {
  return API_BASE_URL;
}

export function getAuthToken(): string {
  return authToken;
}

export function setAuthToken(token: string): void {
  authToken = token;
}

/** Helper to get authorization headers for authenticated requests. */
export function authHeaders(): Record<string, string> {
  return {
    Authorization: `Bearer ${authToken}`,
    "Content-Type": "application/json",
  };
}

/** Login and store the JWT token for subsequent tests. */
export async function loginAsAdmin(): Promise<string> {
  const res = await fetch(`${API_BASE_URL}/v1/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email: process.env.TEST_ADMIN_EMAIL ?? "admin@example.com",
      password: process.env.TEST_ADMIN_PASSWORD ?? "password123",
    }),
  });

  if (!res.ok) {
    throw new Error(`Login failed: ${res.status} ${await res.text()}`);
  }

  const data = await res.json();
  authToken = data.token ?? data.accessToken ?? data.data?.token;
  return authToken;
}

/** Convenience wrapper for making authenticated API requests. */
export async function apiRequest(
  method: string,
  path: string,
  body?: unknown,
): Promise<Response> {
  const opts: RequestInit = {
    method,
    headers: authHeaders(),
  };
  if (body !== undefined) {
    opts.body = JSON.stringify(body);
  }
  return fetch(`${API_BASE_URL}${path}`, opts);
}

beforeAll(async () => {
  try {
    await loginAsAdmin();
  } catch {
    console.warn("Auto-login failed; tests requiring auth will handle login individually.");
  }
});
