const express = require('express');
const path = require('path');
const crypto = require('crypto');

const app = express();
const PORT = 8081;

app.use(express.json());

// Database
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL || 'postgresql://sulla:sulla@localhost:5432/sulla_video' });

// JWT secret
const JWT_SECRET = process.env.JWT_SECRET || 'sulla-local-dev-secret';

// ─── Crypto helpers ─────────────────────────────────────────

async function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.pbkdf2Sync(password, salt, 100000, 64, 'sha256').toString('hex');
  return `${salt}:${hash}`;
}

async function verifyPassword(password, stored) {
  const [salt, hash] = stored.split(':');
  const test = crypto.pbkdf2Sync(password, salt, 100000, 64, 'sha256').toString('hex');
  return test === hash;
}

function createToken(payload) {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const body = Buffer.from(JSON.stringify({ ...payload, exp: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 30 })).toString('base64url'); // 30 days
  const sig = crypto.createHmac('sha256', JWT_SECRET).update(`${header}.${body}`).digest('base64url');
  return `${header}.${body}.${sig}`;
}

function verifyToken(token) {
  try {
    const [header, body, sig] = token.split('.');
    const expected = crypto.createHmac('sha256', JWT_SECRET).update(`${header}.${body}`).digest('base64url');
    if (sig !== expected) return null;
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString());
    if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch { return null; }
}

// ─── Auth middleware ────────────────────────────────────────

function auth(req, res, next) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) return res.status(401).json({ error: 'Unauthorized' });
  const payload = verifyToken(header.slice(7));
  if (!payload) return res.status(401).json({ error: 'Invalid token' });
  req.userId = payload.sub;
  next();
}

// ─── Health ─────────────────────────────────────────────────

app.get('/api/health', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ status: 'ok', service: 'sulla-video-editor', db: 'connected' });
  } catch (err) {
    res.json({ status: 'ok', service: 'sulla-video-editor', db: 'disconnected' });
  }
});

// ─── Auth routes ────────────────────────────────────────────

app.post('/api/auth/register', async (req, res) => {
  try {
    const { name, email, password, org_name } = req.body;
    if (!name || !email || !password || !org_name) {
      return res.status(400).json({ error: 'All fields are required' });
    }
    if (password.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters' });
    }

    // Check existing
    const existing = await pool.query('SELECT id FROM users WHERE email = $1', [email]);
    if (existing.rows.length > 0) {
      return res.status(409).json({ error: 'An account with this email already exists' });
    }

    const passwordHash = await hashPassword(password);
    const slug = org_name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const userRes = await client.query(
        'INSERT INTO users (name, email, password_hash) VALUES ($1, $2, $3) RETURNING id',
        [name, email, passwordHash]
      );
      const userId = userRes.rows[0].id;

      const orgRes = await client.query(
        'INSERT INTO orgs (name, slug) VALUES ($1, $2) RETURNING id',
        [org_name, slug]
      );
      const orgId = orgRes.rows[0].id;

      await client.query(
        'INSERT INTO org_members (org_id, user_id, role) VALUES ($1, $2, $3)',
        [orgId, userId, 'owner']
      );

      // Mark as onboarded
      await client.query(
        "UPDATE app_state SET value = 'true', updated_at = now() WHERE key = 'onboarded'"
      );

      await client.query('COMMIT');

      const token = createToken({ sub: userId, email });
      res.json({
        token,
        user: { id: userId, name, email },
        orgs: [{ id: orgId, name: org_name, role: 'owner' }],
      });
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  } catch (err) {
    console.error('Register error:', err);
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    const result = await pool.query('SELECT id, name, email, password_hash, avatar_url FROM users WHERE email = $1', [email]);
    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const user = result.rows[0];
    const valid = await verifyPassword(password, user.password_hash);
    if (!valid) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const orgsResult = await pool.query(
      'SELECT o.id, o.name, m.role FROM org_members m JOIN orgs o ON o.id = m.org_id WHERE m.user_id = $1',
      [user.id]
    );

    const token = createToken({ sub: user.id, email });
    res.json({
      token,
      user: { id: user.id, name: user.name, email: user.email, avatar_url: user.avatar_url },
      orgs: orgsResult.rows,
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/auth/me', auth, async (req, res) => {
  try {
    const userResult = await pool.query('SELECT id, name, email, avatar_url FROM users WHERE id = $1', [req.userId]);
    if (userResult.rows.length === 0) return res.status(404).json({ error: 'User not found' });

    const orgsResult = await pool.query(
      'SELECT o.id, o.name, m.role FROM org_members m JOIN orgs o ON o.id = m.org_id WHERE m.user_id = $1',
      [req.userId]
    );

    res.json({ user: userResult.rows[0], orgs: orgsResult.rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Onboarding state ───────────────────────────────────────

app.get('/api/onboarded', async (req, res) => {
  try {
    const result = await pool.query("SELECT value FROM app_state WHERE key = 'onboarded'");
    const onboarded = result.rows[0]?.value === 'true' || result.rows[0]?.value === true;
    res.json({ onboarded });
  } catch {
    res.json({ onboarded: false });
  }
});

// ─── Static files + SPA fallback ────────────────────────────

app.use(express.static(path.join(__dirname, '..', 'public')));
app.get('*', (req, res) => {
  if (req.path.startsWith('/api/')) {
    return res.status(404).json({ error: 'Not found' });
  }
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`sulla-video-editor running on port ${PORT}`);
});
