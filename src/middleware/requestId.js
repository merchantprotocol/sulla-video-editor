const crypto = require('crypto');
const { logAccess } = require('../utils/logger');

/**
 * Assigns a unique request ID and logs access on response finish.
 */
function requestId(req, res, next) {
  req.reqId = req.headers['x-request-id'] || crypto.randomUUID().slice(0, 8);
  res.setHeader('X-Request-Id', req.reqId);

  const start = Date.now();
  res.on('finish', () => {
    logAccess(req, res, Date.now() - start);
  });

  next();
}

module.exports = requestId;
