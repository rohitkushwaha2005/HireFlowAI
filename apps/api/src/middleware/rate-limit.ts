import type { RequestHandler } from 'express';
import { rateLimit, type Options } from 'express-rate-limit';
import { RedisStore, type RedisReply } from 'rate-limit-redis';
import type { Redis } from 'ioredis';
import { RateLimitedError } from '../lib/errors';

export interface RateLimiters {
  global: RequestHandler;
  auth: RequestHandler;
  ai: RequestHandler;
  upload: RequestHandler;
}

/**
 * Rate limiters backed by Redis (shared across API instances) when available. Keys are per IP for
 * anonymous routes and per user for authenticated AI/upload routes.
 */
export function createRateLimiters(redis: Redis | null, disabled = false): RateLimiters {
  const make = (prefix: string, options: Partial<Options>): RequestHandler => {
    if (disabled) return (_req, _res, next) => next();
    return rateLimit({
      standardHeaders: 'draft-7',
      legacyHeaders: false,
      ...(redis
        ? {
            store: new RedisStore({
              prefix: `hireflow:rl:${prefix}:`,
              sendCommand: (command: string, ...args: string[]) =>
                redis.call(command, ...args) as Promise<RedisReply>,
            }),
          }
        : {}),
      handler: () => {
        throw new RateLimitedError();
      },
      ...options,
    });
  };

  const userKey: Options['keyGenerator'] = (req) => req.auth?.userId ?? req.ip ?? 'anonymous';

  return {
    global: make('global', { windowMs: 60_000, limit: 300 }),
    auth: make('auth', { windowMs: 15 * 60_000, limit: 20, skipSuccessfulRequests: true }),
    ai: make('ai', { windowMs: 60_000, limit: 20, keyGenerator: userKey }),
    upload: make('upload', { windowMs: 60 * 60_000, limit: 30, keyGenerator: userKey }),
  };
}
