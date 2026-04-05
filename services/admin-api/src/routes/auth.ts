import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { AuthService } from '../services/auth-service.js';
import { revokeAllSessions } from '../middleware/auth.js';

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
  orgId: z.string().uuid().optional(),
});

const refreshSchema = z.object({
  refreshToken: z.string().min(1),
});

export async function authRoutes(app: FastifyInstance): Promise<void> {
  const authService = new AuthService(app);

  app.post('/login', {
    schema: {
      description: 'Authenticate and obtain JWT tokens',
      tags: ['auth'],
      body: { type: 'object', properties: { email: { type: 'string' }, password: { type: 'string' }, orgId: { type: 'string' } }, required: ['email', 'password'] },
    },
  }, async (request, reply) => {
    const body = loginSchema.parse(request.body);
    const tokens = await authService.login(body.email, body.password, body.orgId, request.ip);
    reply.send(tokens);
  });

  app.post('/refresh', {
    schema: {
      description: 'Refresh JWT tokens',
      tags: ['auth'],
      body: { type: 'object', properties: { refreshToken: { type: 'string' } }, required: ['refreshToken'] },
    },
  }, async (request, reply) => {
    const body = refreshSchema.parse(request.body);
    const tokens = await authService.refresh(body.refreshToken);
    reply.send(tokens);
  });

  app.post('/logout', {
    schema: {
      description: 'Invalidate current session',
      tags: ['auth'],
    },
    onRequest: [app.authenticate],
  }, async (request, reply) => {
    if (request.user?.sub) {
      await revokeAllSessions(request.user.sub);
    }
    reply.send({ message: 'Logged out successfully' });
  });
}
