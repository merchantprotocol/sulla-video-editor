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
const TemplateRepository = require('../repositories/template.repository');
const { SYSTEM_TEMPLATES } = require('../templates/system');
const AnalyzeService = require('./analyze.service');

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
    const hasTracks = existsSync(projectPath(project.id, 'data', 'tracks.json'));

    // Load tracks — auto-generate from media if missing
    let tracks = [];
    if (hasTracks) {
      try {
        tracks = JSON.parse(await fs.readFile(projectPath(project.id, 'data', 'tracks.json'), 'utf-8'));
      } catch {}
    } else if (project.media_path && existsSync(project.media_path)) {
      // Media exists but tracks.json doesn't — extract now
      try {
        log.info('Auto-generating tracks from media', { projectId });
        const metadata = await MediaService.extractMetadata(project.media_path);
        tracks = metadata.tracks || [];
        await fs.mkdir(projectPath(project.id, 'data'), { recursive: true });
        await fs.writeFile(projectPath(project.id, 'data', 'tracks.json'), JSON.stringify(tracks, null, 2));
        log.info('Tracks generated', { projectId, count: tracks.length });
      } catch (err) {
        log.warn('Failed to auto-generate tracks', { projectId, error: err.message });
      }
    }

    const hasWaveform = existsSync(projectPath(project.id, 'data', 'waveform.json'));

    return { project, files: { hasTranscript, hasEdl, hasSuggestions, hasTracks: hasTracks || tracks.length > 0, hasWaveform }, tracks };
  },

  async create(userId, { name, ruleTemplate, templateId }) {
    if (!name) throw new ValidationError('Project name is required');

    const org = await OrgRepository.getUserOrg(userId);
    if (!org) throw new ValidationError('No organization found');

    // Resolve template config: by template_id, by slug, or fall back to system defaults
    let templateConfig = null;
    let resolvedTemplateId = templateId || null;

    if (templateId) {
      // Lookup by ID (could be a DB template or a file-based system-xxx ID)
      if (templateId.startsWith('system-')) {
        const slug = templateId.replace('system-', '');
        const tpl = SYSTEM_TEMPLATES[slug];
        if (tpl) templateConfig = { theme: tpl.theme, scenes: tpl.scenes, rules: tpl.rules, export: tpl.export };
      } else {
        try {
          const tpl = await TemplateRepository.findById(templateId);
          if (tpl) {
            templateConfig = typeof tpl.config === 'string' ? JSON.parse(tpl.config) : tpl.config;
            resolvedTemplateId = tpl.id;
          }
        } catch {}
      }
    }

    // Fall back to slug-based lookup (legacy rule_template field)
    if (!templateConfig && ruleTemplate && ruleTemplate !== 'custom') {
      const tpl = SYSTEM_TEMPLATES[ruleTemplate];
      if (tpl) templateConfig = { theme: tpl.theme, scenes: tpl.scenes, rules: tpl.rules, export: tpl.export };
    }

    const project = await ProjectRepository.create({
      orgId: org.id,
      name,
      ruleTemplate,
      templateId: resolvedTemplateId,
      templateConfig,
      createdBy: userId,
    });
    log.info('Project created', { projectId: project.id, name, orgId: org.id, template: ruleTemplate || templateId });

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
    log.info('Metadata extracted', {
      projectId, duration_ms: metadata.duration_ms, resolution: metadata.resolution,
      file_size: metadata.file_size, tracks: metadata.tracks.length,
    });

    // Save tracks info
    await fs.writeFile(
      projectPath(projectId, 'data', 'tracks.json'),
      JSON.stringify(metadata.tracks, null, 2)
    );

    log.info('Extracting audio', { projectId });
    const audioPath = projectPath(projectId, 'media', 'audio.wav');
    await MediaService.extractAudio(sourcePath, audioPath);

    log.info('Generating thumbnails', { projectId });
    await MediaService.generateThumbnails(sourcePath, projectPath(projectId, 'media', 'thumbnails'));

    // Extract waveform for audio track visualization
    log.info('Extracting waveform', { projectId });
    try {
      const waveResult = await MediaService.extractWaveform(
        projectPath(projectId, 'media', 'audio.wav'),
        projectPath(projectId, 'data', 'waveform.json'),
        100 // 100 samples/sec = 10ms resolution
      );
      log.info('Waveform extracted', { projectId, samples: waveResult.sample_count });
    } catch (err) {
      log.warn('Waveform extraction failed (non-fatal)', { projectId, error: err.message });
    }

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

    // Fire-and-forget AI analysis (don't block transcription response)
    AnalyzeService.analyzeTranscript(transcript).then(async (result) => {
      try {
        const sugPath = projectPath(projectId, 'data', 'suggestions.json');
        await fs.writeFile(sugPath, JSON.stringify(result, null, 2));
        log.info('Post-transcription AI suggestions saved', { projectId, count: result.suggestions?.length || 0 });
      } catch (err) {
        log.warn('Failed to save post-transcription suggestions', { projectId, error: err.message });
      }
    }).catch(err => {
      log.warn('Post-transcription AI analysis failed', { projectId, error: err.message });
    });

    return { word_count: transcript.words.length, duration_ms: transcript.duration_ms };
  },

  /**
   * Stream transcription progress via an EventEmitter.
   * Returns the emitter immediately; caller listens for 'progress', 'complete', 'error'.
   * On whisper completion, saves transcript and emits 'complete' with summary.
   */
  transcribeStream(projectId, userId) {
    const audioPath = projectPath(projectId, 'media', 'audio.wav');
    const project = ProjectRepository.findByIdAndUser(projectId, userId);

    return {
      projectLookup: project,
      start(resolvedProject) {
        if (!resolvedProject) throw new NotFoundError('Project not found');
        if (!existsSync(audioPath)) throw new ValidationError('No audio file found. Import media first.');

        log.info('Starting transcription (streaming)', { projectId });
        const startTime = Date.now();
        const whisper = TranscribeService.transcribeWithProgress(audioPath);

        // Re-emit progress from whisper
        const { EventEmitter } = require('events');
        const emitter = new EventEmitter();

        whisper.on('progress', (pct) => emitter.emit('progress', pct));

        whisper.on('done', async (transcript) => {
          try {
            const transcriptPath = projectPath(projectId, 'data', 'transcript.json');
            await fs.writeFile(transcriptPath, JSON.stringify(transcript, null, 2));
            await ProjectRepository.update(projectId, { transcript_path: transcriptPath });

            const fillerCount = transcript.words.filter(w => w.filler).length;
            log.info('Transcription complete (streaming)', {
              projectId,
              words: transcript.words.length,
              fillers: fillerCount,
              silences: transcript.silences.length,
              durationMs: Date.now() - startTime,
            });

            emitter.emit('complete', {
              word_count: transcript.word_count,
              duration_ms: transcript.duration_ms,
            });
          } catch (err) {
            emitter.emit('error', err);
          }
        });

        whisper.on('error', (err) => emitter.emit('error', err));

        return emitter;
      },
    };
  },

  async getTranscript(projectId, userId) {
    const project = await ProjectRepository.findByIdAndUser(projectId, userId);
    if (!project) throw new NotFoundError('Project not found');

    const transcriptPath = projectPath(projectId, 'data', 'transcript.json');
    if (!existsSync(transcriptPath)) throw new NotFoundError('No transcript yet');

    return JSON.parse(await fs.readFile(transcriptPath, 'utf-8'));
  },

  async saveTranscript(projectId, userId, transcriptData) {
    const project = await ProjectRepository.findByIdAndUser(projectId, userId);
    if (!project) throw new NotFoundError('Project not found');

    const transcriptPath = projectPath(projectId, 'data', 'transcript.json');
    await fs.writeFile(transcriptPath, JSON.stringify(transcriptData, null, 2));
    await ProjectRepository.update(projectId, {});
    log.info('Transcript saved', { projectId });
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

  async analyze(projectId, userId) {
    const project = await ProjectRepository.findByIdAndUser(projectId, userId);
    if (!project) throw new NotFoundError('Project not found');

    const transcriptPath = projectPath(projectId, 'data', 'transcript.json');
    if (!existsSync(transcriptPath)) throw new ValidationError('No transcript yet — transcribe first');

    const transcript = JSON.parse(await fs.readFile(transcriptPath, 'utf-8'));
    const result = await AnalyzeService.analyzeTranscript(transcript);

    const sugPath = projectPath(projectId, 'data', 'suggestions.json');
    await fs.writeFile(sugPath, JSON.stringify(result, null, 2));
    log.info('AI suggestions saved', { projectId, count: result.suggestions?.length || 0 });

    return result;
  },

  async getWaveform(projectId, userId) {
    const project = await ProjectRepository.findByIdAndUser(projectId, userId);
    if (!project) throw new NotFoundError('Project not found');

    const waveformPath = projectPath(projectId, 'data', 'waveform.json');
    if (!existsSync(waveformPath)) throw new NotFoundError('No waveform data — re-import media to generate');

    return JSON.parse(await fs.readFile(waveformPath, 'utf-8'));
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

  async saveTracks(projectId, userId, tracks) {
    const project = await ProjectRepository.findByIdAndUser(projectId, userId);
    if (!project) throw new NotFoundError('Project not found');

    const tracksPath = projectPath(projectId, 'data', 'tracks.json');
    await fs.writeFile(tracksPath, JSON.stringify(tracks, null, 2));
  },

  async getOverlays(projectId, userId) {
    const project = await ProjectRepository.findByIdAndUser(projectId, userId);
    if (!project) throw new NotFoundError('Project not found');

    const overlaysPath = projectPath(projectId, 'data', 'overlays.json');
    if (!existsSync(overlaysPath)) return { overlays: [] };

    return JSON.parse(await fs.readFile(overlaysPath, 'utf-8'));
  },

  async saveOverlays(projectId, userId, overlays) {
    const project = await ProjectRepository.findByIdAndUser(projectId, userId);
    if (!project) throw new NotFoundError('Project not found');

    const overlaysPath = projectPath(projectId, 'data', 'overlays.json');
    await fs.writeFile(overlaysPath, JSON.stringify({ overlays }, null, 2));
  },
};

module.exports = ProjectService;
