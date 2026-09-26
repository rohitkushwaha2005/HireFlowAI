import type { NextFunction, Request, RequestHandler, Response } from 'express';
import type { z } from 'zod';
import type { ApiSuccess, PaginationMeta } from '@hireflow/shared';
import { ValidationError } from './errors';

/** What a handler returns; `handle()` wraps it in the success envelope. */
export interface HandlerResult<T> {
  data: T;
  status?: number;
  message?: string;
  pagination?: PaginationMeta;
}

export interface HandlerContext<B, Q, P> {
  req: Request;
  res: Response;
  body: B;
  query: Q;
  params: P;
}

export interface Schemas<B, Q, P> {
  body?: z.ZodType<B>;
  query?: z.ZodType<Q>;
  params?: z.ZodType<P>;
}

function parse<T>(schema: z.ZodType<T> | undefined, value: unknown, location: string): T {
  if (!schema) return value as T;
  const result = schema.safeParse(value);
  if (!result.success) {
    throw new ValidationError(`Invalid request ${location}`, {
      location,
      issues: result.error.issues.map((issue) => ({
        path: issue.path.join('.'),
        message: issue.message,
        code: issue.code,
      })),
    });
  }
  return result.data;
}

/**
 * Typed request handler: validates body/query/params with Zod, runs the handler and sends the
 * standard `{ success, data, message, meta }` envelope. Handlers that stream or redirect return
 * `undefined` after writing to `res` themselves.
 */
export type DocumentedHandler = RequestHandler & { schemas: Schemas<unknown, unknown, unknown> };

export function handle<B = unknown, Q = unknown, P = unknown, T = unknown>(
  schemas: Schemas<B, Q, P>,
  fn: (ctx: HandlerContext<B, Q, P>) => Promise<HandlerResult<T> | undefined>,
): DocumentedHandler {
  const handler = async (req: Request, res: Response, _next: NextFunction) => {
    const ctx: HandlerContext<B, Q, P> = {
      req,
      res,
      body: parse(schemas.body, req.body, 'body'),
      query: parse(schemas.query, req.query, 'query'),
      params: parse(schemas.params, req.params, 'params'),
    };
    const result = await fn(ctx);
    if (result === undefined || res.headersSent) return;

    const envelope: ApiSuccess<T> = { success: true, data: result.data };
    if (result.message) envelope.message = result.message;
    if (result.pagination) envelope.meta = { pagination: result.pagination };
    res.status(result.status ?? 200).json(envelope);
  };
  // Schemas travel with the handler so the OpenAPI document is generated from the same source.
  return Object.assign(handler, { schemas: schemas as Schemas<unknown, unknown, unknown> });
}

export function ok<T>(data: T, extra: Omit<HandlerResult<T>, 'data'> = {}): HandlerResult<T> {
  return { data, ...extra };
}

export function created<T>(data: T, message?: string): HandlerResult<T> {
  return message ? { data, status: 201, message } : { data, status: 201 };
}

export function accepted<T>(data: T, message?: string): HandlerResult<T> {
  return message ? { data, status: 202, message } : { data, status: 202 };
}
