function errorHandler(err, req, res, _next) {
  console.error(`[ERROR] ${req.method} ${req.path}:`, err.message);

  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({
      success: false,
      error: { code: 'INVALID_JSON', message: 'Invalid JSON in request body' }
    });
  }

  if (err.code === 'LIMIT_FILE_SIZE') {
    return res.status(413).json({
      success: false,
      error: { code: 'FILE_TOO_LARGE', message: 'File exceeds maximum size limit' }
    });
  }

  if (err.name === 'ZodError') {
    return res.status(400).json({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Invalid input',
        details: err.errors.map(e => ({ field: e.path.join('.'), message: e.message }))
      }
    });
  }

  const status = err.status || 500;
  const message = status === 500 ? 'Internal server error' : err.message;

  res.status(status).json({
    success: false,
    error: { code: err.code || 'SERVER_ERROR', message }
  });
}

module.exports = errorHandler;
