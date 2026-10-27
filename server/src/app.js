import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import mongoose from 'mongoose';
import { config } from './config.js';
import { errorHandler, notFound } from './middleware/errors.js';
import authRoutes from './routes/auth.js';
import userRoutes from './routes/users.js';
import incidentRoutes from './routes/incidents.js';
import integrationRoutes from './routes/integrations.js';
import webhookRoutes from './routes/webhooks.js';
import publicRoutes from './routes/public.js';
import configRoutes from './routes/config.js';
import { redis } from './redis.js';

export function createApp() {
  const app = express();
  if (config.NODE_ENV === 'production') app.set('trust proxy', 1);
  app.disable('x-powered-by');
  app.use(
    helmet({
      contentSecurityPolicy: {
        useDefaults: true,
        directives: {
          'script-src': ["'self'"],
          'connect-src': ["'self'", 'ws:', 'wss:'],
          'upgrade-insecure-requests': null, // lets the production build also be tried over plain http locally
        },
      },
    })
  );
  app.use(cors({ origin: config.CLIENT_ORIGIN, credentials: true }));
  app.use(express.json({ limit: '256kb' }));
  app.use(cookieParser());

  app.get('/api/health', async (req, res) => {
    const mongo = mongoose.connection.readyState === 1;
    let cache = false;
    try {
      cache = (await redis().ping()) === 'PONG';
    } catch {
      /* reported below */
    }
    res.status(mongo && cache ? 200 : 503).json({ ok: mongo && cache, mongo, redis: cache, uptime: Math.round(process.uptime()) });
  });

  app.use('/api/config', configRoutes);
  app.use('/api/auth', authRoutes);
  app.use('/api/users', userRoutes);
  app.use('/api/integrations', integrationRoutes);
  app.use('/api/webhooks', webhookRoutes);
  app.use('/api/public', publicRoutes);
  app.use('/api', incidentRoutes);

  // In production one service serves the built React app too, so the app, the API, the
  // login cookie and the WebSocket all share a single origin.
  const dist = process.env.CLIENT_DIST || path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../public');
  if (fs.existsSync(path.join(dist, 'index.html'))) {
    app.use(express.static(dist, { index: false, maxAge: '1h' }));
    app.get(/^\/(?!api\/|socket\.io\/).*/, (req, res) => res.sendFile(path.join(dist, 'index.html')));
  }

  app.use(notFound);
  app.use(errorHandler);
  return app;
}
