const express = require('express');
const path = require('path');
const fs = require('fs/promises');
const { requireAuth } = require('../middleware/auth');
const { generateConversation, listVoices, AUDIO_FILTERS } = require('../services/tts.service');
const ProjectRepository = require('../repositories/project.repository');
const OrgRepository = require('../repositories/org.repository');
const { NotFoundError, ValidationError } = require('../utils/errors');
const config = require('../utils/config');
const log = require('../utils/logger').create('tts');

const router = express.Router();

router.use(requireAuth);

/**
 * POST /api/tts/generate
 * Generate a conversation audio from a transcript.
 * Creates a project and saves the audio + transcript.
 *
 * Body: {
 *   name: "AI Upsell Conversation",
 *   speakers: [
 *     { id: "sulla", name: "Sulla AI", voiceId: "...", filter: "none" },
 *     { id: "caller", name: "Caller", voiceId: "...", filter: "phone-line" }
 *   ],
 *   lines: [
 *     { speaker: "sulla", text: "Hi, how can I help?" },
 *     { speaker: "caller", text: "I need a drain cleaning." }
 *   ],
 *   options: { pauseBetweenLines: 0.6, pauseBetweenSpeakers: 0.8 }
 * }
 */
router.post('/tts/generate', async (req, res, next) => {
  try {
    const { name, speakers, lines, options } = req.body;

    if (!speakers || !Array.isArray(speakers) || speakers.length === 0) {
      throw new ValidationError('speakers array is required');
    }
    if (!lines || !Array.isArray(lines) || lines.length === 0) {
      throw new ValidationError('lines array is required');
    }

    // Validate speakers have voiceId
    for (const s of speakers) {
      if (!s.id || !s.voiceId) {
        throw new ValidationError(`Speaker "${s.id || 'unknown'}" missing id or voiceId`);
      }
    }

    // Create project
    const org = await OrgRepository.getUserOrg(req.userId);
    if (!org) throw new ValidationError('No organization found — complete onboarding first');

    const project = await ProjectRepository.create({
      orgId: org.id,
      name: name || 'TTS Conversation',
      ruleTemplate: 'tts-conversation',
      createdBy: req.userId,
    });

    const projectDir = path.join(config.storageRoot, project.id);
    await fs.mkdir(path.join(projectDir, 'media'), { recursive: true });
    await fs.mkdir(path.join(projectDir, 'data'), { recursive: true });
    await fs.mkdir(path.join(projectDir, 'exports'), { recursive: true });

    log.info('Starting TTS generation', {
      projectId: project.id,
      speakers: speakers.length,
      lines: lines.length,
    });

    const conversation = { speakers, lines, options };

    // Save the input conversation for reproducibility
    await fs.writeFile(
      path.join(projectDir, 'data', 'conversation.json'),
      JSON.stringify(conversation, null, 2)
    );

    const dataDir = path.join(projectDir, 'data');
    const mediaDir = path.join(projectDir, 'media');

    const result = await generateConversation(conversation, mediaDir);

    // Copy transcript to data dir (standard location)
    await fs.copyFile(result.transcriptPath, path.join(dataDir, 'transcript.json'));

    await ProjectRepository.update(project.id, {
      status: 'transcribed',
      duration_ms: result.transcript.duration_ms,
    });

    res.json({
      status: 'complete',
      project: { id: project.id, name: name || 'TTS Conversation' },
      audioPath: result.audioPath,
      transcript: result.transcript,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/projects/:id/generate-audio
 * Generate TTS audio for an existing project.
 * Reads conversation.json from project data, or accepts body.
 */
router.post('/projects/:id/generate-audio', async (req, res, next) => {
  try {
    const project = await ProjectRepository.findByIdAndUser(req.params.id, req.userId);
    if (!project) throw new NotFoundError('Project not found');

    const projectDir = path.join(config.storageRoot, project.id);
    const dataDir = path.join(projectDir, 'data');
    const mediaDir = path.join(projectDir, 'media');

    let conversation;

    if (req.body.speakers && req.body.lines) {
      // Use body
      conversation = { speakers: req.body.speakers, lines: req.body.lines, options: req.body.options };
      await fs.writeFile(path.join(dataDir, 'conversation.json'), JSON.stringify(conversation, null, 2));
    } else {
      // Read from project data
      const convPath = path.join(dataDir, 'conversation.json');
      const raw = await fs.readFile(convPath, 'utf-8').catch(() => null);
      if (!raw) throw new ValidationError('No conversation.json found — provide speakers and lines in body');
      conversation = JSON.parse(raw);
    }

    log.info('Generating audio for project', { projectId: project.id });

    const result = await generateConversation(conversation, mediaDir);
    await fs.copyFile(result.transcriptPath, path.join(dataDir, 'transcript.json'));

    await ProjectRepository.update(project.id, {
      status: 'transcribed',
      duration_ms: result.transcript.duration_ms,
    });

    res.json({
      status: 'complete',
      audioPath: result.audioPath,
      transcript: result.transcript,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/tts/voices
 * List available ElevenLabs voices.
 */
router.get('/tts/voices', async (req, res, next) => {
  try {
    const voices = await listVoices();
    res.json({ voices });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/tts/filters
 * List available audio filter presets.
 */
router.get('/tts/filters', (req, res) => {
  res.json({
    filters: Object.keys(AUDIO_FILTERS).map(key => ({
      id: key,
      description: AUDIO_FILTERS[key] || 'No filter applied',
    })),
  });
});

module.exports = router;
