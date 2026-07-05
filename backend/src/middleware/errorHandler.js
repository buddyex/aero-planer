const systemLogger = require('../lib/system-logger');

function errorHandler(err, req, res, _next) {
  const message = err.sqlMessage || err.message || 'Внутренняя ошибка сервера.';
  const status = err.status || (err.code === 'FORBIDDEN' ? 403 : err.code === 'UNAUTHORIZED' ? 401 : 500);

  if (process.env.NODE_ENV !== 'production') {
    console.error('[API Error]', err);
  }

  if (status >= 500) {
    systemLogger.logSystemError({
      subsystem: 'api',
      location: `${req.method} ${req.originalUrl || req.url}`,
      error: err,
      phase: 'runtime',
      context: {
        status,
        operatorId: req.operatorId,
        role: req.user?.role,
      },
    });
  }

  res.status(status).json({
    ok: false,
    error: err.code || 'SERVER_ERROR',
    message,
  });
}

module.exports = { errorHandler };
