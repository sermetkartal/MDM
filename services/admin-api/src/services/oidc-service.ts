import crypto from 'node:crypto';
import { eq, and } from 'drizzle-orm';
import { db } from '../db/index.js';
import { organizations, users, roles } from '../db/schema.js';

export interface OidcConfig {
  provider: 'okta' | 'azure_ad' | 'google' | 'custom';
  issuerUrl: string;
  clientId: string;
  clientSecret: string;
  scopes?: string[];
  attributeMapping?: {
    email?: string;
    firstName?: string;
    lastName?: string;
  };
}

interface OidcDiscovery {
  authorization_endpoint: string;
  token_endpoint: string;
  userinfo_endpoint: string;
  jwks_uri: string;
  issuer: string;
}

interface OidcTokenResponse {
  access_token: string;
  id_token: string;
  token_type: string;
  expires_in: number;
  refresh_token?: string;
}

export class OidcService {
  private discoveryCache = new Map<string, { data: OidcDiscovery; expiresAt: number }>();
  private readonly callbackUrl: string;

  constructor(baseUrl: string) {
    this.callbackUrl = `${baseUrl}/api/v1/auth/oidc/callback`;
  }

  async discover(issuerUrl: string): Promise<OidcDiscovery> {
    const cached = this.discoveryCache.get(issuerUrl);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.data;
    }

    const wellKnown = issuerUrl.replace(/\/+$/, '') + '/.well-known/openid-configuration';
    const response = await fetch(wellKnown);
    if (!response.ok) {
      throw Object.assign(new Error(`OIDC discovery failed: ${response.statusText}`), { statusCode: 502 });
    }

    const data = (await response.json()) as OidcDiscovery;
    this.discoveryCache.set(issuerUrl, { data, expiresAt: Date.now() + 3600_000 });
    return data;
  }

  generatePkce(): { codeVerifier: string; codeChallenge: string } {
    const codeVerifier = crypto.randomBytes(32).toString('base64url');
    const codeChallenge = crypto
      .createHash('sha256')
      .update(codeVerifier)
      .digest('base64url');
    return { codeVerifier, codeChallenge };
  }

  async buildAuthorizationUrl(
    oidcConfig: OidcConfig,
    state: string,
    pkce: { codeChallenge: string },
  ): Promise<string> {
    const discovery = await this.discover(oidcConfig.issuerUrl);
    const scopes = oidcConfig.scopes ?? ['openid', 'profile', 'email'];

    const params = new URLSearchParams({
      response_type: 'code',
      client_id: oidcConfig.clientId,
      redirect_uri: this.callbackUrl,
      scope: scopes.join(' '),
      state,
      code_challenge: pkce.codeChallenge,
      code_challenge_method: 'S256',
    });

    return `${discovery.authorization_endpoint}?${params.toString()}`;
  }

  async exchangeCode(
    oidcConfig: OidcConfig,
    code: string,
    codeVerifier: string,
  ): Promise<OidcTokenResponse> {
    const discovery = await this.discover(oidcConfig.issuerUrl);

    const body = new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: this.callbackUrl,
      client_id: oidcConfig.clientId,
      client_secret: oidcConfig.clientSecret,
      code_verifier: codeVerifier,
    });

    const response = await fetch(discovery.token_endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    });

    if (!response.ok) {
      const error = await response.text();
      throw Object.assign(new Error(`Token exchange failed: ${error}`), { statusCode: 502 });
    }

    return response.json() as Promise<OidcTokenResponse>;
  }

  async getUserInfo(
    oidcConfig: OidcConfig,
    accessToken: string,
  ): Promise<Record<string, unknown>> {
    const discovery = await this.discover(oidcConfig.issuerUrl);

    const response = await fetch(discovery.userinfo_endpoint, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!response.ok) {
      throw Object.assign(new Error('Failed to fetch user info'), { statusCode: 502 });
    }

    return response.json() as Promise<Record<string, unknown>>;
  }

  decodeIdToken(idToken: string): Record<string, unknown> {
    const parts = idToken.split('.');
    if (parts.length !== 3) throw new Error('Invalid ID token format');
    const payload = Buffer.from(parts[1], 'base64url').toString('utf-8');
    return JSON.parse(payload);
  }

  async findOrCreateUser(
    orgId: string,
    userInfo: Record<string, unknown>,
    attributeMapping?: OidcConfig['attributeMapping'],
  ): Promise<{ id: string; email: string; orgId: string; roleId: string }> {
    const email = (userInfo[attributeMapping?.email ?? 'email'] as string) ?? (userInfo.email as string);
    const firstName = (userInfo[attributeMapping?.firstName ?? 'given_name'] as string) ?? null;
    const lastName = (userInfo[attributeMapping?.lastName ?? 'family_name'] as string) ?? null;

    if (!email) {
      throw Object.assign(new Error('Email not found in OIDC user info'), { statusCode: 400 });
    }

    const [existing] = await db
      .select({ id: users.id, email: users.email, orgId: users.orgId, roleId: users.roleId })
      .from(users)
      .where(and(eq(users.email, email), eq(users.orgId, orgId)))
      .limit(1);

    if (existing) {
      await db
        .update(users)
        .set({ firstName, lastName, lastLoginAt: new Date(), updatedAt: new Date() })
        .where(eq(users.id, existing.id));
      return existing;
    }

    const [viewerRole] = await db
      .select({ id: roles.id })
      .from(roles)
      .where(and(eq(roles.orgId, orgId), eq(roles.name, 'viewer'), eq(roles.isSystem, true)))
      .limit(1);

    if (!viewerRole) {
      throw new Error('Default viewer role not found for organization');
    }

    const ssoPlaceholder = `sso$${crypto.randomBytes(16).toString('hex')}$disabled`;

    const [newUser] = await db
      .insert(users)
      .values({
        orgId,
        roleId: viewerRole.id,
        email,
        passwordHash: ssoPlaceholder,
        firstName,
        lastName,
        isActive: true,
        lastLoginAt: new Date(),
      })
      .returning({ id: users.id, email: users.email, orgId: users.orgId, roleId: users.roleId });

    return newUser;
  }

  async getOrgConfig(orgSlug: string): Promise<{ orgId: string; oidcConfig: OidcConfig } | null> {
    const [org] = await db
      .select({ id: organizations.id, settings: organizations.settings })
      .from(organizations)
      .where(eq(organizations.slug, orgSlug))
      .limit(1);

    if (!org) return null;

    const settings = org.settings as Record<string, unknown> | null;
    const oidcConfig = settings?.oidc as OidcConfig | undefined;
    if (!oidcConfig?.issuerUrl || !oidcConfig?.clientId) return null;

    return { orgId: org.id, oidcConfig };
  }
}
