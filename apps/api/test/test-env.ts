import { tmpdir } from 'node:os';
import { join } from 'node:path';

/** Environment for integration tests: isolated database, inline jobs, local storage, heuristic AI. */
export function testDatabaseUrl(): string {
  const url = process.env.TEST_DATABASE_URL;
  if (!url) throw new Error('TEST_DATABASE_URL must be set for integration tests (see .env.example)');
  // Remember the development database URL the first time, before it is overridden below.
  process.env.HIREFLOW_DEV_DATABASE_URL ??= process.env.DATABASE_URL ?? '';
  if (url === process.env.HIREFLOW_DEV_DATABASE_URL) {
    throw new Error('TEST_DATABASE_URL must differ from DATABASE_URL — integration tests truncate every table');
  }
  return url;
}

export function applyTestEnv(): void {
  Object.assign(process.env, {
    NODE_ENV: 'test',
    LOG_LEVEL: 'silent',
    DATABASE_URL: testDatabaseUrl(),
    QUEUE_DRIVER: 'inline',
    STORAGE_DRIVER: 'local',
    LOCAL_STORAGE_DIR: join(tmpdir(), 'hireflow-test-storage'),
    EMAIL_PROVIDER: 'console',
    AI_PROVIDER: 'heuristic',
    JWT_SECRET: 'test-access-secret-that-is-long-enough-123',
    JWT_REFRESH_SECRET: 'test-refresh-secret-that-is-long-enough-456',
    WEB_URL: 'http://localhost:5173',
    API_URL: 'http://localhost:4000',
  });
}
