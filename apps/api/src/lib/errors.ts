import type { ErrorCode } from '@hireflow/shared';

/**
 * Operational errors. Anything thrown that is not an `AppError` is treated as an unexpected bug:
 * logged with full context and returned to the client as a generic INTERNAL_ERROR.
 */
export class AppError extends Error {
  constructor(
    public readonly code: ErrorCode,
    public readonly status: number,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = new.target.name;
  }
}

export class ValidationError extends AppError {
  constructor(message = 'The request is invalid', details?: unknown) {
    super('VALIDATION_ERROR', 400, message, details);
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = 'Authentication required') {
    super('UNAUTHORIZED', 401, message);
  }
}

export class ForbiddenError extends AppError {
  constructor(message = 'You do not have permission to perform this action') {
    super('FORBIDDEN', 403, message);
  }
}

export class NotFoundError extends AppError {
  constructor(entity = 'Resource') {
    super('NOT_FOUND', 404, `${entity} not found`);
  }
}

export class ConflictError extends AppError {
  constructor(message: string, details?: unknown) {
    super('CONFLICT', 409, message, details);
  }
}

export class InvalidStateError extends AppError {
  constructor(message: string, details?: unknown) {
    super('INVALID_STATE', 409, message, details);
  }
}

export class PayloadTooLargeError extends AppError {
  constructor(message: string) {
    super('PAYLOAD_TOO_LARGE', 413, message);
  }
}

export class UnsupportedMediaTypeError extends AppError {
  constructor(message: string) {
    super('UNSUPPORTED_MEDIA_TYPE', 415, message);
  }
}

export class RateLimitedError extends AppError {
  constructor(message = 'Too many requests, please try again later') {
    super('RATE_LIMITED', 429, message);
  }
}

export class AIUnavailableError extends AppError {
  constructor(message = 'The AI service is temporarily unavailable', details?: unknown) {
    super('AI_UNAVAILABLE', 503, message, details);
  }
}

export function isAppError(error: unknown): error is AppError {
  return error instanceof AppError;
}

/** Short, log-safe description of any thrown value. */
export function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return typeof error === 'string' ? error : 'Unknown error';
}
