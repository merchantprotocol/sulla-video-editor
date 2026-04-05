const ProjectRepository = require('../repositories/project.repository');
const { applyStudioSound, applyNormalize } = require('../services/audio.service');
const { NotFoundError } = require('../utils/errors');

const AudioController = {
  /**
   * POST /api/projects/:id/studio-sound
   * Apply studio sound enhancement. Streams progress via SSE.
   */
  async studioSound(req, res, next) {
    try {
      const project = await ProjectRepository.findByIdAndUser(req.params.id, req.userId);
      if (!project) throw new NotFoundError('Project not found');

      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'X-Accel-Buffering': 'no',
      });

      const emitter = applyStudioSound(project.id);

      emitter.on('progress', (pct) => {
        res.write(`data: ${JSON.stringify({ type: 'progress', progress: pct })}\n\n`);
      });

      emitter.on('done', (result) => {
        res.write(`data: ${JSON.stringify({ type: 'done', ...result })}\n\n`);
        res.end();
      });

      emitter.on('error', (err) => {
        res.write(`data: ${JSON.stringify({ type: 'error', error: err.message })}\n\n`);
        res.end();
      });

      req.on('close', () => emitter.removeAllListeners());
    } catch (err) { next(err); }
  },

  /**
   * POST /api/projects/:id/normalize
   * Apply loudness normalization. Streams progress via SSE.
   */
  async normalize(req, res, next) {
    try {
      const project = await ProjectRepository.findByIdAndUser(req.params.id, req.userId);
      if (!project) throw new NotFoundError('Project not found');

      const { targetLufs } = req.body || {};

      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'X-Accel-Buffering': 'no',
      });

      const emitter = applyNormalize(project.id, targetLufs || -14);

      emitter.on('progress', (pct) => {
        res.write(`data: ${JSON.stringify({ type: 'progress', progress: pct })}\n\n`);
      });

      emitter.on('done', (result) => {
        res.write(`data: ${JSON.stringify({ type: 'done', ...result })}\n\n`);
        res.end();
      });

      emitter.on('error', (err) => {
        res.write(`data: ${JSON.stringify({ type: 'error', error: err.message })}\n\n`);
        res.end();
      });

      req.on('close', () => emitter.removeAllListeners());
    } catch (err) { next(err); }
  },
};

module.exports = AudioController;
