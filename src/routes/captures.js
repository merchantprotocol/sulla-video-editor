const express = require('express');
const fs = require('fs').promises;
const path = require('path');
const { capturesDir } = require('../utils/config');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

// GET /api/captures — list all capture sessions
router.get('/', requireAuth, async (req, res, next) => {
  try {
    let entries;
    try {
      entries = await fs.readdir(capturesDir, { withFileTypes: true });
    } catch (err) {
      if (err.code === 'ENOENT') {
        return res.json({ captures: [] });
      }
      throw err;
    }

    const captures = [];

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;

      const sessionDir = path.join(capturesDir, entry.name);
      const manifestPath = path.join(sessionDir, 'manifest.json');

      let manifest;
      try {
        const raw = await fs.readFile(manifestPath, 'utf8');
        manifest = JSON.parse(raw);
      } catch {
        // Skip folders without a valid manifest
        continue;
      }

      // Determine the primary file path
      const streams = manifest.streams || [];
      const screenStream = streams.find(s => s.type === 'screen');
      const cameraStream = streams.find(s => s.type === 'camera');
      const firstWebm = streams.find(s => s.format === 'webm' || s.filename?.endsWith('.webm'));

      const primaryStream = screenStream || cameraStream || firstWebm;
      const primaryFilePath = primaryStream
        ? path.join(sessionDir, primaryStream.filename)
        : null;

      captures.push({
        id: entry.name,
        sessionDir,
        startedAt: manifest.startedAt,
        duration: manifest.duration,
        totalBytes: manifest.totalBytes,
        streams,
        primaryFilePath,
      });
    }

    // Sort newest first
    captures.sort((a, b) => {
      const ta = a.startedAt ? new Date(a.startedAt).getTime() : 0;
      const tb = b.startedAt ? new Date(b.startedAt).getTime() : 0;
      return tb - ta;
    });

    res.json({ captures });
  } catch (err) {
    next(err);
  }
});

// GET /api/captures/:id/media/:filename — stream a capture file (no auth — video tag can't send headers)
router.get('/:id/media/:filename', async (req, res, next) => {
  try {
    const { id, filename } = req.params;

    // Security: prevent path traversal
    if (!/^[a-zA-Z0-9_-]+$/.test(id)) {
      return res.status(400).json({ error: 'Invalid capture id' });
    }
    if (!/^[a-zA-Z0-9_.-]+$/.test(filename)) {
      return res.status(400).json({ error: 'Invalid filename' });
    }

    const filePath = path.join(capturesDir, id, filename);

    // Check file exists
    try {
      await fs.access(filePath);
    } catch {
      return res.status(404).json({ error: 'File not found' });
    }

    res.sendFile(filePath);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
