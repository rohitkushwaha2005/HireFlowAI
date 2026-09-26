import { pino, type Logger } from 'pino';
import type { AppConfig } from '../config/env';

/**
 * Paths redacted from every log line. Covers credentials, tokens and contact details that may
 * appear in request bodies or error contexts.
 */
export const REDACT_PATHS = [
  'req.headers.authorization',
  'req.headers.cookie',
  'res.headers["set-cookie"]',
  '*.password',
  '*.passwordHash',
  '*.currentPassword',
  '*.newPassword',
  '*.token',
  '*.accessToken',
  '*.refreshToken',
  '*.apiKey',
  '*.secret',
  '*.phone',
  '*.extractedText',
];

export function createLogger(
  config: Pick<AppConfig, 'logLevel' | 'isProduction' | 'isTest'>,
): Logger {
  return pino({
    level: config.isTest ? 'silent' : config.logLevel,
    redact: { paths: REDACT_PATHS, censor: '[redacted]' },
    base: { service: 'hireflow-api' },
    timestamp: pino.stdTimeFunctions.isoTime,
    ...(config.isProduction || config.isTest
      ? {}
      : {
          transport: {
            target: 'pino-pretty',
            options: {
              colorize: true,
              translateTime: 'HH:MM:ss.l',
              ignore: 'pid,hostname,service',
            },
          },
        }),
  });
}

export type { Logger };
