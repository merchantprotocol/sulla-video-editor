const express = require('express');
const path = require('path');

const app = express();
const PORT = 8081;

app.use(express.json());

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', service: 'sulla-video-editor', timestamp: new Date().toISOString() });
});

// API routes will be added here
// - /api/auth/*
// - /api/projects/*
// - /api/orgs/*
// - /api/render/*

// Catch-all: serve React SPA
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
