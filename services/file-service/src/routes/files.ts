import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import * as s3Service from '../services/s3-service.js';

const uploadRequestSchema = z.object({
  filename: z.string().min(1),
  content_type: z.string().min(1),
  prefix: z.string().optional(),
});

export const fileRoutes: FastifyPluginAsync = async (app) => {
  app.post('/upload', async (request, reply) => {
    const body = uploadRequestSchema.parse(request.body);
    const key = body.prefix
      ? `${body.prefix}/${crypto.randomUUID()}-${body.filename}`
      : `${crypto.randomUUID()}-${body.filename}`;
    const url = await s3Service.getPresignedUploadUrl(key, body.content_type);
    return reply.status(200).send({ upload_url: url, key });
  });

  app.get('/download/:key', async (request, reply) => {
    const { key } = request.params as { key: string };
    const url = await s3Service.getPresignedDownloadUrl(key);
    return reply.send({ download_url: url });
  });

  app.delete('/:key', async (request, reply) => {
    const { key } = request.params as { key: string };
    await s3Service.deleteObject(key);
    return reply.status(204).send();
  });
};
