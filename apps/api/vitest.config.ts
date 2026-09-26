import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Integration tests share one database, so files run sequentially (unit tests are fast anyway).
    fileParallelism: false,
    projects: [
      {
        test: {
          name: 'unit',
          include: ['src/**/*.test.ts'],
          environment: 'node',
        },
      },
      {
        test: {
          name: 'integration',
          include: ['test/integration/**/*.test.ts'],
          environment: 'node',
          globalSetup: ['test/global-setup.ts'],
          setupFiles: ['test/setup-env.ts'],
          // First run downloads/loads the local embedding model.
          testTimeout: 120_000,
          hookTimeout: 180_000,
        },
      },
    ],
  },
});
