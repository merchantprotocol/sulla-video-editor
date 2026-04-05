const UploadService = require('../services/upload');
const ProjectService = require('../services/project.service');
const ProjectRepository = require('../repositories/project.repository');
const MediaService = require('../services/media');
const { NotFoundError, ValidationError } = require('../utils/errors');
const log = require('../utils/logger').create('upload');
const path = require('path');
const config = require('../utils/config');

function projectMediaPath(projectId, ...segments) {
  return path.join(config.storageRoot, projectId, ...segments);
}

const UploadController = {
  /**
   * POST /:id/upload/init
   * Body: { filename, fileSize, chunkSize? }
   * Returns: { uploadId, chunkSize, totalChunks } or existing session for resume
   */
  async init(req, res, next) {
    try {
      const project = await ProjectRepository.findByIdAndUser(req.params.id, req.userId);
      if (!project) throw new NotFoundError('Project not found');

      const { filename, fileSize, chunkSize = 5 * 1024 * 1024 } = req.body;
      if (!filename || !fileSize) throw new ValidationError('filename and fileSize are required');

      // Check for existing resumable session
      const existing = await UploadService.findExisting(project.id, filename, fileSize);
      if (existing) {
        log.info('Resuming existing upload', { projectId: project.id, uploadId: existing.uploadId });
        return res.json(existing);
      }

      const result = await UploadService.init(project.id, { filename, fileSize, chunkSize });
      res.json(result);
    } catch (err) { next(err); }
  },

  /**
   * POST /:id/upload/chunk
   * Headers: X-Upload-Id, X-Chunk-Index
   * Body: raw chunk data (application/octet-stream)
   */
  async chunk(req, res, next) {
    try {
      const project = await ProjectRepository.findByIdAndUser(req.params.id, req.userId);
      if (!project) throw new NotFoundError('Project not found');

      const uploadId = req.headers['x-upload-id'];
      const chunkIndex = parseInt(req.headers['x-chunk-index'], 10);

      if (!uploadId) throw new ValidationError('X-Upload-Id header is required');
      if (isNaN(chunkIndex)) throw new ValidationError('X-Chunk-Index header is required');

      const result = await UploadService.storeChunk(project.id, uploadId, chunkIndex, req.body);
      res.json(result);
    } catch (err) { next(err); }
  },

  /**
   * GET /:id/upload/status?uploadId=...
   * Returns: { uploadId, filename, totalChunks, receivedChunks, complete }
   */
  async status(req, res, next) {
    try {
      const project = await ProjectRepository.findByIdAndUser(req.params.id, req.userId);
      if (!project) throw new NotFoundError('Project not found');

      const uploadId = req.query.uploadId;
      if (!uploadId) throw new ValidationError('uploadId query parameter is required');

      const status = await UploadService.status(project.id, uploadId);
      if (!status) throw new NotFoundError('Upload session not found');

      res.json(status);
    } catch (err) { next(err); }
  },

  /**
   * POST /:id/upload/complete
   * Body: { uploadId }
   * Reassembles chunks, extracts metadata/audio/thumbnails, updates DB.
   * Returns: metadata
   */
  async complete(req, res, next) {
    try {
      const project = await ProjectRepository.findByIdAndUser(req.params.id, req.userId);
      if (!project) throw new NotFoundError('Project not found');

      const { uploadId } = req.body;
      if (!uploadId) throw new ValidationError('uploadId is required');

      // Reassemble
      const { outputPath, filename } = await UploadService.complete(project.id, uploadId);

      // Extract metadata
      log.info('Extracting metadata', { projectId: project.id });
      const metadata = await MediaService.extractMetadata(outputPath);

      // Extract audio
      log.info('Extracting audio', { projectId: project.id });
      const audioPath = projectMediaPath(project.id, 'media', 'audio.wav');
      await MediaService.extractAudio(outputPath, audioPath);

      // Generate thumbnails
      log.info('Generating thumbnails', { projectId: project.id });
      await MediaService.generateThumbnails(outputPath, projectMediaPath(project.id, 'media', 'thumbnails'));

      // Update DB
      await ProjectRepository.update(project.id, {
        media_path: outputPath,
        duration_ms: metadata.duration_ms,
        resolution: metadata.resolution,
        file_size: metadata.file_size,
        status: 'editing',
      });

      // Clean up upload directory
      await UploadService.cleanup(project.id, uploadId);

      log.info('Chunked upload complete', { projectId: project.id, ...metadata });
      res.json({ status: 'imported', ...metadata });
    } catch (err) { next(err); }
  },
};

module.exports = UploadController;
