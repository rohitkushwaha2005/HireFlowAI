#!/usr/bin/env node
/**
 * Creates a new Prisma migration and removes statements that would drop the hand-written pgvector
 * HNSW indexes. Prisma cannot represent indexes on `Unsupported("vector")` columns, so every diff
 * proposes dropping them; this keeps them intact.
 *
 * Usage: pnpm db:migration:new <name>
 */
import { execSync } from 'node:child_process';
import { readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const name = process.argv[2];
if (!name || !/^[a-z0-9_]+$/.test(name)) {
  console.error('Usage: pnpm db:migration:new <snake_case_name>');
  process.exit(1);
}

execSync(`prisma migrate dev --create-only --name ${name}`, { stdio: 'inherit' });

const dir = 'prisma/migrations';
const latest = readdirSync(dir)
  .filter((d) => statSync(join(dir, d)).isDirectory())
  .sort()
  .at(-1);
if (!latest) process.exit(0);

const file = join(dir, latest, 'migration.sql');
const original = readFileSync(file, 'utf8');
const cleaned = original
  .replace(/-- DropIndex\r?\nDROP INDEX "[a-z_]+_hnsw";\r?\n?/g, '')
  .replace(/\n{3,}/g, '\n\n')
  .trim();

if (!cleaned) {
  console.log(`Migration ${latest} only contained vector-index drops; nothing to apply.`);
  rmSync(join(dir, latest), { recursive: true });
  process.exit(0);
}
writeFileSync(file, `${cleaned}\n`);
console.log(`Created ${file}. Review it, then run: pnpm db:migrate`);
