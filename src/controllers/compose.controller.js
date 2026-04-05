const path = require('path');
const fs = require('fs/promises');
const { existsSync } = require('fs');
const { renderComposition } = require('../services/compose.service');
const { renderReactProject } = require('../services/capture.service');
const ProjectRepository = require('../repositories/project.repository');
const OrgRepository = require('../repositories/org.repository');
const { NotFoundError, ValidationError } = require('../utils/errors');
const config = require('../utils/config');
const log = require('../utils/logger').create('compose');

const ComposeController = {
  /**
   * POST /api/projects/:id/compose
   * Body: { composition: { width, height, fps, slides: [...] } }
   */
  async compose(req, res, next) {
    try {
      const project = await ProjectRepository.findByIdAndUser(req.params.id, req.userId);
      if (!project) throw new NotFoundError('Project not found');

      const { composition } = req.body;
      if (!composition || !composition.slides) {
        throw new ValidationError('Composition with slides is required');
      }

      // Save composition to project data
      const dataDir = path.join(config.storageRoot, project.id, 'data');
      await fs.mkdir(dataDir, { recursive: true });
      await fs.writeFile(path.join(dataDir, 'composition.json'), JSON.stringify(composition, null, 2));

      // Render
      const result = await renderComposition(project.id, composition);

      await ProjectRepository.update(project.id, { status: 'exported' });

      res.json({ status: 'complete', ...result });
    } catch (err) { next(err); }
  },

  /**
   * POST /api/compose/quick
   * Quick compose — creates a project and renders in one call.
   * Body: { name, composition: { ... } }
   */
  async quickCompose(req, res, next) {
    try {
      const { name, composition } = req.body;
      if (!name) throw new ValidationError('Project name is required');
      if (!composition || !composition.slides) throw new ValidationError('Composition with slides is required');

      // Create project
      const org = await OrgRepository.getUserOrg(req.userId);
      if (!org) throw new ValidationError('No organization found — complete onboarding first');

      const project = await ProjectRepository.create({
        orgId: org.id,
        name,
        ruleTemplate: 'composition',
        createdBy: req.userId,
      });

      log.info('Quick compose project created', { projectId: project.id, name, slides: composition.slides.length });

      // Create directories
      const projectDir = path.join(config.storageRoot, project.id);
      await fs.mkdir(path.join(projectDir, 'media'), { recursive: true });
      await fs.mkdir(path.join(projectDir, 'data'), { recursive: true });
      await fs.mkdir(path.join(projectDir, 'exports'), { recursive: true });

      // Save composition
      await fs.writeFile(path.join(projectDir, 'data', 'composition.json'), JSON.stringify(composition, null, 2));

      // Render
      const result = await renderComposition(project.id, composition);

      await ProjectRepository.update(project.id, {
        status: 'exported',
        duration_ms: result.duration_ms,
        resolution: `${composition.width || 1920}x${composition.height || 1080}`,
      });

      res.json({
        status: 'complete',
        project: { id: project.id, name },
        ...result,
      });
    } catch (err) { next(err); }
  },

  /**
   * POST /api/compose/react
   * Render a React composition project to video.
   * Body: { compositionDir, name?, width?, height?, fps?, durationSec?, quality? }
   *
   * compositionDir is a path to a React project (relative to /var/www/html or absolute).
   * The React project must expose window.setFrame(n) for frame-by-frame capture.
   */
  async renderReact(req, res, next) {
    try {
      const { compositionDir, name, width, height, fps, durationSec, quality } = req.body;
      if (!compositionDir) throw new ValidationError('compositionDir is required');

      // Resolve path
      const absDir = path.isAbsolute(compositionDir) ? compositionDir : path.join('/var/www/html', compositionDir);
      if (!existsSync(absDir)) throw new ValidationError(`Composition directory not found: ${compositionDir}`);
      if (!existsSync(path.join(absDir, 'package.json'))) throw new ValidationError('No package.json in composition directory');

      const projectName = name || path.basename(absDir);

      // Create project
      const org = await OrgRepository.getUserOrg(req.userId);
      if (!org) throw new ValidationError('No organization found');

      const project = await ProjectRepository.create({
        orgId: org.id,
        name: projectName,
        ruleTemplate: 'react-composition',
        createdBy: req.userId,
      });

      const projectDir = path.join(config.storageRoot, project.id);
      await fs.mkdir(path.join(projectDir, 'exports'), { recursive: true });
      await fs.mkdir(path.join(projectDir, 'data'), { recursive: true });

      const outputPath = path.join(projectDir, 'exports', 'composition.mp4');

      log.info('Rendering React composition', { projectId: project.id, compositionDir: absDir });

      const result = await renderReactProject(absDir, outputPath, {
        width: width || 1920,
        height: height || 1080,
        fps: fps || 30,
        durationSec: durationSec || 29,
        quality: quality || 'high',
      });

      await ProjectRepository.update(project.id, {
        status: 'exported',
        duration_ms: result.duration_ms,
        resolution: `${result.width}x${result.height}`,
        file_size: result.size,
      });

      res.json({
        status: 'complete',
        project: { id: project.id, name: projectName },
        ...result,
      });
    } catch (err) { next(err); }
  },
};

module.exports = ComposeController;
