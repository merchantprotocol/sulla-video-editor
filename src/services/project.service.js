const path = require('path');
const fs = require('fs/promises');
const { existsSync } = require('fs');
const ProjectRepository = require('../repositories/project.repository');
const OrgRepository = require('../repositories/org.repository');
const MediaService = require('./media');
const TranscribeService = require('./transcribe');
const { NotFoundError, ValidationError } = require('../utils/errors');
const config = require('../utils/config');
const log = require('../utils/logger').create('project');

function projectPath(projectId, ...segments) {
  return path.join(config.storageRoot, projectId, ...segments);
}

const ProjectService = {
  async list(userId) {
    const org = await OrgRepository.getUserOrg(userId);
    if (!org) return [];
    return ProjectRepository.findByOrgId(org.id);
  },

  async get(projectId, userId) {
    const project = await ProjectRepository.findByIdAndUser(projectId, userId);
    if (!project) throw new NotFoundError('Project not found');

    const hasTranscript = existsSync(projectPath(project.id, 'data', 'transcript.json'));
    const hasEdl = existsSync(projectPath(project.id, 'data', 'edl.json'));
    const hasSuggestions = existsSync(projectPath(project.id, 'data', 'suggestions.json'));

    return { project, files: { hasTranscript, hasEdl, hasSuggestions } };
  },

  async create(userId, { name, ruleTemplate }) {
    if (!name) throw new ValidationError('Project name is required');

    const org = await OrgRepository.getUserOrg(userId);
    if (!org) throw new ValidationError('No organization found');

    const project = await ProjectRepository.create({ orgId: org.id, name, ruleTemplate, createdBy: userId });
    log.info('Project created', { projectId: project.id, name, orgId: org.id });

    await fs.mkdir(projectPath(project.id, 'media', 'thumbnails'), { recursive: true });
    await fs.mkdir(projectPath(project.id, 'data'), { recursive: true });
    await fs.mkdir(projectPath(project.id, 'exports'), { recursive: true });

    return project;
  },

  async update(projectId, userId, data) {
    const project = await ProjectRepository.findByIdAndUser(projectId, userId);
    if (!project) throw new NotFoundError('Project not found');
    return ProjectRepository.update(projectId, data);
  },

  async delete(projectId, userId) {
    const project = await ProjectRepository.findByIdAndUser(projectId, userId);
    if (!project) throw new NotFoundError('Project not found');

    await ProjectRepository.delete(projectId);
    const dir = projectPath(projectId);
    if (existsSync(dir)) await fs.rm(dir, { recursive: true, force: true });
  },

  async importMedia(projectId, userId, stream, filename) {
    const project = await ProjectRepository.findByIdAndUser(projectId, userId);
    if (!project) throw new NotFoundError('Project not found');

    log.info('Importing media', { projectId, filename });
    const start = Date.now();

    const ext = path.extname(filename) || '.mp4';
    const sourcePath = projectPath(projectId, 'media', `source${ext}`);

    // Write file to disk (req.body is a Buffer from express.raw middleware)
    if (Buffer.isBuffer(stream.body)) {
      await fs.writeFile(sourcePath, stream.body);
    } else {
      const { createWriteStream } = require('fs');
      await new Promise((resolve, reject) => {
        const ws = createWriteStream(sourcePath);
        stream.pipe(ws);
        ws.on('finish', resolve);
        ws.on('error', reject);
      });
    }
    log.info('File saved to disk', { projectId, filename });

    // Extract metadata, audio, thumbnails
    log.info('Extracting metadata', { projectId });
    const metadata = await MediaService.extractMetadata(sourcePath);
    log.info('Metadata extracted', { projectId, duration_ms: metadata.duration_ms, resolution: metadata.resolution, file_size: metadata.file_size });

    log.info('Extracting audio', { projectId });
    const audioPath = projectPath(projectId, 'media', 'audio.wav');
    await MediaService.extractAudio(sourcePath, audioPath);

    log.info('Generating thumbnails', { projectId });
    await MediaService.generateThumbnails(sourcePath, projectPath(projectId, 'media', 'thumbnails'));

    // Update DB
    await ProjectRepository.update(projectId, {
      media_path: sourcePath,
      duration_ms: metadata.duration_ms,
      resolution: metadata.resolution,
      file_size: metadata.file_size,
      status: 'editing',
    });

    log.info('Import complete', { projectId, durationMs: Date.now() - start });
    return metadata;
  },

  async transcribe(projectId, userId) {
    const project = await ProjectRepository.findByIdAndUser(projectId, userId);
    if (!project) throw new NotFoundError('Project not found');

    const audioPath = projectPath(projectId, 'media', 'audio.wav');
    if (!existsSync(audioPath)) throw new ValidationError('No audio file found. Import media first.');

    log.info('Starting transcription', { projectId });
    const start = Date.now();

    const transcript = await TranscribeService.transcribe(audioPath);
    const transcriptPath = projectPath(projectId, 'data', 'transcript.json');
    await fs.writeFile(transcriptPath, JSON.stringify(transcript, null, 2));

    await ProjectRepository.update(projectId, { transcript_path: transcriptPath });

    const fillerCount = transcript.words.filter(w => w.filler).length;
    log.info('Transcription complete', {
      projectId,
      words: transcript.words.length,
      fillers: fillerCount,
      silences: transcript.silences.length,
      durationMs: Date.now() - start,
    });

    return { word_count: transcript.words.length, duration_ms: transcript.duration_ms };
  },

  async getTranscript(projectId, userId) {
    const project = await ProjectRepository.findByIdAndUser(projectId, userId);
    if (!project) throw new NotFoundError('Project not found');

    const transcriptPath = projectPath(projectId, 'data', 'transcript.json');
    if (!existsSync(transcriptPath)) throw new NotFoundError('No transcript yet');

    return JSON.parse(await fs.readFile(transcriptPath, 'utf-8'));
  },

  async getEdl(projectId, userId) {
    const project = await ProjectRepository.findByIdAndUser(projectId, userId);
    if (!project) throw new NotFoundError('Project not found');

    const edlPath = projectPath(projectId, 'data', 'edl.json');
    if (!existsSync(edlPath)) return { version: 1, cuts: [], reorder: [], inserts: [] };

    return JSON.parse(await fs.readFile(edlPath, 'utf-8'));
  },

  async saveEdl(projectId, userId, edl) {
    const project = await ProjectRepository.findByIdAndUser(projectId, userId);
    if (!project) throw new NotFoundError('Project not found');

    const edlPath = projectPath(projectId, 'data', 'edl.json');
    await fs.writeFile(edlPath, JSON.stringify(edl, null, 2));
    await ProjectRepository.update(projectId, {});
  },

  async getSuggestions(projectId, userId) {
    const project = await ProjectRepository.findByIdAndUser(projectId, userId);
    if (!project) throw new NotFoundError('Project not found');

    const sugPath = projectPath(projectId, 'data', 'suggestions.json');
    if (!existsSync(sugPath)) return { suggestions: [] };

    return JSON.parse(await fs.readFile(sugPath, 'utf-8'));
  },

  async getExports(projectId, userId) {
    const project = await ProjectRepository.findByIdAndUser(projectId, userId);
    if (!project) throw new NotFoundError('Project not found');

    const exportsDir = projectPath(projectId, 'exports');
    if (!existsSync(exportsDir)) return [];

    const files = await fs.readdir(exportsDir);
    const result = [];
    for (const file of files) {
      const stat = await fs.stat(path.join(exportsDir, file));
      result.push({ name: file, size: stat.size, created_at: stat.mtime });
    }
    return result;
  },

  async getMediaPath(projectId, userId, filename) {
    const project = await ProjectRepository.findByIdAndUser(projectId, userId);
    if (!project) throw new NotFoundError('Project not found');

    const filePath = projectPath(projectId, 'media', filename);
    if (!existsSync(filePath)) throw new NotFoundError('File not found');

    return filePath;
  },

  async getThumbnailPath(projectId, userId, filename) {
    const project = await ProjectRepository.findByIdAndUser(projectId, userId);
    if (!project) throw new NotFoundError('Project not found');

    const filePath = projectPath(projectId, 'media', 'thumbnails', filename);
    if (!existsSync(filePath)) throw new NotFoundError('File not found');

    return filePath;
  },
};

module.exports = ProjectService;
