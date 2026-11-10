const path = require('path');
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const cookieParser = require('cookie-parser');
const { createServer } = require('http');

// Load env
try { require('dotenv').config({ override: true }); } catch (_) {}

async function main() {
  const { initDatabase, getDb } = require('./server/config/database');
  await initDatabase();

  const User = require('./server/models/User');
  const Product = require('./server/models/Product');
  const Order = require('./server/models/Order');
  const License = require('./server/models/License');
  const Cart = require('./server/models/Cart');
  const Ticket = require('./server/models/Ticket');
  const apiRoutes = require('./server/routes/api');
  const webhookRoutes = require('./server/routes/webhooks/stripe');
  const errorHandler = require('./server/middleware/errorHandler');
  const logger = require('./server/utils/logger');
  const { apiLimiter } = require('./server/middleware/rateLimiter');
  const { securityMiddleware } = require('./server/middleware/security');

  const { migrate } = require('./server/database/migrate');
  const { seed } = require('./server/database/seed');
  const { migrateSecureAdmin } = require('./server/database/secureAdmin');
  migrate();
  seed();
  migrateSecureAdmin();

  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 1);
  const server = createServer(app);

  app.use(securityMiddleware);

  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "https://cdn.jsdelivr.net", "https://translate.google.com", "https://translate.googleapis.com"],
        styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
        fontSrc: ["'self'", "https://fonts.gstatic.com", "data:"],
        imgSrc: ["'self'", "data:", "https:"],
        connectSrc: ["'self'", "https:"],
        objectSrc: ["'none'"],
        baseUri: ["'self'"],
        frameAncestors: ["'none'"],
        formAction: ["'self'"],
      },
    },
    crossOriginEmbedderPolicy: false,
  }));

  const configuredOrigins = (process.env.CORS_ORIGIN || process.env.FRONTEND_URL || '')
    .split(',')
    .map((origin) => origin.trim().replace(/\/$/, ''))
    .filter(Boolean);

  if (process.env.NODE_ENV === 'production' && configuredOrigins.length === 0) {
    throw new Error('CORS_ORIGIN or FRONTEND_URL must be configured in production.');
  }

  app.use(cors({
    origin(origin, callback) {
      if (!origin) return callback(null, true);
      if (configuredOrigins.includes(origin)) return callback(null, true);
      return callback(new Error('Origin is not allowed by CORS'));
    },
    credentials: true,
  }));

  app.use(compression());
  app.use(logger);

  app.use(express.json({ limit: '1mb', strict: true }));
  app.use(express.urlencoded({ extended: false, limit: '100kb' }));
  app.use(cookieParser());

  app.use('/api/v1/', apiLimiter);
  app.use('/api/v1', apiRoutes);
  app.use('/webhooks', webhookRoutes);

  app.get('/health', (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  app.use(express.static(path.join(__dirname, 'client'), {
    dotfiles: 'deny',
    index: 'index.html',
    etag: true,
    maxAge: process.env.NODE_ENV === 'production' ? '1h' : 0,
  }));

  app.use('/admin', express.static(path.join(__dirname, 'server', 'admin'), {
    dotfiles: 'deny',
    index: 'index.html',
  }));

  app.get('/admin/*', (req, res) => {
    res.sendFile(path.join(__dirname, 'server', 'admin', 'index.html'));
  });

  app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'client', 'index.html'));
  });

  app.use(errorHandler);

  function shutdown(signal) {
    console.log(`\\n[${signal}] Shutting down gracefully...`);
    const { _save } = require('./server/config/database');
    _save();
    server.close(() => {
      console.log('[SERVER] Closed.');
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 10000);
  }

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

  const PORT = process.env.PORT || 3000;
  server.listen(PORT, '0.0.0.0', () => {
    console.log('\\n=== Veyrion Studio ===');
    console.log(`Server:  http://localhost:${PORT}`);
    console.log(`Admin:   http://localhost:${PORT}/admin`);
    console.log(`API:     http://localhost:${PORT}/api/v1`);
    console.log(`Health:  http://localhost:${PORT}/health`);
    console.log('======================\\n');
  });
}

main().catch((err) => {
  console.error('[FATAL] Failed to start:', err);
  process.exit(1);
});
