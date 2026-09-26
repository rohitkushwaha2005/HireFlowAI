import { z } from 'zod';

/**
 * The only module that reads `process.env`. Everything else receives a typed `AppConfig`.
 * Invalid configuration fails fast at startup with a readable message.
 */

const bool = z
  .enum(['true', 'false', '1', '0', ''])
  .optional()
  .transform((v) => v === 'true' || v === '1');

const optionalString = z
  .string()
  .optional()
  .transform((v) => (v && v.trim() !== '' ? v.trim() : undefined));

const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    LOG_LEVEL: z
      .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
      .default('info'),
    API_PORT: z.coerce.number().int().min(1).max(65535).default(4000),
    WEB_URL: z.url().default('http://localhost:5173'),
    API_URL: z.url().default('http://localhost:4000'),

    DATABASE_URL: z.string().min(1),
    REDIS_URL: z.string().min(1).default('redis://localhost:6379'),

    JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
    JWT_REFRESH_SECRET: z.string().min(32, 'JWT_REFRESH_SECRET must be at least 32 characters'),
    ACCESS_TOKEN_TTL: z
      .string()
      .regex(/^\d+[smhd]$/)
      .default('15m'),
    REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().min(1).max(90).default(14),
    COOKIE_SECURE: bool,

    GOOGLE_CLIENT_ID: optionalString,
    GOOGLE_CLIENT_SECRET: optionalString,

    AI_PROVIDER: z.enum(['anthropic', 'heuristic', 'auto']).default('auto'),
    AI_API_KEY: optionalString,
    AI_MODEL: z.string().min(1).default('claude-opus-5'),
    EMBEDDING_PROVIDER: z.enum(['local']).default('local'),
    EMBEDDING_CACHE_DIR: z.string().default('.cache/models'),

    STORAGE_DRIVER: z.enum(['s3', 'local']).default('s3'),
    S3_ENDPOINT: optionalString,
    S3_REGION: z.string().default('us-east-1'),
    S3_ACCESS_KEY: optionalString,
    S3_SECRET_KEY: optionalString,
    S3_BUCKET: z.string().default('hireflow-resumes'),
    S3_FORCE_PATH_STYLE: bool,
    LOCAL_STORAGE_DIR: z.string().default('.storage'),

    EMAIL_PROVIDER: z.enum(['smtp', 'resend', 'console']).default('console'),
    EMAIL_FROM: z.string().default('HireFlow AI <no-reply@hireflow.local>'),
    EMAIL_API_KEY: optionalString,
    SMTP_HOST: z.string().default('localhost'),
    SMTP_PORT: z.coerce.number().int().default(1025),

    QUEUE_DRIVER: z.enum(['bullmq', 'inline']).default('bullmq'),
    WORKER_CONCURRENCY: z.coerce.number().int().min(1).max(32).default(4),

    MAX_UPLOAD_MB: z.coerce.number().min(1).max(25).default(5),
    RUN_MIGRATIONS: bool,
    TRUST_PROXY: bool,
  })
  .superRefine((env, ctx) => {
    if (env.AI_PROVIDER === 'anthropic' && !env.AI_API_KEY) {
      ctx.addIssue({
        code: 'custom',
        path: ['AI_API_KEY'],
        message: 'AI_API_KEY is required when AI_PROVIDER=anthropic',
      });
    }
    if (env.EMAIL_PROVIDER === 'resend' && !env.EMAIL_API_KEY) {
      ctx.addIssue({
        code: 'custom',
        path: ['EMAIL_API_KEY'],
        message: 'EMAIL_API_KEY is required when EMAIL_PROVIDER=resend',
      });
    }
    if (
      env.NODE_ENV === 'production' &&
      /change-me/.test(env.JWT_SECRET + env.JWT_REFRESH_SECRET)
    ) {
      ctx.addIssue({
        code: 'custom',
        path: ['JWT_SECRET'],
        message: 'Replace the placeholder JWT secrets before running in production',
      });
    }
  });

export type Env = z.infer<typeof envSchema>;

export interface AppConfig {
  env: Env['NODE_ENV'];
  isProduction: boolean;
  isTest: boolean;
  logLevel: Env['LOG_LEVEL'];
  port: number;
  webUrl: string;
  apiUrl: string;
  databaseUrl: string;
  redisUrl: string;
  trustProxy: boolean;
  runMigrations: boolean;
  auth: {
    accessSecret: string;
    refreshSecret: string;
    accessTokenTtl: string;
    refreshTokenTtlDays: number;
    cookieSecure: boolean;
    google: { clientId: string; clientSecret: string } | null;
  };
  ai: {
    provider: 'anthropic' | 'heuristic';
    apiKey: string | undefined;
    model: string;
    embeddingProvider: 'local';
    embeddingCacheDir: string;
  };
  storage:
    | {
        driver: 's3';
        endpoint: string | undefined;
        region: string;
        accessKeyId: string | undefined;
        secretAccessKey: string | undefined;
        bucket: string;
        forcePathStyle: boolean;
      }
    | { driver: 'local'; directory: string };
  email: {
    provider: 'smtp' | 'resend' | 'console';
    from: string;
    apiKey: string | undefined;
    smtpHost: string;
    smtpPort: number;
  };
  queue: { driver: 'bullmq' | 'inline'; concurrency: number };
  uploads: { maxBytes: number };
}

export function loadConfig(source: NodeJS.ProcessEnv = process.env): AppConfig {
  const parsed = envSchema.safeParse(source);
  if (!parsed.success) {
    const details = parsed.error.issues
      .map((issue) => `  - ${issue.path.join('.') || '(root)'}: ${issue.message}`)
      .join('\n');
    throw new Error(`Invalid environment configuration:\n${details}`);
  }
  const env = parsed.data;

  const aiProvider =
    env.AI_PROVIDER === 'auto' ? (env.AI_API_KEY ? 'anthropic' : 'heuristic') : env.AI_PROVIDER;

  return {
    env: env.NODE_ENV,
    isProduction: env.NODE_ENV === 'production',
    isTest: env.NODE_ENV === 'test',
    logLevel: env.LOG_LEVEL,
    port: env.API_PORT,
    webUrl: env.WEB_URL.replace(/\/$/, ''),
    apiUrl: env.API_URL.replace(/\/$/, ''),
    databaseUrl: env.DATABASE_URL,
    redisUrl: env.REDIS_URL,
    trustProxy: env.TRUST_PROXY,
    runMigrations: env.RUN_MIGRATIONS,
    auth: {
      accessSecret: env.JWT_SECRET,
      refreshSecret: env.JWT_REFRESH_SECRET,
      accessTokenTtl: env.ACCESS_TOKEN_TTL,
      refreshTokenTtlDays: env.REFRESH_TOKEN_TTL_DAYS,
      cookieSecure: env.COOKIE_SECURE,
      google:
        env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET
          ? { clientId: env.GOOGLE_CLIENT_ID, clientSecret: env.GOOGLE_CLIENT_SECRET }
          : null,
    },
    ai: {
      provider: aiProvider,
      apiKey: env.AI_API_KEY,
      model: env.AI_MODEL,
      embeddingProvider: env.EMBEDDING_PROVIDER,
      embeddingCacheDir: env.EMBEDDING_CACHE_DIR,
    },
    storage:
      env.STORAGE_DRIVER === 's3'
        ? {
            driver: 's3',
            endpoint: env.S3_ENDPOINT,
            region: env.S3_REGION,
            accessKeyId: env.S3_ACCESS_KEY,
            secretAccessKey: env.S3_SECRET_KEY,
            bucket: env.S3_BUCKET,
            forcePathStyle: env.S3_FORCE_PATH_STYLE,
          }
        : { driver: 'local', directory: env.LOCAL_STORAGE_DIR },
    email: {
      provider: env.EMAIL_PROVIDER,
      from: env.EMAIL_FROM,
      apiKey: env.EMAIL_API_KEY,
      smtpHost: env.SMTP_HOST,
      smtpPort: env.SMTP_PORT,
    },
    queue: { driver: env.QUEUE_DRIVER, concurrency: env.WORKER_CONCURRENCY },
    uploads: { maxBytes: Math.round(env.MAX_UPLOAD_MB * 1024 * 1024) },
  };
}

/** Parses durations like "15m", "12h", "30s", "7d" into seconds. */
export function durationToSeconds(value: string): number {
  const match = /^(\d+)([smhd])$/.exec(value);
  if (!match) throw new Error(`Invalid duration: ${value}`);
  const amount = Number(match[1]);
  const unit = match[2] as 's' | 'm' | 'h' | 'd';
  return amount * { s: 1, m: 60, h: 3600, d: 86400 }[unit];
}
