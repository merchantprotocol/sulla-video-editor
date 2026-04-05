const { execFile, spawn } = require('child_process');
const { promisify } = require('util');
const path = require('path');
const fs = require('fs/promises');
const { existsSync } = require('fs');
const config = require('../utils/config');
const { ValidationError } = require('../utils/errors');

const exec = promisify(execFile);

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
 * Render a project using FFmpeg.
 * Applies EDL cuts, optional captions, and exports to the specified format.
 */
async function render(projectId, options = {}) {
  const {
    format = '16:9',
    resolution = '1080p',
    codec = 'libx264',
    quality = 'high',
  } = options;

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

  // Video filters
  const vFilters = [];

  // Apply EDL cuts
  const selectResult = buildSelectFilter(edl, durationMs);
  if (selectResult) {
    vFilters.push(`select='${selectResult.selectExpr}'`);
    vFilters.push('setpts=N/FRAME_RATE/TB');
  }

  // Scale + crop for target format
  vFilters.push(`scale=${dims.w}:${dims.h}:force_original_aspect_ratio=decrease`);
  vFilters.push(`pad=${dims.w}:${dims.h}:(ow-iw)/2:(oh-ih)/2`);

  args.push('-vf', vFilters.join(','));

  // Audio filters (apply same cuts)
  if (selectResult) {
    args.push('-af', `aselect='${selectResult.selectExpr}',asetpts=N/SR/TB`);
  }

  // Codec settings
  const crf = quality === 'high' ? '18' : quality === 'medium' ? '23' : '28';
  args.push('-c:v', codec, '-crf', crf, '-preset', 'medium');
  args.push('-c:a', 'aac', '-b:a', '192k');
  args.push('-movflags', '+faststart');
  args.push(outputPath);

  // Run FFmpeg with progress
  const totalFrames = Math.round((durationMs / 1000) * 30); // estimate
  const result = await runFFmpeg(args, totalFrames);

  // Get output file info
  const stat = await fs.stat(outputPath);

  return {
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

module.exports = {
  render,
  renderClip,
  buildSelectFilter,
  getOutputDimensions,
  findSourceFile,
};
