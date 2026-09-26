import { defineConfig } from 'tsup';

/**
 * Production bundle for the API and worker. Workspace packages (@hireflow/*) are bundled from
 * source; third-party dependencies (incl. native ones like Prisma, argon2, onnxruntime) stay
 * external and are installed in the runtime image.
 */
export default defineConfig({
  entry: {
    server: 'src/server.ts',
    worker: 'src/worker.ts',
    seed: 'src/scripts/seed.ts',
    backfill: 'src/scripts/backfill.ts',
  },
  format: ['esm'],
  platform: 'node',
  target: 'node22',
  outDir: 'dist',
  clean: true,
  sourcemap: true,
  splitting: true,
  noExternal: [/^@hireflow\//],
  external: ['@prisma/client', '.prisma/client'],
});
