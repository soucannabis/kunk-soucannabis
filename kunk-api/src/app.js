'use strict';

const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const helmet = require('helmet');
const { env } = require('./config/env');
const routes = require('./routes');
const { errorHandler } = require('./middleware/errorHandler');
const { fail } = require('./utils/response');

function createApp() {
  const app = express();
  // Produção (Railway): 1 hop. Fora disso o peer é o cliente — não confiar em X-Forwarded-For.
  app.set('trust proxy', env.nodeEnv === 'production' ? 1 : false);
  app.use(
    helmet({
      contentSecurityPolicy: false,
      crossOriginOpenerPolicy: false,
      xFrameOptions: { action: 'deny' },
      strictTransportSecurity:
        env.nodeEnv === 'production' ? { maxAge: 15552000 } : false,
    })
  );
  app.use(cors({ origin: env.corsOrigin, credentials: true }));
  app.use(express.json({ limit: '8mb' }));
  app.use(express.urlencoded({ extended: true }));
  app.use(cookieParser());

  app.get('/health', (req, res) => {
    res.json({ data: { ok: true }, meta: null, errors: null });
  });

  app.use('/api/v1', routes);

  app.use((req, res) => {
    res.status(404).json(fail('NOT_FOUND', `Rota não encontrada: ${req.method} ${req.path}`));
  });

  app.use(errorHandler);
  return app;
}

module.exports = { createApp };
