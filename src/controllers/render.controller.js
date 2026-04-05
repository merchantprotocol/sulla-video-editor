const RenderService = require('../services/render.service');
const ProjectRepository = require('../repositories/project.repository');
const { NotFoundError } = require('../utils/errors');

const RenderController = {
  async render(req, res, next) {
    try {
      const project = await ProjectRepository.findByIdAndUser(req.params.id, req.userId);
      if (!project) throw new NotFoundError('Project not found');

      const { format, resolution, codec, quality, studioSound, normalizeAudio } = req.body;
      const result = await RenderService.render(project.id, { format, resolution, codec, quality, studioSound, normalizeAudio });

      await ProjectRepository.update(project.id, { status: 'exported' });

      res.json({ status: 'complete', ...result });
    } catch (err) { next(err); }
  },

  async renderClip(req, res, next) {
    try {
      const project = await ProjectRepository.findByIdAndUser(req.params.id, req.userId);
      if (!project) throw new NotFoundError('Project not found');

      const { start_ms, end_ms, format, resolution } = req.body;
      const result = await RenderService.renderClip(project.id, {
        startMs: start_ms,
        endMs: end_ms,
        format,
        resolution,
      });

      res.json({ status: 'complete', ...result });
    } catch (err) { next(err); }
  },

  async renderStream(req, res, next) {
    try {
      const project = await ProjectRepository.findByIdAndUser(req.params.id, req.userId);
      if (!project) throw new NotFoundError('Project not found');

      const { format, resolution, codec, quality, studioSound, normalizeAudio } = req.body;
      const emitter = RenderService.renderWithProgress(project.id, { format, resolution, codec, quality, studioSound, normalizeAudio });

      // SSE headers
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'X-Accel-Buffering': 'no',
      });

      emitter.on('progress', (pct) => {
        res.write(`data: ${JSON.stringify({ type: 'progress', progress: pct })}\n\n`);
      });

      emitter.on('done', async (result) => {
        await ProjectRepository.update(project.id, { status: 'exported' });
        res.write(`data: ${JSON.stringify({ type: 'done', ...result })}\n\n`);
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

  async serveExport(req, res, next) {
    try {
      const project = await ProjectRepository.findByIdAndUser(req.params.id, req.userId);
      if (!project) throw new NotFoundError('Project not found');

      const path = require('path');
      const { existsSync } = require('fs');
      const config = require('../utils/config');
      const filePath = path.join(config.storageRoot, project.id, 'exports', req.params.filename);
      if (!existsSync(filePath)) throw new NotFoundError('Export not found');

      res.sendFile(filePath);
    } catch (err) { next(err); }
  },
};

module.exports = RenderController;
