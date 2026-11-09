import cookieParser from 'cookie-parser';
import express, { type NextFunction, type Request, type Response } from 'express';
import helmet from 'helmet';
import { registrationsRouter } from './admin/registrations.js';
import { authRouter } from './auth/routes.js';
import { loadSession } from './auth/session.js';
import { config } from './config.js';
import { logger } from './logger.js';
import { requestsRouter, serviceTypesRouter, uploadsRouter } from './requests/routes.js';
import { settingsRouter } from './settings.js';

export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  if (config.TRUST_PROXY) app.set('trust proxy', 1);

  app.use(helmet());
  app.use(express.json({ limit: '100kb' }));
  app.use(cookieParser());
  app.use(loadSession);

  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok' });
  });
  app.use('/api/auth', authRouter);
  app.use('/api/admin/registrations', registrationsRouter);

  // Request data may include PHI: never cache it in the browser or a proxy.
  app.use(['/api/requests', '/api/uploads', '/api/settings'], (_req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    next();
  });
  app.use('/api/service-types', serviceTypesRouter);
  app.use('/api/uploads', uploadsRouter);
  app.use('/api/requests', requestsRouter);
  app.use('/api/settings', settingsRouter);

  app.use('/api', (_req, res) => {
    res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Not found.' } });
  });

  // Express 5 forwards async errors here; the client never sees internal detail.
  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    logger.error({ err }, 'unhandled error');
    res.status(500).json({ error: { code: 'SERVER_ERROR', message: 'Something went wrong. Please try again.' } });
  });

  return app;
}
