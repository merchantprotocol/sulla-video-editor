const path = require('path');
const fs = require('fs/promises');
const config = require('../utils/config');
const ProjectService = require('../services/project.service');
const ProjectRepository = require('../repositories/project.repository');
const { writeCaptionFile } = require('../services/caption.service');
const TranscribeService = require('../services/transcribe');
const { NotFoundError, ValidationError } = require('../utils/errors');

const ProjectController = {
  async list(req, res, next) {
    try {
      const projects = await ProjectService.list(req.userId);
      res.json({ projects });
    } catch (err) { next(err); }
  },

  async create(req, res, next) {
    try {
      const project = await ProjectService.create(req.userId, {
        name: req.body.name,
        ruleTemplate: req.body.rule_template,
        templateId: req.body.template_id,
      });
      res.json({ project });
    } catch (err) { next(err); }
  },

  async get(req, res, next) {
    try {
      const result = await ProjectService.get(req.params.id, req.userId);
      res.json(result);
    } catch (err) { next(err); }
  },

  async update(req, res, next) {
    try {
      const project = await ProjectService.update(req.params.id, req.userId, req.body);
      res.json({ project });
    } catch (err) { next(err); }
  },

  async delete(req, res, next) {
    try {
      await ProjectService.delete(req.params.id, req.userId);
      res.json({ deleted: true });
    } catch (err) { next(err); }
  },

  async importMedia(req, res, next) {
    try {
      const filename = req.headers['x-filename'] || 'source.mp4';
      const metadata = await ProjectService.importMedia(req.params.id, req.userId, req, filename);
      res.json({ status: 'imported', ...metadata });
    } catch (err) { next(err); }
  },

  async transcribe(req, res, next) {
    try {
      const stream = ProjectService.transcribeStream(req.params.id, req.userId);
      const project = await stream.projectLookup;

      // start() validates project & audio file — call before writing headers
      // so validation errors return proper JSON responses, not broken SSE
      const emitter = stream.start(project);

      // Set up SSE only after validation passes
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'X-Accel-Buffering': 'no', // disable nginx buffering
      });

      emitter.on('progress', (pct) => {
        res.write(`data: ${JSON.stringify({ type: 'progress', progress: pct })}\n\n`);
      });

      emitter.on('complete', (summary) => {
        res.write(`data: ${JSON.stringify({ type: 'done', ...summary })}\n\n`);
        res.end();
      });

      emitter.on('error', (err) => {
        res.write(`data: ${JSON.stringify({ type: 'error', error: err.message })}\n\n`);
        res.end();
      });

      req.on('close', () => {
        emitter.removeAllListeners();
      });
    } catch (err) { next(err); }
  },

  async getTranscript(req, res, next) {
    try {
      const transcript = await ProjectService.getTranscript(req.params.id, req.userId);
      res.json(transcript);
    } catch (err) { next(err); }
  },

  async saveTranscript(req, res, next) {
    try {
      await ProjectService.saveTranscript(req.params.id, req.userId, req.body);
      res.json({ saved: true });
    } catch (err) { next(err); }
  },

  async getEdl(req, res, next) {
    try {
      const edl = await ProjectService.getEdl(req.params.id, req.userId);
      res.json(edl);
    } catch (err) { next(err); }
  },

  async saveEdl(req, res, next) {
    try {
      await ProjectService.saveEdl(req.params.id, req.userId, req.body);
      res.json({ saved: true });
    } catch (err) { next(err); }
  },

  async getWaveform(req, res, next) {
    try {
      const waveform = await ProjectService.getWaveform(req.params.id, req.userId);
      res.json(waveform);
    } catch (err) { next(err); }
  },

  async getSuggestions(req, res, next) {
    try {
      const suggestions = await ProjectService.getSuggestions(req.params.id, req.userId);
      res.json(suggestions);
    } catch (err) { next(err); }
  },

  async analyze(req, res, next) {
    try {
      const result = await ProjectService.analyze(req.params.id, req.userId);
      res.json(result);
    } catch (err) { next(err); }
  },

  async getExports(req, res, next) {
    try {
      const exports = await ProjectService.getExports(req.params.id, req.userId);
      res.json({ exports });
    } catch (err) { next(err); }
  },

  async serveMedia(req, res, next) {
    try {
      const filePath = await ProjectService.getMediaPath(req.params.id, req.userId, req.params.filename);
      res.sendFile(filePath);
    } catch (err) { next(err); }
  },

  async serveThumbnail(req, res, next) {
    try {
      const filePath = await ProjectService.getThumbnailPath(req.params.id, req.userId, req.params.filename);
      res.sendFile(filePath);
    } catch (err) { next(err); }
  },

  async saveTracks(req, res, next) {
    try {
      await ProjectService.saveTracks(req.params.id, req.userId, req.body);
      res.json({ saved: true });
    } catch (err) { next(err); }
  },

  async getOverlays(req, res, next) {
    try {
      const overlays = await ProjectService.getOverlays(req.params.id, req.userId);
      res.json(overlays);
    } catch (err) { next(err); }
  },

  async saveOverlays(req, res, next) {
    try {
      await ProjectService.saveOverlays(req.params.id, req.userId, req.body.overlays || []);
      res.json({ saved: true });
    } catch (err) { next(err); }
  },

  async generateCaptions(req, res, next) {
    try {
      const project = await ProjectRepository.findByIdAndUser(req.params.id, req.userId);
      if (!project) throw new NotFoundError('Project not found');

      const projectDir = path.join(config.storageRoot, project.id);
      const dataDir = path.join(projectDir, 'data');

      const transcript = JSON.parse(await fs.readFile(path.join(dataDir, 'transcript.json'), 'utf-8'));

      let edl = { cuts: [] };
      try {
        edl = JSON.parse(await fs.readFile(path.join(dataDir, 'edl.json'), 'utf-8'));
      } catch (_) { /* no EDL is fine */ }

      const positionMap = {
        'bottom-center': 'bottom',
        'top-center': 'top',
        'center': 'center',
      };

      const { fontSize, position, maxWords } = req.body;
      const mappedOptions = {
        ...(fontSize != null && { fontSize }),
        ...(position != null && { position: positionMap[position] || position }),
        ...(maxWords != null && { maxWordsPerLine: maxWords }),
      };

      const captionPath = await writeCaptionFile(projectDir, transcript, edl, mappedOptions);
      res.json({ status: 'ok', path: captionPath });
    } catch (err) { next(err); }
  },

  /**
   * POST /api/projects/ingest
   * Ingest a file already on the shared volume. No upload needed.
   * Body: { name?, filePath, templateId?, trackRoles? }
   */
  async extractAudioTrack(req, res, next) {
    try {
      const audioStreamIndex = parseInt(req.body.audioStreamIndex) || 0;
      await ProjectService.extractAudioTrack(req.params.id, req.userId, audioStreamIndex);
      res.json({ status: 'ok', audioStreamIndex });
    } catch (err) { next(err); }
  },

  async ingest(req, res, next) {
    try {
      const { name, filePath, templateId, trackRoles } = req.body;
      const result = await ProjectService.ingest(req.userId, { name, filePath, templateId, trackRoles });
      res.json({ status: 'ingested', project: result.project, metadata: result.metadata });
    } catch (err) { next(err); }
  },

  async realignWords(req, res, next) {
    try {
      const { startIdx, endIdx } = req.body;
      if (startIdx == null || endIdx == null) {
        throw new ValidationError('startIdx and endIdx are required');
      }

      const project = await ProjectRepository.findByIdAndUser(req.params.id, req.userId);
      if (!project) throw new NotFoundError('Project not found');

      const projectDir = path.join(config.storageRoot, project.id);
      const transcriptPath = path.join(projectDir, 'data', 'transcript.json');
      const audioPath = path.join(projectDir, 'media', 'audio.wav');

      const transcript = JSON.parse(await fs.readFile(transcriptPath, 'utf-8'));

      if (!transcript.words || transcript.words.length === 0) {
        throw new ValidationError('Transcript has no words');
      }
      if (startIdx < 0 || endIdx >= transcript.words.length || startIdx > endIdx) {
        throw new ValidationError('Invalid startIdx/endIdx range');
      }

      const updatedWords = await TranscribeService.realignWords(
        audioPath, transcript.words, startIdx, endIdx
      );

      // Save updated transcript
      transcript.words = updatedWords;
      await fs.writeFile(transcriptPath, JSON.stringify(transcript, null, 2));

      res.json({ status: 'ok', words: updatedWords });
    } catch (err) { next(err); }
  },
};

module.exports = ProjectController;
