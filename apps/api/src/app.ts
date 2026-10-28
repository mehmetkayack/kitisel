import { randomUUID } from 'node:crypto';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import { pinoHttp } from 'pino-http';
import swaggerUi from 'swagger-ui-express';
import type { AppDeps } from './deps';
import { errorHandler, notFoundHandler } from './middleware/error-handler';
import { localeMiddleware } from './middleware/locale';
import { RATE_LIMITS } from './middleware/rate-limit';
import { authRoutes } from './modules/auth/auth.routes';
import { healthRoutes } from './modules/health/health.routes';
import { meRoutes } from './modules/me/me.routes';
import { adminRoutes } from './modules/admin/admin.routes';
import { connectionCallbackRoutes, contentRoutes, sitesRoutes } from './modules/sites/sites.routes';
import { freeAnalysisRoutes } from './modules/free-analysis/free-analysis.routes';
import { contactRoutes } from './modules/contact/contact.routes';
import { blogRoutes } from './modules/blog/blog.routes';
import { testimonialsRoutes } from './modules/testimonials/testimonials.routes';
import { billingRoutes } from './modules/billing/billing.routes';
import { createBillingService } from './modules/billing/billing.service';
import { buildOpenApiDocument } from './openapi';

export function createApp(deps: AppDeps): express.Express {
  const { env } = deps;
  const app = express();

  app.disable('x-powered-by');
  // Nginx / yük dengeleyici arkasında gerçek istemci IP'si (rate limit ve audit log için)
  app.set('trust proxy', env.NODE_ENV === 'production' ? 1 : 'loopback');

  app.use(
    pinoHttp({
      logger: deps.logger,
      genReqId: (req, res) => {
        const incoming = req.headers['x-request-id'];
        const id = typeof incoming === 'string' && /^[\w-]{8,64}$/.test(incoming) ? incoming : randomUUID();
        res.setHeader('x-request-id', id);
        return id;
      },
      autoLogging: { ignore: (req) => req.url === '/api/health' },
    }),
  );
  app.use(
    helmet({
      contentSecurityPolicy: {
        // API JSON döner; Swagger UI sadece geliştirmede açıktır ve inline stil kullanır.
        directives: {
          defaultSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          imgSrc: ["'self'", 'data:'],
          frameAncestors: ["'none'"],
        },
      },
    }),
  );
  app.use(cors({ origin: env.WEB_URL, credentials: true }));
  app.use(compression());
  app.use(express.json({ limit: '1mb' }));
  app.use(cookieParser());
  app.use(localeMiddleware);

  app.use('/api/health', healthRoutes(deps));

  const billing = createBillingService({ env, logger: deps.logger, sequelize: deps.sequelize, mailer: deps.mailer, fetch: deps.fetch });
  const v1 = express.Router();
  v1.use(deps.rateLimiter(RATE_LIMITS.api));
  v1.use('/auth', authRoutes(deps));
  v1.use('/me', meRoutes(deps));
  v1.use('/admin', adminRoutes(deps, billing));
  v1.use('/sites', sitesRoutes(deps));
  v1.use('/content', contentRoutes(deps));
  v1.use('/free-analyses', freeAnalysisRoutes(deps));
  v1.use('/contact', contactRoutes(deps));
  v1.use('/blog', blogRoutes(deps));
  v1.use('/testimonials', testimonialsRoutes(deps));
  v1.use('/billing', billingRoutes(deps, billing));
  v1.use('/connections', connectionCallbackRoutes(deps));
  app.use('/api/v1', v1);

  if (env.NODE_ENV === 'development') {
    const doc = buildOpenApiDocument();
    app.get('/api/docs.json', (_req, res) => res.json(doc));
    app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(doc));
  }

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
