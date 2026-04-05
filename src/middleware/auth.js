const { verifyToken } = require('../lib/auth');
const { UnauthorizedError } = require('../utils/errors');
const config = require('../utils/config');
const pool = require('../lib/db');
const log = require('../utils/logger').create('auth');

async function requireAuth(req, res, next) {
  const header = req.headers.authorization;
  const token = header?.startsWith('Bearer ') ? header.slice(7) : req.cookies?.sulla_token;
  if (!token) throw new UnauthorizedError();

  // Check API key bypass first
  if (config.apiKey && token === config.apiKey) {
    // Find the first user in the system (owner)
    try {
      const { rows } = await pool.query('SELECT id FROM users ORDER BY created_at LIMIT 1');
      if (rows.length > 0) {
        req.userId = rows[0].id;
        req.apiKeyAuth = true;
        log.debug('API key auth bypass', { userId: req.userId });
        return next();
      }
    } catch {}
    throw new UnauthorizedError('No users exist yet — complete onboarding first');
  }

  // Standard JWT auth
  const payload = verifyToken(token);
  if (!payload) throw new UnauthorizedError('Invalid or expired token');

  req.userId = payload.sub;
  next();
}

module.exports = { requireAuth };
