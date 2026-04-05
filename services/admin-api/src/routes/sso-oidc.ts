import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import Redis from 'ioredis';
import { db } from '../db/index.js';
import { roles } from '../db/schema.js';
import { OidcService } from '../services/oidc-service.js';
import { AuthService } from '../services/auth-service.js';
import { config } from '../config/index.js';

const loginQuerySchema = z.object({
  org_slug: z.string().min(1),
  relay_state: z.string().optional(),
});

const callbackQuerySchema = z.object({
  code: z.string().min(1),
  state: z.string().min(1),
});

export async function ssoOidcRoutes(app: FastifyInstance): Promise<void> {
  const baseUrl = `http://localhost:${config.PORT}`;
  const oidcService = new OidcService(baseUrl);
  const authService = new AuthService(app);

  let redis: Redis | null = null;
  try {
    redis = new Redis(config.REDIS_URL, { lazyConnect: true, maxRetriesPerRequest: 1 });
    redis.on('error', () => {});
  } catch {
    // Redis not available
  }

  // Initiate OIDC login
  app.get('/oidc/login', {
    schema: { description: 'Redirect to OIDC IdP for authentication', tags: ['sso'] },
  }, async (request, reply) => {
    const query = loginQuerySchema.parse(request.query);
    const orgConfig = await oidcService.getOrgConfig(query.org_slug);

    if (!orgConfig) {
      reply.status(404).send({
        statusCode: 404,
        error: 'Not Found',
        message: 'OIDC not configured for this organization',
      });
      return;
    }

    const pkce = oidcService.generatePkce();
    const state = crypto.randomUUID();

    // Store PKCE verifier and org info in Redis
    const stateData = JSON.stringify({
      codeVerifier: pkce.codeVerifier,
      orgSlug: query.org_slug,
      relayState: query.relay_state,
    });

    if (redis) {
      await redis.set(`oidc:state:${state}`, stateData, 'EX', 600);
    }

    const authUrl = await oidcService.buildAuthorizationUrl(
      orgConfig.oidcConfig,
      state,
      { codeChallenge: pkce.codeChallenge },
    );

    reply.redirect(authUrl);
  });

  // OIDC callback
  app.get('/oidc/callback', {
    schema: { description: 'OIDC authorization code callback', tags: ['sso'] },
  }, async (request, reply) => {
    const query = callbackQuerySchema.parse(request.query);

    // Retrieve state data
    let stateData: { codeVerifier: string; orgSlug: string; relayState?: string } | null = null;
    if (redis) {
      const raw = await redis.get(`oidc:state:${query.state}`);
      if (raw) {
        stateData = JSON.parse(raw);
        await redis.del(`oidc:state:${query.state}`);
      }
    }

    if (!stateData) {
      reply.status(400).send({
        statusCode: 400,
        error: 'Bad Request',
        message: 'Invalid or expired state parameter',
      });
      return;
    }

    const orgConfig = await oidcService.getOrgConfig(stateData.orgSlug);
    if (!orgConfig) {
      reply.status(404).send({
        statusCode: 404,
        error: 'Not Found',
        message: 'OIDC configuration not found',
      });
      return;
    }

    // Exchange code for tokens
    const tokenResponse = await oidcService.exchangeCode(
      orgConfig.oidcConfig,
      query.code,
      stateData.codeVerifier,
    );

    // Decode ID token and get user info
    const idTokenClaims = oidcService.decodeIdToken(tokenResponse.id_token);
    const userInfo = await oidcService.getUserInfo(orgConfig.oidcConfig, tokenResponse.access_token);
    const mergedInfo = { ...idTokenClaims, ...userInfo };

    const user = await oidcService.findOrCreateUser(
      orgConfig.orgId,
      mergedInfo,
      orgConfig.oidcConfig.attributeMapping,
    );

    // Fetch role permissions
    const [role] = await db
      .select({ permissions: roles.permissions })
      .from(roles)
      .where(eq(roles.id, user.roleId))
      .limit(1);

    const tokens = authService.generateTokens({
      sub: user.id,
      email: user.email,
      orgId: user.orgId,
      roleId: user.roleId,
      permissions: (role?.permissions as string[]) ?? [],
    });

    if (stateData.relayState?.startsWith('http')) {
      const url = new URL(stateData.relayState);
      url.searchParams.set('token', tokens.accessToken);
      reply.redirect(url.toString());
      return;
    }

    reply.send(tokens);
  });
}
