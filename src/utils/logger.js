const fs = require('fs');
const path = require('path');

const LOG_DIR = process.env.LOG_DIR || path.join(__dirname, '..', '..', 'logs');
const LOG_LEVEL = process.env.LOG_LEVEL || 'info';
const PID = process.pid;

const LEVELS = { debug: 0, info: 1, warn: 2, error: 3 };
const currentLevel = LEVELS[LOG_LEVEL] ?? LEVELS.info;

// Ensure log directory exists
try { fs.mkdirSync(LOG_DIR, { recursive: true }); } catch {}

// Log file streams
const streams = {
  app: createStream('app.log'),
  error: createStream('error.log'),
  access: createStream('access.log'),
};

function createStream(filename) {
  return fs.createWriteStream(path.join(LOG_DIR, filename), { flags: 'a' });
}

function formatTimestamp() {
  return new Date().toISOString();
}

function formatMessage(level, tag, message, meta) {
  const metaStr = meta && Object.keys(meta).length > 0 ? ' ' + JSON.stringify(meta) : '';
  return `${formatTimestamp()} [${level.toUpperCase().padEnd(5)}] [pid:${PID}] [${tag}] ${message}${metaStr}`;
}

function write(level, tag, message, meta = {}) {
  if (LEVELS[level] < currentLevel) return;

  const line = formatMessage(level, tag, message, meta) + '\n';

  // Always write to app.log
  streams.app.write(line);

  // Errors also go to error.log
  if (level === 'error' || level === 'warn') {
    streams.error.write(line);
  }

  // Also write to stdout/stderr for Docker log collection
  if (level === 'error') {
    process.stderr.write(line);
  } else {
    process.stdout.write(line);
  }
}

/**
 * Create a tagged logger instance.
 * Usage: const log = logger.create('auth')
 *        log.info('User logged in', { userId: '123' })
 *
 * Output: 2026-04-05T02:30:00.000Z [INFO ] [pid:12345] [auth] User logged in {"userId":"123"}
 */
function create(tag) {
  return {
    debug: (msg, meta) => write('debug', tag, msg, meta),
    info: (msg, meta) => write('info', tag, msg, meta),
    warn: (msg, meta) => write('warn', tag, msg, meta),
    error: (msg, meta) => write('error', tag, msg, meta),
  };
}

/**
 * Log an HTTP request (access log).
 * Output: 2026-04-05T02:30:00.000Z [INFO ] [pid:12345] [http] POST /api/auth/login 200 12ms {"reqId":"abc-123"}
 */
function logAccess(req, res, durationMs) {
  const line = formatMessage('info', 'http',
    `${req.method} ${req.originalUrl} ${res.statusCode} ${durationMs}ms`,
    { reqId: req.reqId, ip: req.ip }
  ) + '\n';

  streams.access.write(line);
  streams.app.write(line);

  if (res.statusCode >= 400) {
    streams.error.write(line);
  }
}

module.exports = { create, logAccess, LEVELS, LOG_DIR };
