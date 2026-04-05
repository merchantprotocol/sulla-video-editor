const { execFile, spawn } = require('child_process');
const { promisify } = require('util');
const path = require('path');
const fs = require('fs/promises');
const { existsSync } = require('fs');
const config = require('../utils/config');
const { ValidationError } = require('../utils/errors');
const log = require('../utils/logger').create('render');

const exec = promisify(execFile);

// Duration in ms of the micro-fade applied at each cut boundary
// to eliminate audio pops/clicks from hard cuts.
const CROSSFADE_MS = 5;

/**
 * Build an FFmpeg select filter expression from an EDL.
 * This creates a filter that keeps only the non-cut portions.
 */
function buildSelectFilter(edl, durationMs) {
  if (!edl.cuts || edl.cuts.length === 0) return null;

  // Sort cuts by start time
  const cuts = [...edl.cuts].sort((a, b) => a.start_ms - b.start_ms);

  // Build keep ranges (inverse of cuts)
  const keeps = [];
  let pos = 0;

  for (const cut of cuts) {
    if (cut.start_ms > pos) {
      keeps.push({ start: pos / 1000, end: cut.start_ms / 1000 });
    }
    pos = Math.max(pos, cut.end_ms);
  }

  // Add final segment
  if (pos < durationMs) {
    keeps.push({ start: pos / 1000, end: durationMs / 1000 });
  }

  if (keeps.length === 0) {
    throw new ValidationError('EDL cuts remove all content');
  }

  // Build select expression: between(t,start1,end1) + between(t,start2,end2) + ...
  const selectExpr = keeps
    .map(k => `between(t,${k.start.toFixed(3)},${k.end.toFixed(3)})`)
    .join('+');

  return { selectExpr, keeps };
}

/**
 * Build a concat-based filter graph that applies micro-fades at each
 * cut boundary. This eliminates the audible pops/clicks caused by
 * hard frame cuts in the select/aselect approach.
 *
 * For each kept segment we:
 *  1. Trim the source to that range
 *  2. Apply a short fade-out at the end and fade-in at the start
 *  3. Concat all segments
 */
function buildConcatFilter(keeps) {
  const fadeSec = (CROSSFADE_MS / 1000).toFixed(4);
  const vParts = [];
  const aParts = [];
  const filters = [];

  for (let i = 0; i < keeps.length; i++) {
    const k = keeps[i];
    const dur = (k.end - k.start).toFixed(4);
    const start = k.start.toFixed(4);

    // Trim video + audio for this segment
    filters.push(`[0:v]trim=start=${start}:duration=${dur},setpts=PTS-STARTPTS`);
    // Micro fade-in on first frame, fade-out on last frame
    if (i > 0) filters[filters.length - 1] += `,fade=t=in:st=0:d=${fadeSec}`;
    if (i < keeps.length - 1) {
      const fadeStart = (k.end - k.start - CROSSFADE_MS / 1000).toFixed(4);
      filters[filters.length - 1] += `,fade=t=out:st=${fadeStart}:d=${fadeSec}`;
    }
    filters[filters.length - 1] += `[v${i}]`;
    vParts.push(`[v${i}]`);

    filters.push(`[0:a]atrim=start=${start}:duration=${dur},asetpts=PTS-STARTPTS`);
    if (i > 0) filters[filters.length - 1] += `,afade=t=in:st=0:d=${fadeSec}`;
    if (i < keeps.length - 1) {
      const fadeStart = (k.end - k.start - CROSSFADE_MS / 1000).toFixed(4);
      filters[filters.length - 1] += `,afade=t=out:st=${fadeStart}:d=${fadeSec}`;
    }
    filters[filters.length - 1] += `[a${i}]`;
    aParts.push(`[a${i}]`);
  }

  // Concat all segments
  filters.push(`${vParts.join('')}concat=n=${keeps.length}:v=1:a=0[outv]`);
  filters.push(`${aParts.join('')}concat=n=${keeps.length}:v=0:a=1[outa]`);

  return { filterGraph: filters.join('; '), keeps };
}

/**
 * Render a project using FFmpeg.
 * Applies EDL cuts, optional captions, and exports to the specified format.
 */
async function render(projectId, options = {}) {
  const {
    format = '16:9',
    resolution = '1080p',
    codec = 'libx264',
    quality = 'high',
    studioSound = false,
    normalizeAudio = false,
    targetLufs = -14,
  } = options;

  log.info('Starting render', { projectId, format, resolution, quality });
  const start = Date.now();

  const projectDir = path.join(config.storageRoot, projectId);
  const mediaDir = path.join(projectDir, 'media');
  const dataDir = path.join(projectDir, 'data');
  const exportsDir = path.join(projectDir, 'exports');

  // Find source media
  const sourceFile = findSourceFile(mediaDir);
  if (!sourceFile) throw new ValidationError('No source media found');

  // Load EDL
  const edlPath = path.join(dataDir, 'edl.json');
  let edl = { version: 1, cuts: [] };
  if (existsSync(edlPath)) {
    edl = JSON.parse(await fs.readFile(edlPath, 'utf-8'));
  }

  // Get source duration
  const { stdout } = await exec('ffprobe', [
    '-v', 'quiet', '-show_entries', 'format=duration',
    '-of', 'csv=p=0', sourceFile,
  ]);
  const durationMs = Math.round(parseFloat(stdout.trim()) * 1000);

  // Build output filename
  const resMap = { '1080p': '1920:1080', '720p': '1280:720', '4k': '3840:2160' };
  const res = resMap[resolution] || '1920:1080';
  const [w, h] = res.split(':').map(Number);

  // Determine output dimensions by format
  const dims = getOutputDimensions(format, w, h);
  const outputName = `${format.replace(/[:/]/g, 'x')}-${resolution}.mp4`;
  const outputPath = path.join(exportsDir, outputName);
  await fs.mkdir(exportsDir, { recursive: true });

  // Build FFmpeg args
  const args = ['-i', sourceFile, '-y'];

  // Apply EDL cuts
  const selectResult = buildSelectFilter(edl, durationMs);

  if (selectResult && selectResult.keeps.length > 1) {
    // Use concat filter graph with micro-fades for clean cut transitions
    const { filterGraph } = buildConcatFilter(selectResult.keeps);

    // Append scale/pad to the concat output
    const scaleFilter = `[outv]scale=${dims.w}:${dims.h}:force_original_aspect_ratio=decrease,pad=${dims.w}:${dims.h}:(ow-iw)/2:(oh-ih)/2[finalv]`;
    args.push('-filter_complex', `${filterGraph}; ${scaleFilter}`);
    args.push('-map', '[finalv]', '-map', '[outa]');
  } else if (selectResult && selectResult.keeps.length === 1) {
    // Single keep segment — just trim, no concat needed
    const k = selectResult.keeps[0];
    args.push('-ss', k.start.toFixed(3), '-t', (k.end - k.start).toFixed(3));
    args.push('-vf', `scale=${dims.w}:${dims.h}:force_original_aspect_ratio=decrease,pad=${dims.w}:${dims.h}:(ow-iw)/2:(oh-ih)/2`);
  } else {
    // No cuts — just scale
    args.push('-vf', `scale=${dims.w}:${dims.h}:force_original_aspect_ratio=decrease,pad=${dims.w}:${dims.h}:(ow-iw)/2:(oh-ih)/2`);
  }

  // Audio enhancement filters (applied before encoding)
  const audioFilters = [];
  if (studioSound) {
    // High-pass to remove rumble, de-ess, compress dynamics, add presence
    audioFilters.push('highpass=f=80');
    audioFilters.push('lowpass=f=12000');
    audioFilters.push('acompressor=threshold=-20dB:ratio=4:attack=5:release=50');
    audioFilters.push('equalizer=f=3000:t=q:w=1.5:g=3'); // presence boost
    audioFilters.push('equalizer=f=200:t=q:w=1:g=-2');    // reduce mud
    log.info('Studio Sound enabled', { projectId });
  }
  if (normalizeAudio) {
    audioFilters.push(`loudnorm=I=${targetLufs}:TP=-1.5:LRA=11`);
    log.info('Audio normalization enabled', { projectId, targetLufs });
  }
  if (audioFilters.length > 0) {
    // If we already have -af from EDL select, chain onto it; otherwise add new
    const existingAfIdx = args.indexOf('-af');
    if (existingAfIdx >= 0) {
      args[existingAfIdx + 1] += ',' + audioFilters.join(',');
    } else {
      args.push('-af', audioFilters.join(','));
    }
  }

  // Codec settings
  const crf = quality === 'high' ? '18' : quality === 'medium' ? '23' : '28';
  args.push('-c:v', codec, '-crf', crf, '-preset', 'medium');
  args.push('-c:a', 'aac', '-b:a', '192k');
  args.push('-movflags', '+faststart');
  args.push(outputPath);

  // Run FFmpeg with progress
  const totalFrames = Math.round((durationMs / 1000) * 30); // estimate
  await runFFmpeg(args, totalFrames);

  // Get output file info
  const stat = await fs.stat(outputPath);

  const result = {
    path: outputPath,
    name: outputName,
    size: stat.size,
    format,
    resolution,
    cuts_applied: edl.cuts.length,
    original_duration_ms: durationMs,
    edited_duration_ms: selectResult
      ? Math.round(selectResult.keeps.reduce((sum, k) => sum + (k.end - k.start), 0) * 1000)
      : durationMs,
  };

  log.info('Render complete', {
    projectId,
    output: outputName,
    size: stat.size,
    cuts: edl.cuts.length,
    durationMs: Date.now() - start,
  });

  return result;
}

/**
 * Generate a social clip from a time range.
 */
async function renderClip(projectId, { startMs, endMs, format = '9:16', resolution = '1080p' }) {
  const projectDir = path.join(config.storageRoot, projectId);
  const mediaDir = path.join(projectDir, 'media');
  const exportsDir = path.join(projectDir, 'exports');

  const sourceFile = findSourceFile(mediaDir);
  if (!sourceFile) throw new ValidationError('No source media found');

  const resMap = { '1080p': '1920:1080', '720p': '1280:720' };
  const res = resMap[resolution] || '1920:1080';
  const [w, h] = res.split(':').map(Number);
  const dims = getOutputDimensions(format, w, h);

  const clipName = `clip-${startMs}-${endMs}-${format.replace(/[:/]/g, 'x')}.mp4`;
  const outputPath = path.join(exportsDir, clipName);
  await fs.mkdir(exportsDir, { recursive: true });

  const durationSec = (endMs - startMs) / 1000;
  const args = [
    '-ss', String(startMs / 1000),
    '-t', String(durationSec),
    '-i', sourceFile,
    '-vf', `scale=${dims.w}:${dims.h}:force_original_aspect_ratio=decrease,pad=${dims.w}:${dims.h}:(ow-iw)/2:(oh-ih)/2`,
    '-c:v', 'libx264', '-crf', '20', '-preset', 'medium',
    '-c:a', 'aac', '-b:a', '192k',
    '-movflags', '+faststart',
    '-y', outputPath,
  ];

  await runFFmpeg(args);

  const stat = await fs.stat(outputPath);
  return { path: outputPath, name: clipName, size: stat.size, duration_ms: endMs - startMs };
}

/**
 * Calculate output dimensions for a given format.
 */
function getOutputDimensions(format, baseW, baseH) {
  switch (format) {
    case '9:16': return { w: baseH * 9 / 16, h: baseH }; // vertical
    case '1:1':  return { w: Math.min(baseW, baseH), h: Math.min(baseW, baseH) }; // square
    case '4:5':  return { w: baseH * 4 / 5, h: baseH };
    case '16:9':
    default:     return { w: baseW, h: baseH };
  }
}

/**
 * Find the source media file in the media directory.
 */
function findSourceFile(mediaDir) {
  const exts = ['.mp4', '.mov', '.webm', '.mkv', '.avi', '.wav', '.mp3', '.m4a'];
  for (const ext of exts) {
    const p = path.join(mediaDir, `source${ext}`);
    if (existsSync(p)) return p;
  }
  return null;
}

/**
 * Run FFmpeg and return when complete. Optionally tracks progress.
 */
function runFFmpeg(args, totalFrames) {
  return new Promise((resolve, reject) => {
    const proc = spawn('ffmpeg', args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stderr = '';

    proc.stderr.on('data', chunk => {
      stderr += chunk.toString();
    });

    proc.on('close', code => {
      if (code === 0) resolve({ success: true });
      else reject(new Error(`FFmpeg exited with code ${code}: ${stderr.slice(-500)}`));
    });

    proc.on('error', err => reject(err));
  });
}

/**
 * Run FFmpeg with progress events streamed back via an EventEmitter.
 * Parses stderr for "time=HH:MM:SS.ss" to compute percentage.
 * Emits: 'progress' (number 0-100), 'done' (result), 'error' (Error)
 */
function runFFmpegWithProgress(args, durationMs) {
  const { EventEmitter } = require('events');
  const emitter = new EventEmitter();

  const proc = spawn('ffmpeg', args, { stdio: ['ignore', 'pipe', 'pipe'] });
  let stderr = '';

  proc.stderr.on('data', chunk => {
    stderr += chunk.toString();
    // Parse: "time=00:01:23.45"
    const matches = stderr.match(/time=(\d+):(\d+):(\d+\.\d+)/g);
    if (matches && durationMs > 0) {
      const last = matches[matches.length - 1];
      const m = last.match(/time=(\d+):(\d+):(\d+\.\d+)/);
      if (m) {
        const sec = parseInt(m[1]) * 3600 + parseInt(m[2]) * 60 + parseFloat(m[3]);
        const pct = Math.min(99, Math.round((sec * 1000 / durationMs) * 100));
        emitter.emit('progress', pct);
      }
    }
  });

  proc.on('close', code => {
    if (code === 0) {
      emitter.emit('progress', 100);
      emitter.emit('done', { success: true });
    } else {
      emitter.emit('error', new Error(`FFmpeg exited with code ${code}: ${stderr.slice(-500)}`));
    }
  });

  proc.on('error', err => emitter.emit('error', err));

  return emitter;
}

/**
 * Stream-based render that emits progress events.
 * Returns an EventEmitter that emits 'progress', 'done', 'error'.
 */
function renderWithProgress(projectId, options = {}) {
  const { EventEmitter } = require('events');
  const emitter = new EventEmitter();

  // Run the full render pipeline asynchronously
  (async () => {
    try {
      const {
        format = '16:9',
        resolution = '1080p',
        codec = 'libx264',
        quality = 'high',
      } = options;

      log.info('Starting render (streaming)', { projectId, format, resolution, quality });
      const start = Date.now();

      const projectDir = path.join(config.storageRoot, projectId);
      const mediaDir = path.join(projectDir, 'media');
      const dataDir = path.join(projectDir, 'data');
      const exportsDir = path.join(projectDir, 'exports');

      const sourceFile = findSourceFile(mediaDir);
      if (!sourceFile) throw new ValidationError('No source media found');

      const edlPath = path.join(dataDir, 'edl.json');
      let edl = { version: 1, cuts: [] };
      if (existsSync(edlPath)) {
        edl = JSON.parse(await fs.readFile(edlPath, 'utf-8'));
      }

      const { stdout } = await exec('ffprobe', [
        '-v', 'quiet', '-show_entries', 'format=duration',
        '-of', 'csv=p=0', sourceFile,
      ]);
      const durationMs = Math.round(parseFloat(stdout.trim()) * 1000);

      const resMap = { '1080p': '1920:1080', '720p': '1280:720', '4k': '3840:2160' };
      const res = resMap[resolution] || '1920:1080';
      const [w, h] = res.split(':').map(Number);
      const dims = getOutputDimensions(format, w, h);
      const outputName = `${format.replace(/[:/]/g, 'x')}-${resolution}.mp4`;
      const outputPath = path.join(exportsDir, outputName);
      await fs.mkdir(exportsDir, { recursive: true });

      const args = ['-i', sourceFile, '-y'];
      const selectResult = buildSelectFilter(edl, durationMs);

      if (selectResult && selectResult.keeps.length > 1) {
        const { filterGraph } = buildConcatFilter(selectResult.keeps);
        const scaleFilter = `[outv]scale=${dims.w}:${dims.h}:force_original_aspect_ratio=decrease,pad=${dims.w}:${dims.h}:(ow-iw)/2:(oh-ih)/2[finalv]`;
        args.push('-filter_complex', `${filterGraph}; ${scaleFilter}`);
        args.push('-map', '[finalv]', '-map', '[outa]');
      } else if (selectResult && selectResult.keeps.length === 1) {
        const k = selectResult.keeps[0];
        args.push('-ss', k.start.toFixed(3), '-t', (k.end - k.start).toFixed(3));
        args.push('-vf', `scale=${dims.w}:${dims.h}:force_original_aspect_ratio=decrease,pad=${dims.w}:${dims.h}:(ow-iw)/2:(oh-ih)/2`);
      } else {
        args.push('-vf', `scale=${dims.w}:${dims.h}:force_original_aspect_ratio=decrease,pad=${dims.w}:${dims.h}:(ow-iw)/2:(oh-ih)/2`);
      }

      const crf = quality === 'high' ? '18' : quality === 'medium' ? '23' : '28';
      args.push('-c:v', codec, '-crf', crf, '-preset', 'medium');
      args.push('-c:a', 'aac', '-b:a', '192k');
      args.push('-movflags', '+faststart');
      args.push(outputPath);

      // Run FFmpeg with progress tracking
      const ffmpeg = runFFmpegWithProgress(args, durationMs);

      ffmpeg.on('progress', pct => emitter.emit('progress', pct));

      ffmpeg.on('done', async () => {
        try {
          const stat = await fs.stat(outputPath);
          const result = {
            path: outputPath,
            name: outputName,
            size: stat.size,
            format,
            resolution,
            cuts_applied: edl.cuts.length,
            original_duration_ms: durationMs,
            edited_duration_ms: selectResult
              ? Math.round(selectResult.keeps.reduce((sum, k) => sum + (k.end - k.start), 0) * 1000)
              : durationMs,
          };

          log.info('Render complete (streaming)', {
            projectId, output: outputName, size: stat.size,
            cuts: edl.cuts.length, durationMs: Date.now() - start,
          });

          emitter.emit('done', result);
        } catch (err) {
          emitter.emit('error', err);
        }
      });

      ffmpeg.on('error', err => emitter.emit('error', err));

    } catch (err) {
      emitter.emit('error', err);
    }
  })();

  return emitter;
}

/**
 * Render a composed video with PiP overlay, audio track selection, and caption burn-in.
 * Driven by the template's `composition` config and `trackRoles`.
 *
 * @param {string} projectId
 * @param {object} options - { format, resolution, quality, composition, tracks }
 *   composition: { main: { source }, pip: { enabled, source, position, size, shape, margin, border },
 *                  captions: { enabled, burnIn } }
 *   tracks: array from tracks.json (with role field)
 */
async function renderComposed(projectId, options = {}) {
  const {
    format = '16:9',
    resolution = '1080p',
    quality = 'high',
    composition = {},
    studioSound = false,
    normalizeAudio = false,
    targetLufs = -14,
  } = options;

  log.info('Starting composed render', { projectId, format, resolution });
  const start = Date.now();

  const projectDir = path.join(config.storageRoot, projectId);
  const mediaDir = path.join(projectDir, 'media');
  const dataDir = path.join(projectDir, 'data');
  const exportsDir = path.join(projectDir, 'exports');

  const sourceFile = findSourceFile(mediaDir);
  if (!sourceFile) throw new ValidationError('No source media found');

  // Load tracks with roles
  const tracksPath = path.join(dataDir, 'tracks.json');
  let tracks = [];
  if (existsSync(tracksPath)) {
    tracks = JSON.parse(await fs.readFile(tracksPath, 'utf-8'));
  }

  // Load EDL
  const edlPath = path.join(dataDir, 'edl.json');
  let edl = { version: 1, cuts: [] };
  if (existsSync(edlPath)) {
    edl = JSON.parse(await fs.readFile(edlPath, 'utf-8'));
  }

  // Get source duration
  const { stdout } = await exec('ffprobe', [
    '-v', 'quiet', '-show_entries', 'format=duration',
    '-of', 'csv=p=0', sourceFile,
  ]);
  const durationMs = Math.round(parseFloat(stdout.trim()) * 1000);

  // Output dimensions
  const resMap = { '1080p': '1920:1080', '720p': '1280:720', '4k': '3840:2160' };
  const res = resMap[resolution] || '1920:1080';
  const [outW, outH] = res.split(':').map(Number);
  const dims = getOutputDimensions(format, outW, outH);

  const outputName = `composed-${format.replace(/[:/]/g, 'x')}-${resolution}.mp4`;
  const outputPath = path.join(exportsDir, outputName);
  await fs.mkdir(exportsDir, { recursive: true });

  // Resolve track indices by role
  const videoTracks = tracks.filter(t => t.type === 'video');
  const audioTracks = tracks.filter(t => t.type === 'audio');

  function findTrackByRole(pool, role, fallbackIdx = 0) {
    const match = pool.find(t => t.role === role);
    return match ? pool.indexOf(match) : fallbackIdx;
  }

  const mainVideoIdx = findTrackByRole(videoTracks, 'main', 0);
  const pipVideoIdx = findTrackByRole(videoTracks, 'camera', videoTracks.length > 1 ? 1 : -1);
  const speakerAudioIdx = findTrackByRole(audioTracks, 'speaker', 0);

  const pip = composition.pip || {};
  const captions = composition.captions || {};

  // Build filter graph
  const filters = [];
  let videoOut = '';

  // Scale main video to output dimensions
  filters.push(`[0:v:${mainVideoIdx}]scale=${dims.w}:${dims.h}:force_original_aspect_ratio=decrease,pad=${dims.w}:${dims.h}:(ow-iw)/2:(oh-ih)/2[main]`);
  videoOut = '[main]';

  // PiP overlay
  if (pip.enabled !== false && pipVideoIdx >= 0 && pipVideoIdx < videoTracks.length) {
    const pipSize = pip.size || 280;
    const margin = pip.margin || 24;
    const pos = pip.position || 'bottom-right';

    // Scale PiP — if circle, make it square
    const pipW = pipSize;
    const pipH = pip.shape === 'circle' ? pipSize : Math.round(pipSize * 9 / 16);
    filters.push(`[0:v:${pipVideoIdx}]scale=${pipW}:${pipH}:force_original_aspect_ratio=decrease,pad=${pipW}:${pipH}:(ow-iw)/2:(oh-ih)/2${pip.shape === 'circle' ? `,geq=lum='lum(X,Y)':a='if(gt(pow(X-${pipW}/2,2)+pow(Y-${pipH}/2,2),pow(${Math.floor(pipW/2)},2)),0,255)'` : ''}[pip]`);

    // Position calculation
    let overlayX, overlayY;
    switch (pos) {
      case 'top-left':     overlayX = margin; overlayY = margin; break;
      case 'top-right':    overlayX = `W-w-${margin}`; overlayY = margin; break;
      case 'bottom-left':  overlayX = margin; overlayY = `H-h-${margin}`; break;
      case 'bottom-right':
      default:             overlayX = `W-w-${margin}`; overlayY = `H-h-${margin}`; break;
    }

    filters.push(`${videoOut}[pip]overlay=${overlayX}:${overlayY}[composed]`);
    videoOut = '[composed]';
  }

  // Caption burn-in
  const captionPath = path.join(dataDir, 'captions.ass');
  if (captions.enabled !== false && captions.burnIn !== false && existsSync(captionPath)) {
    // ASS subtitles filter — need to escape path colons on some platforms
    const escapedPath = captionPath.replace(/\\/g, '/').replace(/:/g, '\\:');
    filters.push(`${videoOut}ass='${escapedPath}'[captioned]`);
    videoOut = '[captioned]';
  }

  // Build FFmpeg args
  const args = ['-i', sourceFile, '-y'];

  if (filters.length > 0) {
    args.push('-filter_complex', filters.join('; '));
    args.push('-map', videoOut);
  }

  // Map the speaker audio track
  args.push('-map', `0:a:${speakerAudioIdx}`);

  // Audio enhancement
  const audioFilters = [];
  if (studioSound) {
    audioFilters.push('highpass=f=80', 'lowpass=f=12000');
    audioFilters.push('acompressor=threshold=-20dB:ratio=4:attack=5:release=50');
    audioFilters.push('equalizer=f=3000:t=q:w=1.5:g=3');
    audioFilters.push('equalizer=f=200:t=q:w=1:g=-2');
  }
  if (normalizeAudio) {
    audioFilters.push(`loudnorm=I=${targetLufs}:TP=-1.5:LRA=11`);
  }
  if (audioFilters.length > 0) {
    args.push('-af', audioFilters.join(','));
  }

  // Codec settings
  const crf = quality === 'high' ? '18' : quality === 'medium' ? '23' : '28';
  args.push('-c:v', 'libx264', '-crf', crf, '-preset', 'medium');
  args.push('-c:a', 'aac', '-b:a', '192k');
  args.push('-movflags', '+faststart');
  args.push(outputPath);

  log.info('Composed render FFmpeg args', { projectId, argCount: args.length });

  await runFFmpeg(args);

  const stat = await fs.stat(outputPath);
  const result = {
    path: outputPath,
    name: outputName,
    size: stat.size,
    format,
    resolution,
    cuts_applied: edl.cuts.length,
    original_duration_ms: durationMs,
    edited_duration_ms: durationMs,
    composed: true,
    pip: pip.enabled !== false && pipVideoIdx >= 0,
    captions_burned: captions.burnIn !== false && existsSync(captionPath),
  };

  log.info('Composed render complete', {
    projectId, output: outputName, size: stat.size,
    pip: result.pip, captions: result.captions_burned,
    durationMs: Date.now() - start,
  });

  return result;
}

module.exports = {
  render,
  renderClip,
  renderComposed,
  renderWithProgress,
  buildSelectFilter,
  buildConcatFilter,
  getOutputDimensions,
  findSourceFile,
};
