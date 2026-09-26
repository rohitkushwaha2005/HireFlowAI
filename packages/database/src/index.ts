import { PrismaClient } from '@prisma/client';

export * from '@prisma/client';
export type { EnumParity } from './enum-parity';

type LogLevel = 'query' | 'info' | 'warn' | 'error';

export interface CreatePrismaOptions {
  url?: string;
  log?: LogLevel[];
}

export function createPrismaClient(options: CreatePrismaOptions = {}): PrismaClient {
  return new PrismaClient({
    ...(options.url ? { datasources: { db: { url: options.url } } } : {}),
    log: options.log ?? ['warn', 'error'],
  });
}
