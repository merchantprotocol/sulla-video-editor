const express = require('express');
const path = require('path');
const pool = require('./lib/db');

const app = express();
const PORT = 8081;

// Body parsing
app.use(express.json({ limit: '10mb' }));

// ─── Health ─────────────────────────────────────────────────

app.get('/api/health', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ status: 'ok', service: 'sulla-video-editor', db: 'connected' });
  } catch {
    res.json({ status: 'ok', service: 'sulla-video-editor', db: 'disconnected' });
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

// ─── Routes ─────────────────────────────────────────────────

app.use('/api/auth', require('./routes/auth'));
app.use('/api/projects', require('./routes/projects'));

// ─── Static files + SPA fallback ────────────────────────────

app.use(express.static(path.join(__dirname, '..', 'public')));
app.get('*', (req, res) => {
  if (req.path.startsWith('/api/')) {
    return res.status(404).json({ error: 'Not found' });
  }
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

// ─── Start ──────────────────────────────────────────────────

app.listen(PORT, '0.0.0.0', () => {
  console.log(`sulla-video-editor running on port ${PORT}`);
});
