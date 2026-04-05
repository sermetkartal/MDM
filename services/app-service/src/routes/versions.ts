import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import * as appService from '../services/app-service.js';

const createVersionSchema = z.object({
  version_code: z.number().int().positive(),
  version_name: z.string().min(1),
  file_url: z.string().min(1),
  file_hash: z.string().min(1),
  file_size: z.number().int().positive(),
  min_sdk_version: z.number().int().optional(),
  release_notes: z.string().optional(),
});

const uploadRequestSchema = z.object({
  file_name: z.string().min(1),
});

export const versionRoutes: FastifyPluginAsync = async (app) => {
  // Upload new version: generate presigned S3 URL, client uploads APK directly
  app.post('/:id/versions/upload-url', async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = uploadRequestSchema.parse(request.body);

    const found = await appService.getApp(id);
    if (!found) return reply.status(404).send({ error: 'App not found' });

    const { upload_url, file_url } = await appService.generateUploadUrl(id, body.file_name);
    return reply.send({ upload_url, file_url });
  });

  // Create version record after upload completes with client-parsed metadata
  app.post('/:id/versions', async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = createVersionSchema.parse(request.body);

    const found = await appService.getApp(id);
    if (!found) return reply.status(404).send({ error: 'App not found' });

    const version = await appService.createVersion(id, body);
    return reply.status(201).send(version);
  });

  // List all versions with download URLs
  app.get('/:id/versions', async (request, reply) => {
    const { id } = request.params as { id: string };

    const found = await appService.getApp(id);
    if (!found) return reply.status(404).send({ error: 'App not found' });

    const versions = await appService.listVersions(id);
    return reply.send({ versions });
  });

  // Rollback: set specified version as current
  app.post('/:id/versions/:vid/rollback', async (request, reply) => {
    const { id, vid } = request.params as { id: string; vid: string };

    const rolled = await appService.rollbackVersion(id, vid);
    if (!rolled) return reply.status(404).send({ error: 'Version not found' });
    return reply.send(rolled);
  });
};
