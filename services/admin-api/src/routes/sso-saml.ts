import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { db } from '../db/index.js';
import { roles } from '../db/schema.js';
import { SamlService } from '../services/saml-service.js';
import { AuthService } from '../services/auth-service.js';

const loginQuerySchema = z.object({
  org_slug: z.string().min(1),
  relay_state: z.string().optional(),
});

const callbackSchema = z.object({
  SAMLResponse: z.string().min(1),
  RelayState: z.string().optional(),
});

export async function ssoSamlRoutes(app: FastifyInstance): Promise<void> {
  const baseUrl = `http://localhost:${process.env.PORT ?? 3001}`;
  const samlService = new SamlService(baseUrl);
  const authService = new AuthService(app);

  // SP Metadata
  app.get('/saml/metadata', {
    schema: { description: 'SAML Service Provider metadata XML', tags: ['sso'] },
  }, async (_request, reply) => {
    reply.type('application/xml').send(samlService.generateSpMetadata());
  });

  // Initiate SAML login
  app.get('/saml/login', {
    schema: { description: 'Redirect to IdP for SAML authentication', tags: ['sso'] },
  }, async (request, reply) => {
    const query = loginQuerySchema.parse(request.query);
    const orgConfig = await samlService.getOrgConfig(query.org_slug);

    if (!orgConfig) {
      reply.status(404).send({
        statusCode: 404,
        error: 'Not Found',
        message: 'SAML not configured for this organization',
      });
      return;
    }

    const { redirectUrl } = samlService.generateAuthnRequest(
      orgConfig.samlConfig.ssoLoginUrl,
      query.relay_state,
    );

    reply.redirect(redirectUrl);
  });

  // SAML Assertion Consumer Service
  app.post('/saml/callback', {
    schema: { description: 'SAML Assertion Consumer Service callback', tags: ['sso'] },
  }, async (request, reply) => {
    const body = callbackSchema.parse(request.body);

    // Decode the SAML response to find the issuer/org
    const xml = Buffer.from(body.SAMLResponse, 'base64').toString('utf-8');
    const issuerMatch = xml.match(/<(?:saml2?:)?Issuer[^>]*>([^<]+)<\//);
    const issuer = issuerMatch?.[1];

    if (!issuer) {
      reply.status(400).send({
        statusCode: 400,
        error: 'Bad Request',
        message: 'Could not determine IdP issuer from SAML response',
      });
      return;
    }

    // Find the org that has this IdP entity ID configured
    const { organizations } = await import('../db/schema.js');
    const allOrgs = await db.select({ id: organizations.id, settings: organizations.settings }).from(organizations);

    let orgId: string | null = null;
    let samlConfig: import('../services/saml-service.js').SamlConfig | null = null;

    for (const org of allOrgs) {
      const settings = org.settings as Record<string, unknown> | null;
      const cfg = settings?.saml as import('../services/saml-service.js').SamlConfig | undefined;
      if (cfg?.entityId === issuer) {
        orgId = org.id;
        samlConfig = cfg;
        break;
      }
    }

    if (!orgId || !samlConfig) {
      reply.status(400).send({
        statusCode: 400,
        error: 'Bad Request',
        message: 'Unknown IdP issuer',
      });
      return;
    }

    const assertion = samlService.parseResponse(body.SAMLResponse, samlConfig.certificate);

    if (!assertion.nameId) {
      reply.status(400).send({
        statusCode: 400,
        error: 'Bad Request',
        message: 'SAML assertion missing NameID',
      });
      return;
    }

    const user = await samlService.findOrCreateUser(orgId, assertion, samlConfig.attributeMapping);

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

    // If RelayState is a URL, redirect with token
    if (body.RelayState && body.RelayState.startsWith('http')) {
      const url = new URL(body.RelayState);
      url.searchParams.set('token', tokens.accessToken);
      reply.redirect(url.toString());
      return;
    }

    reply.send(tokens);
  });
}
