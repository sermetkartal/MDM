import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { eq, and, count, desc } from 'drizzle-orm';
import { db } from '../db/index.js';
import { certificates } from '../db/schema.js';
import { requirePermission } from '../middleware/rbac.js';

const querySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(25),
  type: z.enum(['device', 'ca', 'client']).optional(),
  status: z.enum(['active', 'revoked', 'expired']).optional(),
});

const CERT_SERVICE_URL = process.env.CERT_SERVICE_URL ?? 'http://localhost:8080';

export async function certificateRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('onRequest', app.authenticate);

  // List all certificates
  app.get('/', {
    schema: { description: 'List all certificates with expiry info', tags: ['certificates'] },
    preHandler: [requirePermission('certificates:read')],
  }, async (request, reply) => {
    const filters = querySchema.parse(request.query);
    const { page, limit, type, status } = filters;
    const offset = (page - 1) * limit;

    const conditions = [eq(certificates.orgId, request.user.orgId)];
    if (type) conditions.push(eq(certificates.type, type));
    if (status) conditions.push(eq(certificates.status, status));

    const where = and(...conditions);

    const [data, [{ total }]] = await Promise.all([
      db.select().from(certificates).where(where).orderBy(desc(certificates.createdAt)).limit(limit).offset(offset),
      db.select({ total: count() }).from(certificates).where(where),
    ]);

    const now = new Date();
    const enriched = data.map((cert) => {
      let expiryStatus = 'active';
      if (cert.status === 'revoked') {
        expiryStatus = 'revoked';
      } else if (cert.notAfter) {
        const daysUntilExpiry = Math.ceil((cert.notAfter.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
        if (daysUntilExpiry < 0) expiryStatus = 'expired';
        else if (daysUntilExpiry < 7) expiryStatus = 'expiring_critical';
        else if (daysUntilExpiry < 30) expiryStatus = 'expiring_warning';
      }
      return { ...cert, expiryStatus };
    });

    reply.send({ data: enriched, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } });
  });

  // Get certificate details
  app.get('/:id', {
    schema: { description: 'Get certificate details', tags: ['certificates'] },
    preHandler: [requirePermission('certificates:read')],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };

    const [cert] = await db.select().from(certificates)
      .where(and(eq(certificates.id, id), eq(certificates.orgId, request.user.orgId)))
      .limit(1);

    if (!cert) {
      return reply.status(404).send({ error: 'Certificate not found' });
    }

    reply.send(cert);
  });

  // Revoke certificate
  app.post('/revoke/:id', {
    schema: { description: 'Revoke a certificate', tags: ['certificates'] },
    preHandler: [requirePermission('certificates:write')],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };

    const [cert] = await db.select().from(certificates)
      .where(and(eq(certificates.id, id), eq(certificates.orgId, request.user.orgId)))
      .limit(1);

    if (!cert) {
      return reply.status(404).send({ error: 'Certificate not found' });
    }

    if (cert.status === 'revoked') {
      return reply.status(400).send({ error: 'Certificate is already revoked' });
    }

    await db.update(certificates)
      .set({ status: 'revoked' })
      .where(eq(certificates.id, id));

    reply.send({ message: 'Certificate revoked', id });
  });

  // Upload CA certificate
  app.post('/ca', {
    schema: { description: 'Upload a trusted CA certificate', tags: ['certificates'] },
    preHandler: [requirePermission('certificates:write')],
  }, async (request, reply) => {
    const body = z.object({
      name: z.string().min(1),
      certPem: z.string().min(1),
    }).parse(request.body);

    const [inserted] = await db.insert(certificates).values({
      orgId: request.user.orgId,
      name: body.name,
      type: 'ca',
      status: 'active',
      subject: body.name,
      issuer: 'External CA',
    }).returning();

    reply.status(201).send(inserted);
  });

  // List CA certificates
  app.get('/ca', {
    schema: { description: 'List CA certificates', tags: ['certificates'] },
    preHandler: [requirePermission('certificates:read')],
  }, async (request, reply) => {
    const data = await db.select().from(certificates)
      .where(and(eq(certificates.orgId, request.user.orgId), eq(certificates.type, 'ca')))
      .orderBy(desc(certificates.createdAt));

    reply.send({ data });
  });

  // Download CRL
  app.get('/crl', {
    schema: { description: 'Download current CRL', tags: ['certificates'] },
    preHandler: [requirePermission('certificates:read')],
  }, async (request, reply) => {
    try {
      const resp = await fetch(`${CERT_SERVICE_URL}/scep?operation=GetCACert`);
      if (!resp.ok) {
        return reply.status(502).send({ error: 'Failed to fetch CRL from cert service' });
      }
      const crl = await resp.arrayBuffer();
      reply.header('Content-Type', 'application/pkix-crl');
      reply.send(Buffer.from(crl));
    } catch {
      reply.status(502).send({ error: 'Cert service unavailable' });
    }
  });

  // Get SCEP configuration for enrollment
  app.get('/scep-config', {
    schema: { description: 'Get SCEP URL and challenge for enrollment', tags: ['certificates'] },
    preHandler: [requirePermission('certificates:read')],
  }, async (request, reply) => {
    reply.send({
      scepUrl: `${CERT_SERVICE_URL}/scep`,
      challengePassword: process.env.SCEP_CHALLENGE ?? 'mdm-scep-challenge',
      capabilities: ['POSTPKIOperation', 'SHA-256', 'AES', 'SCEPStandard', 'Renewal'],
    });
  });
}
