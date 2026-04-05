const { AppError } = require('../utils/errors');
const logger = require('../utils/logger').create('error');

function errorHandler(err, req, res, _next) {
  if (err instanceof AppError) {
    if (err.statusCode >= 500) {
      logger.error(err.message, { reqId: req.reqId, stack: err.stack });
    } else {
      logger.warn(err.message, { reqId: req.reqId, status: err.statusCode });
    }
    return res.status(err.statusCode).json({ error: err.message });
  }

  logger.error(`Unhandled: ${err.message}`, {
    reqId: req.reqId,
    stack: err.stack,
    method: req.method,
    path: req.originalUrl,
  });

  res.status(500).json({ error: 'Internal server error' });
}

module.exports = errorHandler;
