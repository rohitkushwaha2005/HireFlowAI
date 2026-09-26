/**
 * Recomputes embeddings and match scores for every job and candidate. Run after changing the
 * embedding model, the embedding text builders or the scoring calibration:
 *
 *   pnpm --filter @hireflow/api backfill            # embeddings + matches
 *   pnpm --filter @hireflow/api backfill --matches  # matches only
 */
import { loadConfig } from '../config/env';
import { buildContainer } from '../container';
import { ConsoleEmailProvider } from '../lib/email';
import { createLogger } from '../lib/logger';
import { configureHttp } from '../lib/network';

async function main(): Promise<void> {
  configureHttp();
  const matchesOnly = process.argv.includes('--matches');
  // Inline queue so work happens in this process; embeddings are triggered explicitly below.
  const config = loadConfig({
    ...process.env,
    QUEUE_DRIVER: 'inline',
    EMAIL_PROVIDER: 'console',
    LOG_LEVEL: 'warn',
  });
  const logger = createLogger(config);
  const container = buildContainer(config, logger, {
    email: new ConsoleEmailProvider(logger),
    redis: null,
  });
  const { prisma, services } = container;
  const out = (line: string) => process.stdout.write(`${line}\n`);

  if (!matchesOnly) {
    const jobs = await prisma.job.findMany({ select: { id: true } });
    for (const job of jobs) await services.embeddings.embedJob(job.id);
    out(`✓ Re-embedded ${jobs.length} jobs (and re-matched their applications)`);

    const candidates = await prisma.candidateProfile.findMany({ select: { id: true } });
    for (const candidate of candidates) await services.embeddings.embedCandidate(candidate.id);
    out(`✓ Re-embedded ${candidates.length} candidates (and re-matched their applications)`);
  } else {
    const applications = await prisma.application.findMany({ select: { id: true } });
    for (const app of applications) await services.matching.computeForApplication(app.id);
    out(`✓ Recomputed ${applications.length} matches`);
  }
  await container.close();
}

main().catch((error: unknown) => {
  process.stderr.write(
    `Backfill failed: ${error instanceof Error ? error.stack : String(error)}\n`,
  );
  process.exit(1);
});
