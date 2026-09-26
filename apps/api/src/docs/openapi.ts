import { z } from 'zod';
import type { RouteDef } from '../routes/route-table';

type JsonSchema = Record<string, unknown>;

function toSchema(
  schema: z.ZodType | undefined,
  io: 'input' | 'output' = 'input',
): JsonSchema | null {
  if (!schema) return null;
  try {
    const json = z.toJSONSchema(schema, {
      io,
      unrepresentable: 'any',
      target: 'openapi-3.0',
    }) as JsonSchema;
    delete json.$schema;
    return json;
  } catch {
    return { type: 'object' };
  }
}

function parametersFrom(
  schema: z.ZodType | undefined,
  location: 'query' | 'path',
  required: boolean,
): unknown[] {
  const json = toSchema(schema);
  const properties = (json?.properties ?? {}) as Record<string, JsonSchema>;
  const requiredList = new Set((json?.required as string[] | undefined) ?? []);
  return Object.entries(properties).map(([name, prop]) => ({
    name,
    in: location,
    required: required || requiredList.has(name),
    schema: prop,
  }));
}

const errorResponse = {
  description: 'Error',
  content: {
    'application/json': {
      schema: {
        type: 'object',
        properties: {
          success: { type: 'boolean', enum: [false] },
          error: {
            type: 'object',
            properties: {
              code: { type: 'string', example: 'VALIDATION_ERROR' },
              message: { type: 'string' },
              details: {},
              requestId: { type: 'string' },
            },
            required: ['code', 'message'],
          },
        },
      },
    },
  },
};

const ACCESS_NOTES: Record<RouteDef['access'], string> = {
  public: 'Public.',
  optional: 'Public; personalized when a bearer token is sent.',
  user: 'Requires authentication.',
  candidate: 'Requires a candidate account.',
  staff: 'Requires organization membership (X-Organization-Id header optional).',
};

/**
 * Builds the OpenAPI 3.0 document from the route table and the Zod schemas attached to each
 * handler, so documentation cannot drift from validation.
 */
export function buildOpenApiDocument(
  routes: RouteDef[],
  serverUrl: string,
): Record<string, unknown> {
  const paths: Record<string, Record<string, unknown>> = {};
  for (const route of routes) {
    const path = `/api${route.path}`.replace(/:(\w+)/g, '{$1}');
    const { body, query, params } = route.handler.schemas;
    const pathParamNames = [...route.path.matchAll(/:(\w+)/g)].map((m) => m[1]!);
    const pathParams = params
      ? parametersFrom(params, 'path', true)
      : pathParamNames.map((name) => ({
          name,
          in: 'path',
          required: true,
          schema: { type: 'string' },
        }));

    const status = String(route.status ?? 200);
    const responses: Record<string, unknown> = {
      [status]:
        route.produces === 'redirect'
          ? { description: 'Redirect' }
          : route.produces
            ? {
                description: 'File',
                content: { [route.produces]: { schema: { type: 'string', format: 'binary' } } },
              }
            : {
                description: 'Success envelope `{ success: true, data, message?, meta? }`',
                content: {
                  'application/json': {
                    schema: {
                      type: 'object',
                      properties: {
                        success: { type: 'boolean', enum: [true] },
                        data: {},
                        message: { type: 'string' },
                        meta: { type: 'object' },
                      },
                    },
                  },
                },
              },
      '400': errorResponse,
      ...(route.access !== 'public' && route.access !== 'optional'
        ? { '401': errorResponse, '403': errorResponse }
        : {}),
      '429': errorResponse,
    };

    const operation: Record<string, unknown> = {
      tags: [route.tag],
      summary: route.summary,
      description: [
        route.description,
        ACCESS_NOTES[route.access],
        route.permission ? `Permission: \`${route.permission}\`.` : null,
      ]
        .filter(Boolean)
        .join('\n\n'),
      parameters: [...pathParams, ...parametersFrom(query, 'query', false)],
      responses,
      ...(route.access === 'public' || route.access === 'optional' ? { security: [] } : {}),
    };

    if (route.multipart) {
      operation.requestBody = {
        required: true,
        content: {
          'multipart/form-data': {
            schema: {
              type: 'object',
              properties: { file: { type: 'string', format: 'binary' } },
              required: ['file'],
            },
          },
        },
      };
    } else if (body) {
      operation.requestBody = {
        required: true,
        content: { 'application/json': { schema: toSchema(body) } },
      };
    }
    paths[path] = { ...(paths[path] ?? {}), [route.method]: operation };
  }

  return {
    openapi: '3.0.3',
    info: {
      title: 'HireFlow AI API',
      version: '1.0.0',
      description:
        'REST API for HireFlow AI. Authenticate with `POST /api/auth/login`, then send `Authorization: Bearer <accessToken>`. ' +
        'The refresh token lives in an httpOnly cookie scoped to `/api/auth`. All responses use the `{ success, data | error }` envelope.',
    },
    servers: [{ url: serverUrl }],
    components: {
      securitySchemes: { bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' } },
    },
    security: [{ bearerAuth: [] }],
    paths,
  };
}
