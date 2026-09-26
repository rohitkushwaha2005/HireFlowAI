import { randomUUID } from 'node:crypto';
import type { RequestHandler } from 'express';
import { pinoHttp } from 'pino-http';
import type { Logger } from '../lib/logger';

const REQUEST_ID_HEADER = 'x-request-id';

/** Accepts an upstream request id if it looks safe, otherwise generates one; echoes it back. */
export function requestId(): RequestHandler {
  return (req, res, next) => {
    const incoming = req.header(REQUEST_ID_HEADER);
    req.requestId = incoming && /^[\w-]{8,64}$/.test(incoming) ? incoming : randomUUID();
    res.setHeader('X-Request-Id', req.requestId);
    next();
  };
}

/**
 * One structured log line per request: request id, method, path, status, duration, user id.
 * Bodies are never logged; headers are reduced to a safe subset.
 */
export function requestLogger(logger: Logger): RequestHandler {
  return pinoHttp({
    logger,
    genReqId: (req) => (req as unknown as { requestId: string }).requestId,
    customLogLevel: (_req, res, err) => {
      if (err || res.statusCode >= 500) return 'error';
      if (res.statusCode >= 400) return 'warn';
      return 'info';
    },
    autoLogging: { ignore: (req) => req.url === '/api/health' },
    customSuccessMessage: (req, res, responseTime) =>
      `${req.method} ${req.url} ${res.statusCode} ${Math.round(responseTime)}ms`,
    customErrorMessage: (req, res) => `${req.method} ${req.url} ${res.statusCode}`,
    customProps: (req) => ({
      userId: (req as unknown as { auth?: { userId: string } }).auth?.userId,
    }),
    serializers: {
      req: (req: { id: string; method: string; url: string; headers: Record<string, string> }) => ({
        id: req.id,
        method: req.method,
        path: req.url.split('?')[0],
        userAgent: req.headers['user-agent'],
      }),
      res: (res: { statusCode: number }) => ({ statusCode: res.statusCode }),
    },
  });
}
