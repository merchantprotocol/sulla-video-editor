const express = require('express');
const path = require('path');
const fs = require('fs/promises');
const { existsSync, createWriteStream } = require('fs');
const pool = require('../lib/db');
const { authMiddleware } = require('../lib/auth');
const { extractMetadata, extractAudio, generateThumbnails } = require('../services/media');
const { transcribe } = require('../services/transcribe');

const router = express.Router();
router.use(authMiddleware);

const STORAGE_ROOT = path.join(__dirname, '..', '..', 'storage', 'projects');

// Helper: get user's current org
async function getUserOrg(userId) {
  const result = await pool.query(
    'SELECT o.id FROM org_members m JOIN orgs o ON o.id = m.org_id WHERE m.user_id = $1 ORDER BY m.created_at LIMIT 1',
    [userId]
  );
  return result.rows[0]?.id;
}

// Helper: ensure project belongs to user's org
async function getProject(projectId, userId) {
  const orgId = await getUserOrg(userId);
  if (!orgId) return null;
  const result = await pool.query('SELECT * FROM projects WHERE id = $1 AND org_id = $2', [projectId, orgId]);
  return result.rows[0] || null;
}

// Helper: project storage path
function projectPath(projectId, ...segments) {
  return path.join(STORAGE_ROOT, projectId, ...segments);
}

// ─── List projects ──────────────────────────────────────────

router.get('/', async (req, res) => {
  try {
    const orgId = await getUserOrg(req.userId);
    if (!orgId) return res.json({ projects: [] });

    const result = await pool.query(
      `SELECT id, name, status, rule_template, duration_ms, resolution, file_size, created_at, updated_at
       FROM projects WHERE org_id = $1 ORDER BY updated_at DESC`,
      [orgId]
    );
    res.json({ projects: result.rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Create project ─────────────────────────────────────────

router.post('/', async (req, res) => {
  try {
    const { name, rule_template } = req.body;
    if (!name) return res.status(400).json({ error: 'Project name is required' });

    const orgId = await getUserOrg(req.userId);
    if (!orgId) return res.status(400).json({ error: 'No organization found' });

    const result = await pool.query(
      'INSERT INTO projects (org_id, name, rule_template, created_by) VALUES ($1, $2, $3, $4) RETURNING *',
      [orgId, name, rule_template || null, req.userId]
    );
    const project = result.rows[0];

    // Create storage directories
    await fs.mkdir(projectPath(project.id, 'media', 'thumbnails'), { recursive: true });
    await fs.mkdir(projectPath(project.id, 'data'), { recursive: true });
    await fs.mkdir(projectPath(project.id, 'exports'), { recursive: true });

    res.json({ project });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Get project ────────────────────────────────────────────

router.get('/:id', async (req, res) => {
  try {
    const project = await getProject(req.params.id, req.userId);
    if (!project) return res.status(404).json({ error: 'Project not found' });

    // Check what data files exist
    const hasTranscript = existsSync(projectPath(project.id, 'data', 'transcript.json'));
    const hasEdl = existsSync(projectPath(project.id, 'data', 'edl.json'));
    const hasSuggestions = existsSync(projectPath(project.id, 'data', 'suggestions.json'));

    res.json({ project, files: { hasTranscript, hasEdl, hasSuggestions } });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Update project ─────────────────────────────────────────

router.put('/:id', async (req, res) => {
  try {
    const project = await getProject(req.params.id, req.userId);
    if (!project) return res.status(404).json({ error: 'Project not found' });

    const { name, status, rule_template } = req.body;
    const result = await pool.query(
      `UPDATE projects SET
        name = COALESCE($1, name),
        status = COALESCE($2, status),
        rule_template = COALESCE($3, rule_template),
        updated_at = now()
       WHERE id = $4 RETURNING *`,
      [name, status, rule_template, project.id]
    );
    res.json({ project: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Delete project ─────────────────────────────────────────

router.delete('/:id', async (req, res) => {
  try {
    const project = await getProject(req.params.id, req.userId);
    if (!project) return res.status(404).json({ error: 'Project not found' });

    await pool.query('DELETE FROM projects WHERE id = $1', [project.id]);

    // Remove storage
    const dir = projectPath(project.id);
    if (existsSync(dir)) {
      await fs.rm(dir, { recursive: true, force: true });
    }

    res.json({ deleted: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Import media ───────────────────────────────────────────

router.post('/:id/import', async (req, res) => {
  try {
    const project = await getProject(req.params.id, req.userId);
    if (!project) return res.status(404).json({ error: 'Project not found' });

    // Read raw body as file upload
    const contentType = req.headers['content-type'] || '';
    if (!contentType.includes('multipart') && !contentType.includes('octet-stream')) {
      return res.status(400).json({ error: 'Expected file upload' });
    }

    const filename = req.headers['x-filename'] || 'source.mp4';
    const ext = path.extname(filename) || '.mp4';
    const sourcePath = projectPath(project.id, 'media', `source${ext}`);

    // Stream upload to disk
    await new Promise((resolve, reject) => {
      const ws = createWriteStream(sourcePath);
      req.pipe(ws);
      ws.on('finish', resolve);
      ws.on('error', reject);
    });

    // Extract metadata with ffprobe
    const metadata = await extractMetadata(sourcePath);

    // Extract audio for transcription
    const audioPath = projectPath(project.id, 'media', 'audio.wav');
    await extractAudio(sourcePath, audioPath);

    // Generate thumbnails
    const thumbDir = projectPath(project.id, 'media', 'thumbnails');
    await generateThumbnails(sourcePath, thumbDir);

    // Update DB
    await pool.query(
      `UPDATE projects SET
        media_path = $1, duration_ms = $2, resolution = $3, file_size = $4,
        status = 'editing', updated_at = now()
       WHERE id = $5`,
      [sourcePath, metadata.duration_ms, metadata.resolution, metadata.file_size, project.id]
    );

    res.json({
      status: 'imported',
      duration_ms: metadata.duration_ms,
      resolution: metadata.resolution,
      file_size: metadata.file_size,
      format: metadata.format,
    });
  } catch (err) {
    console.error('Import error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ─── Transcribe ─────────────────────────────────────────────

router.post('/:id/transcribe', async (req, res) => {
  try {
    const project = await getProject(req.params.id, req.userId);
    if (!project) return res.status(404).json({ error: 'Project not found' });

    const audioPath = projectPath(project.id, 'media', 'audio.wav');
    if (!existsSync(audioPath)) {
      return res.status(400).json({ error: 'No audio file found. Import media first.' });
    }

    const transcriptPath = projectPath(project.id, 'data', 'transcript.json');

    // Run whisper.cpp
    const transcript = await transcribe(audioPath);

    // Write transcript
    await fs.writeFile(transcriptPath, JSON.stringify(transcript, null, 2));

    // Update DB
    await pool.query(
      "UPDATE projects SET transcript_path = $1, updated_at = now() WHERE id = $2",
      [transcriptPath, project.id]
    );

    res.json({ status: 'transcribed', word_count: transcript.words.length, duration_ms: transcript.duration_ms });
  } catch (err) {
    console.error('Transcribe error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ─── Get transcript ─────────────────────────────────────────

router.get('/:id/transcript', async (req, res) => {
  try {
    const project = await getProject(req.params.id, req.userId);
    if (!project) return res.status(404).json({ error: 'Project not found' });

    const transcriptPath = projectPath(project.id, 'data', 'transcript.json');
    if (!existsSync(transcriptPath)) {
      return res.status(404).json({ error: 'No transcript yet. Run transcription first.' });
    }

    const data = await fs.readFile(transcriptPath, 'utf-8');
    res.json(JSON.parse(data));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Get/Save EDL ───────────────────────────────────────────

router.get('/:id/edl', async (req, res) => {
  try {
    const project = await getProject(req.params.id, req.userId);
    if (!project) return res.status(404).json({ error: 'Project not found' });

    const edlPath = projectPath(project.id, 'data', 'edl.json');
    if (!existsSync(edlPath)) {
      return res.json({ version: 1, cuts: [], reorder: [], inserts: [] });
    }

    const data = await fs.readFile(edlPath, 'utf-8');
    res.json(JSON.parse(data));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/:id/edl', async (req, res) => {
  try {
    const project = await getProject(req.params.id, req.userId);
    if (!project) return res.status(404).json({ error: 'Project not found' });

    const edlPath = projectPath(project.id, 'data', 'edl.json');
    await fs.writeFile(edlPath, JSON.stringify(req.body, null, 2));
    await pool.query("UPDATE projects SET updated_at = now() WHERE id = $1", [project.id]);

    res.json({ saved: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Get suggestions ────────────────────────────────────────

router.get('/:id/suggestions', async (req, res) => {
  try {
    const project = await getProject(req.params.id, req.userId);
    if (!project) return res.status(404).json({ error: 'Project not found' });

    const sugPath = projectPath(project.id, 'data', 'suggestions.json');
    if (!existsSync(sugPath)) {
      return res.json({ suggestions: [] });
    }

    const data = await fs.readFile(sugPath, 'utf-8');
    res.json(JSON.parse(data));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── List exports ───────────────────────────────────────────

router.get('/:id/exports', async (req, res) => {
  try {
    const project = await getProject(req.params.id, req.userId);
    if (!project) return res.status(404).json({ error: 'Project not found' });

    const exportsDir = projectPath(project.id, 'exports');
    if (!existsSync(exportsDir)) return res.json({ exports: [] });

    const files = await fs.readdir(exportsDir);
    const exports = [];
    for (const file of files) {
      const stat = await fs.stat(path.join(exportsDir, file));
      exports.push({ name: file, size: stat.size, created_at: stat.mtime });
    }
    res.json({ exports });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Serve media files ──────────────────────────────────────

router.get('/:id/media/:filename', async (req, res) => {
  try {
    const project = await getProject(req.params.id, req.userId);
    if (!project) return res.status(404).json({ error: 'Project not found' });

    const filePath = projectPath(project.id, 'media', req.params.filename);
    if (!existsSync(filePath)) return res.status(404).json({ error: 'File not found' });

    res.sendFile(filePath);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/:id/media/thumbnails/:filename', async (req, res) => {
  try {
    const project = await getProject(req.params.id, req.userId);
    if (!project) return res.status(404).json({ error: 'Project not found' });

    const filePath = projectPath(project.id, 'media', 'thumbnails', req.params.filename);
    if (!existsSync(filePath)) return res.status(404).json({ error: 'File not found' });

    res.sendFile(filePath);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
