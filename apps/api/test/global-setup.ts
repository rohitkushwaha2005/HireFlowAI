import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { testDatabaseUrl } from './test-env';

/** Applies migrations to the dedicated test database once per run. */
export default function setup(): void {
  const url = testDatabaseUrl();
  execFileSync('npx', ['prisma', 'migrate', 'deploy', '--schema', 'prisma/schema.prisma'], {
    cwd: fileURLToPath(new URL('../../../packages/database', import.meta.url)),
    env: { ...process.env, DATABASE_URL: url },
    stdio: 'pipe',
    shell: process.platform === 'win32',
  });
}
