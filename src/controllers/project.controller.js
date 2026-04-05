const ProjectService = require('../services/project.service');

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

      // Set up SSE
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'X-Accel-Buffering': 'no', // disable nginx buffering
      });

      const emitter = stream.start(project);

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

  async getSuggestions(req, res, next) {
    try {
      const suggestions = await ProjectService.getSuggestions(req.params.id, req.userId);
      res.json(suggestions);
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
};

module.exports = ProjectController;
