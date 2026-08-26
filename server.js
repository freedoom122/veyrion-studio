require('dotenv').config({ override: true });

const express = require('express');
const path = require('path');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const cookieParser = require('cookie-parser');
const { createServer } = require('http');
const { Server: SocketIO } = require('socket.io');

// Config
const apiRoutes = require('./server/routes/api');
const webhookRoutes = require('./server/routes/webhooks/stripe');
const errorHandler = require('./server/middleware/errorHandler');
const logger = require('./server/utils/logger');
const { publicLimiter, apiLimiter } = require('./server/middleware/rateLimiter');

// Database
const { migrate } = require('./server/database/migrate');
const { seed } = require('./server/database/seed');

// Initialize database
migrate();
seed();

const app = express();
const server = createServer(app);
const io = new SocketIO(server, { cors: { origin: process.env.CORS_ORIGIN || '*' } });

// Make io accessible to routes
app.set('io', io);

// Security
app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false,
}));

// CORS
app.use(cors({
  origin: process.env.CORS_ORIGIN || 'http://localhost:3000',
  credentials: true,
}));

// Compression
app.use(compression());

// Logging
app.use(logger);

// Body parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// Rate limiting
app.use('/api/v1/', apiLimiter);

// API routes
app.use('/api/v1', apiRoutes);

// Webhook routes (raw body for Stripe)
app.use('/webhooks', webhookRoutes);

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Static files - serve frontend from /client
app.use(express.static(path.join(__dirname, 'client')));

// Admin panel - serve from /server/admin
app.use('/admin', express.static(path.join(__dirname, 'server', 'admin')));

// SPA fallback for admin
app.get('/admin/*', (req, res) => {
  res.sendFile(path.join(__dirname, 'server', 'admin', 'index.html'));
});

// SPA fallback for frontend
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'client', 'index.html'));
});

// Error handling
app.use(errorHandler);

// Socket.io
io.on('connection', (socket) => {
  console.log('[WS] Client connected:', socket.id);
  socket.on('disconnect', () => {
    console.log('[WS] Client disconnected:', socket.id);
  });
});

// Graceful shutdown
function shutdown(signal) {
  console.log(`\n[${signal}] Shutting down gracefully...`);
  server.close(() => {
    console.log('[SERVER] Closed.');
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10000);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

// Start server
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`\n=== Veyrion Studio ===`);
  console.log(`Server:  http://localhost:${PORT}`);
  console.log(`Admin:   http://localhost:${PORT}/admin`);
  console.log(`API:     http://localhost:${PORT}/api/v1`);
  console.log(`Health:  http://localhost:${PORT}/health`);
  console.log(`======================\n`);
});

module.exports = { app, server, io };
