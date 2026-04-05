const express = require('express');
const pool = require('../lib/db');
const { hashPassword, verifyPassword, createToken, authMiddleware } = require('../lib/auth');

const router = express.Router();

router.post('/register', async (req, res) => {
  try {
    const { name, email, password, org_name } = req.body;
    if (!name || !email || !password || !org_name) {
      return res.status(400).json({ error: 'All fields are required' });
    }
    if (password.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters' });
    }

    const existing = await pool.query('SELECT id FROM users WHERE email = $1', [email]);
    if (existing.rows.length > 0) {
      return res.status(409).json({ error: 'An account with this email already exists' });
    }

    const passwordHash = await hashPassword(password);
    const slug = org_name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const userRes = await client.query('INSERT INTO users (name, email, password_hash) VALUES ($1, $2, $3) RETURNING id', [name, email, passwordHash]);
      const userId = userRes.rows[0].id;
      const orgRes = await client.query('INSERT INTO orgs (name, slug) VALUES ($1, $2) RETURNING id', [org_name, slug]);
      const orgId = orgRes.rows[0].id;
      await client.query('INSERT INTO org_members (org_id, user_id, role) VALUES ($1, $2, $3)', [orgId, userId, 'owner']);
      await client.query("UPDATE app_state SET value = 'true', updated_at = now() WHERE key = 'onboarded'");
      await client.query('COMMIT');

      const token = createToken({ sub: userId, email });
      res.json({ token, user: { id: userId, name, email }, orgs: [{ id: orgId, name: org_name, role: 'owner' }] });
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

router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'Email and password are required' });

    const result = await pool.query('SELECT id, name, email, password_hash, avatar_url FROM users WHERE email = $1', [email]);
    if (result.rows.length === 0) return res.status(401).json({ error: 'Invalid email or password' });

    const user = result.rows[0];
    const valid = await verifyPassword(password, user.password_hash);
    if (!valid) return res.status(401).json({ error: 'Invalid email or password' });

    const orgsResult = await pool.query('SELECT o.id, o.name, m.role FROM org_members m JOIN orgs o ON o.id = m.org_id WHERE m.user_id = $1', [user.id]);
    const token = createToken({ sub: user.id, email });
    res.json({ token, user: { id: user.id, name: user.name, email: user.email, avatar_url: user.avatar_url }, orgs: orgsResult.rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/me', authMiddleware, async (req, res) => {
  try {
    const userResult = await pool.query('SELECT id, name, email, avatar_url FROM users WHERE id = $1', [req.userId]);
    if (userResult.rows.length === 0) return res.status(404).json({ error: 'User not found' });
    const orgsResult = await pool.query('SELECT o.id, o.name, m.role FROM org_members m JOIN orgs o ON o.id = m.org_id WHERE m.user_id = $1', [req.userId]);
    res.json({ user: userResult.rows[0], orgs: orgsResult.rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
