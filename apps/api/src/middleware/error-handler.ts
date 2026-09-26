import type { ErrorRequestHandler, RequestHandler } from 'express';
import { MulterError } from 'multer';
import { Prisma } from '@hireflow/database';
import type { ApiErrorBody } from '@hireflow/shared';
import { AppError, NotFoundError, PayloadTooLargeError, ValidationError } from '../lib/errors';
import type { Logger } from '../lib/logger';

export function notFoundHandler(): RequestHandler {
  return (req) => {
    throw new NotFoundError(`Route ${req.method} ${req.path}`);
  };
}

/** Maps known library errors onto operational errors. */
function normalize(error: unknown): AppError | null {
  if (error instanceof AppError) return error;
  if (error instanceof MulterError) {
    if (error.code === 'LIMIT_FILE_SIZE') return new PayloadTooLargeError('The file is too large');
    return new ValidationError(`Upload error: ${error.message}`);
  }
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === 'P2025') return new NotFoundError();
    if (error.code === 'P2002') {
      return new AppError('CONFLICT', 409, 'A record with these details already exists');
    }
  }
  if (error instanceof SyntaxError && 'body' in error) {
    return new ValidationError('Malformed JSON body');
  }
  if (typeof error === 'object' && error !== null && 'type' in error && error.type === 'entity.too.large') {
    return new PayloadTooLargeError('The request body is too large');
  }
  return null;
}

/**
 * Central error handler: operational errors become the standard error envelope; anything else is
 * logged with full context and reported as a generic 500 without leaking internals.
 */
export function errorHandler(logger: Logger): ErrorRequestHandler {
  return (error, req, res, _next) => {
    const appError = normalize(error);
    const requestId = req.requestId;

    if (!appError) {
      logger.error(
        { err: error, requestId, method: req.method, path: req.path, userId: req.auth?.userId },
        'Unhandled error',
      );
    } else if (appError.status >= 500) {
      logger.error({ err: error, requestId, code: appError.code }, appError.message);
    }

    const body: ApiErrorBody = {
      success: false,
      error: appError
        ? {
            code: appError.code,
            message: appError.message,
            ...(appError.details !== undefined ? { details: appError.details } : {}),
            requestId,
          }
        : { code: 'INTERNAL_ERROR', message: 'Something went wrong. Please try again.', requestId },
    };
    if (res.headersSent) return;
    res.status(appError?.status ?? 500).json(body);
  };
}
