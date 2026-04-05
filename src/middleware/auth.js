const { verifyToken } = require('../lib/auth');
const { UnauthorizedError } = require('../utils/errors');

function requireAuth(req, res, next) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) throw new UnauthorizedError();

  const payload = verifyToken(header.slice(7));
  if (!payload) throw new UnauthorizedError('Invalid or expired token');

  req.userId = payload.sub;
  next();
}

module.exports = { requireAuth };
