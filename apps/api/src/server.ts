import { execFileSync } from 'node:child_process';
import { createApp } from './app';
import { loadConfig } from './config/env';
import { buildContainer } from './container';
import { createLogger } from './lib/logger';
import { configureHttp } from './lib/network';

async function main(): Promise<void> {
  configureHttp();
  const config = loadConfig();
  const logger = createLogger(config);

  if (config.runMigrations) {
    logger.info('Applying database migrations');
    execFileSync('npx', ['prisma', 'migrate', 'deploy', '--schema', 'prisma/schema.prisma'], { stdio: 'inherit' });
  }

  const container = buildContainer(config, logger);
  await container.storage.ensureReady();
  await container.prisma.$connect();

  const app = createApp(container);
  const server = app.listen(config.port, () => {
    logger.info(
      { port: config.port, ai: container.ai.providerName, storage: container.storage.name, queue: config.queue.driver },
      `HireFlow API listening on http://localhost:${config.port} (docs at /api/docs)`,
    );
    if (container.ai.isHeuristic) {
      logger.warn('AI provider is HEURISTIC (no AI_API_KEY). Set AI_API_KEY for LLM-powered parsing, analysis and copilot.');
    }
  });

  const shutdown = (signal: string) => {
    logger.info({ signal }, 'Shutting down API');
    server.close(() => {
      container
        .close()
        .catch((error: unknown) => logger.error({ err: error }, 'Error during shutdown'))
        .finally(() => process.exit(0));
    });
    setTimeout(() => process.exit(1), 10_000).unref();
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

main().catch((error: unknown) => {
  // Logger may not exist yet (e.g. invalid configuration).
  process.stderr.write(`Failed to start API: ${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
});
