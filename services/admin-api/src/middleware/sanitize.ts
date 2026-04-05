import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';

const DEFAULT_MAX_BODY_SIZE = 10 * 1024 * 1024; // 10MB
const UPLOAD_MAX_BODY_SIZE = 100 * 1024 * 1024; // 100MB
const UPLOAD_PATHS = ['/api/v1/apps/upload', '/api/v1/certificates/upload'];

// Matches HTML tags: <script>, <img onerror=...>, etc.
const HTML_TAG_RE = /<\/?[a-z][^>]*>/gi;

// Path traversal patterns (decoded and raw)
const PATH_TRAVERSAL_PATTERNS = [
  '../',
  '..\\',
  '%2e%2e%2f',
  '%2e%2e/',
  '..%2f',
  '%2e%2e%5c',
  '%2e%2e\\',
  '..%5c',
  '%252e%252e%252f',
];

function stripHtmlTags(value: unknown): unknown {
  if (typeof value === 'string') {
    return value.replace(HTML_TAG_RE, '');
  }
  if (Array.isArray(value)) {
    return value.map(stripHtmlTags);
  }
  if (value !== null && typeof value === 'object') {
    const result: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      result[k] = stripHtmlTags(v);
    }
    return result;
  }
  return value;
}

function containsPathTraversal(url: string): boolean {
  const decoded = decodeURIComponent(url).toLowerCase();
  return PATH_TRAVERSAL_PATTERNS.some(
    (pattern) => decoded.includes(pattern.toLowerCase()) || url.toLowerCase().includes(pattern.toLowerCase()),
  );
}

function getMaxBodySize(url: string): number {
  if (UPLOAD_PATHS.some((p) => url.startsWith(p))) {
    return UPLOAD_MAX_BODY_SIZE;
  }
  return DEFAULT_MAX_BODY_SIZE;
}

export function registerSanitization(app: FastifyInstance): void {
  app.addHook('onRequest', async (request: FastifyRequest, reply: FastifyReply) => {
    // Path traversal prevention
    if (containsPathTraversal(request.url)) {
      reply.status(400).send({
        statusCode: 400,
        error: 'Bad Request',
        message: 'Path traversal detected',
      });
      return;
    }

    // Content-Type validation for requests with bodies
    if (request.body !== undefined && request.body !== null) {
      const contentType = request.headers['content-type'];
      if (request.method !== 'GET' && request.method !== 'DELETE') {
        if (!contentType) {
          reply.status(415).send({
            statusCode: 415,
            error: 'Unsupported Media Type',
            message: 'Content-Type header is required for request bodies',
          });
          return;
        }
      }
    }

    // Body size enforcement
    const contentLength = parseInt(request.headers['content-length'] ?? '0', 10);
    const maxSize = getMaxBodySize(request.url);
    if (contentLength > maxSize) {
      reply.status(413).send({
        statusCode: 413,
        error: 'Payload Too Large',
        message: `Request body exceeds maximum size of ${Math.round(maxSize / 1024 / 1024)}MB`,
      });
      return;
    }
  });

  // Sanitize parsed body (runs after body parsing)
  app.addHook('preHandler', async (request: FastifyRequest, _reply: FastifyReply) => {
    if (request.body && typeof request.body === 'object') {
      request.body = stripHtmlTags(request.body);
    }
  });
}
