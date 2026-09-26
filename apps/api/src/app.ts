import cookieParser from 'cookie-parser';
import cors from 'cors';
import express, { type Express } from 'express';
import helmet from 'helmet';
import swaggerUi from 'swagger-ui-express';
import type { Container } from './container';
import { buildOpenApiDocument } from './docs/openapi';
import { errorHandler, notFoundHandler } from './middleware/error-handler';
import { createRateLimiters } from './middleware/rate-limit';
import { requestId, requestLogger } from './middleware/request-context';
import { buildApiRouter, buildRouteTable } from './routes';

export interface CreateAppOptions {
  /** Disable rate limiting (integration tests). */
  disableRateLimits?: boolean;
}

export function createApp(container: Container, options: CreateAppOptions = {}): Express {
  const { config, logger } = container;
  const app = express();

  app.disable('x-powered-by');
  if (config.trustProxy) app.set('trust proxy', 1);

  app.use(requestId());
  app.use(requestLogger(logger));
  app.use(
    helmet({
      // The API serves JSON (and Swagger UI under /api/docs, which needs inline styles/scripts).
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'", "'unsafe-inline'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          imgSrc: ["'self'", 'data:'],
          frameAncestors: ["'none'"],
        },
      },
      crossOriginResourcePolicy: { policy: 'same-site' },
    }),
  );
  app.use(
    cors({
      origin: [config.webUrl],
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-Organization-Id', 'X-Request-Id'],
      exposedHeaders: ['X-Request-Id', 'RateLimit', 'RateLimit-Policy'],
      maxAge: 600,
    }),
  );
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: false, limit: '100kb' }));
  app.use(cookieParser());

  const limiters = createRateLimiters(container.redis, options.disableRateLimits ?? config.isTest);
  const routes = buildRouteTable(container, limiters);
  const openApi = buildOpenApiDocument(routes, config.apiUrl);

  app.get('/api/docs/openapi.json', (_req, res) => {
    res.json(openApi);
  });
  app.use(
    '/api/docs',
    swaggerUi.serve,
    swaggerUi.setup(openApi, { customSiteTitle: 'HireFlow AI API' }),
  );

  app.use('/api', limiters.global, buildApiRouter(container, routes));

  app.use(notFoundHandler());
  app.use(errorHandler(logger));
  return app;
}
