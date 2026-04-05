import { z } from 'zod';

const envSchema = z.object({
  PORT: z.coerce.number().default(3005),
  HOST: z.string().default('0.0.0.0'),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  DATABASE_URL: z.string().default('postgresql://mdm:mdm@localhost:5432/mdm'),
  REDIS_URL: z.string().default('redis://localhost:6379'),
  REPORT_OUTPUT_DIR: z.string().default('/tmp/reports'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
});

export type EnvConfig = z.infer<typeof envSchema>;

function loadConfig(): EnvConfig {
  const result = envSchema.safeParse(process.env);
  if (!result.success) {
    console.error('Invalid environment configuration:', result.error.flatten().fieldErrors);
    process.exit(1);
  }
  return result.data;
}

export const config = loadConfig();
