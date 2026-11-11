const path = require('path');
const errorCatalog = require('../config/errorCatalog');

function errorHandler(err, req, res, _next) {
  const requestId = req.id || 'unavailable';
  console.error(`[ERROR] ${requestId} ${req.method} ${req.path}: ${err.message}`);

  let status = Number(err.status || err.statusCode || 500);
  if (err.type === 'entity.parse.failed') status = 400;
  if (err.code === 'LIMIT_FILE_SIZE') status = 413;
  if (err.name === 'ZodError') status = 400;
  if (!Number.isInteger(status) || status < 400 || status > 599) status = 500;

  const entry = errorCatalog[String(status)] || errorCatalog['500'];
  const apiError = req.path.startsWith('/api/') || req.path.startsWith('/webhooks/');
  if (apiError) {
    const details = err.name === 'ZodError'
      ? (err.issues || err.errors || []).map((item) => ({ field: (item.path || []).join('.'), message: item.message }))
      : undefined;
    return res.status(status).json({
      success: false,
      error: {
        code: err.code || entry.code || 'SERVER_ERROR',
        message: status >= 500 ? entry.message : (err.message || entry.message),
        ...(details ? { details } : {}),
      },
      requestId,
    });
  }

  if (req.path.startsWith('/errors/')) {
    return res.status(status).type('text/plain').send(entry.title + ' (' + status + ').');
  }
  return res.redirect(302, '/errors/' + status + '?from=' + encodeURIComponent(req.originalUrl));
}

module.exports = errorHandler;
