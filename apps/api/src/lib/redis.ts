import { Redis } from 'ioredis';
import type { Logger } from './logger';

export function createRedis(url: string, logger: Logger, name: string): Redis {
  const client = new Redis(url, {
    // Required by BullMQ for blocking connections; harmless elsewhere.
    maxRetriesPerRequest: null,
    enableReadyCheck: true,
    lazyConnect: false,
    connectionName: `hireflow-${name}`,
  });
  client.on('error', (error) =>
    logger.warn({ err: error, connection: name }, 'Redis connection error'),
  );
  return client;
}

/** Small JSON cache helper with namespaced keys and TTLs. */
export class Cache {
  constructor(
    private readonly redis: Redis | null,
    private readonly namespace = 'hireflow:cache',
  ) {}

  private key(key: string): string {
    return `${this.namespace}:${key}`;
  }

  async get<T>(key: string): Promise<T | null> {
    if (!this.redis) return null;
    try {
      const raw = await this.redis.get(this.key(key));
      return raw ? (JSON.parse(raw) as T) : null;
    } catch {
      return null;
    }
  }

  async set(key: string, value: unknown, ttlSeconds: number): Promise<void> {
    if (!this.redis) return;
    try {
      await this.redis.set(this.key(key), JSON.stringify(value), 'EX', ttlSeconds);
    } catch {
      // Cache failures must never break a request.
    }
  }

  async delete(...keys: string[]): Promise<void> {
    if (!this.redis || keys.length === 0) return;
    try {
      await this.redis.del(...keys.map((k) => this.key(k)));
    } catch {
      // ignore
    }
  }

  /** Read-through helper. */
  async wrap<T>(key: string, ttlSeconds: number, load: () => Promise<T>): Promise<T> {
    const cached = await this.get<T>(key);
    if (cached !== null) return cached;
    const value = await load();
    await this.set(key, value, ttlSeconds);
    return value;
  }
}
