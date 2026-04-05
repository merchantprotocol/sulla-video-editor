const express = require('express');
const path = require('path');
const config = require('./utils/config');
const errorHandler = require('./middleware/errorHandler');
const AuthController = require('./controllers/auth.controller');

const app = express();

// Body parsing
app.use(express.json({ limit: '10mb' }));

// ─── Health ─────────────────────────────────────────────────

app.get('/api/health', async (req, res) => {
  const pool = require('./lib/db');
  try {
    await pool.query('SELECT 1');
    res.json({ status: 'ok', service: 'sulla-video-editor', db: 'connected' });
  } catch {
    res.json({ status: 'ok', service: 'sulla-video-editor', db: 'disconnected' });
  }
});

// ─── Onboarding ─────────────────────────────────────────────

app.get('/api/onboarded', AuthController.onboarded);

// ─── Routes ─────────────────────────────────────────────────

app.use('/api/auth', require('./routes/auth'));
app.use('/api/projects', require('./routes/projects'));
app.use('/api/projects', require('./routes/render'));

// ─── Static files + SPA fallback ────────────────────────────

app.use(express.static(path.join(__dirname, '..', 'public')));
app.get('*', (req, res) => {
  if (req.path.startsWith('/api/')) {
    return res.status(404).json({ error: 'Not found' });
  }
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

// ─── Error handler (must be last) ───────────────────────────

app.use(errorHandler);

// ─── Start ──────────────────────────────────────────────────

app.listen(config.port, '0.0.0.0', () => {
  console.log(`sulla-video-editor running on port ${config.port}`);
});
