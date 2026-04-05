const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs/promises');
const { existsSync } = require('fs');
const config = require('../utils/config');
const log = require('../utils/logger').create('compose');

/**
 * A composition defines a sequence of slides rendered to video via FFmpeg.
 *
 * Composition format:
 * {
 *   width: 1920,
 *   height: 1080,
 *   fps: 30,
 *   slides: [
 *     {
 *       duration: 5,           // seconds
 *       text: "Hello World",
 *       subtitle: "Optional subtitle",
 *       background: "#0d1117",
 *       textColor: "#e6edf3",
 *       accentColor: "#5096b3",
 *       fontSize: 64,
 *       subtitleSize: 28,
 *     }
 *   ]
 * }
 */

/**
 * Render a composition to video using FFmpeg drawtext filter chains.
 * Each slide becomes a segment, concatenated into the final output.
 */
async function renderComposition(projectId, composition, outputName = 'composition.mp4') {
  const { width = 1920, height = 1080, fps = 30, slides } = composition;

  if (!slides || slides.length === 0) {
    throw new Error('Composition must have at least one slide');
  }

  const projectDir = path.join(config.storageRoot, projectId);
  const exportsDir = path.join(projectDir, 'exports');
  const tempDir = path.join(projectDir, 'temp');
  await fs.mkdir(exportsDir, { recursive: true });
  await fs.mkdir(tempDir, { recursive: true });

  log.info('Rendering composition', { projectId, slides: slides.length, width, height, fps });
  const start = Date.now();

  // Render each slide as a separate video segment
  const segmentPaths = [];

  for (let i = 0; i < slides.length; i++) {
    const slide = slides[i];
    const segPath = path.join(tempDir, `slide-${String(i).padStart(3, '0')}.mp4`);
    segmentPaths.push(segPath);

    log.info(`Rendering slide ${i + 1}/${slides.length}`, { text: slide.text?.substring(0, 40) });

    await renderSlide(slide, segPath, { width, height, fps });
  }

  // Concatenate all segments
  const concatFile = path.join(tempDir, 'concat.txt');
  const concatContent = segmentPaths.map(p => `file '${p}'`).join('\n');
  await fs.writeFile(concatFile, concatContent);

  const outputPath = path.join(exportsDir, outputName);

  await runFFmpeg([
    '-f', 'concat', '-safe', '0',
    '-i', concatFile,
    '-c:v', 'libx264', '-crf', '18', '-preset', 'medium',
    '-pix_fmt', 'yuv420p',
    '-movflags', '+faststart',
    '-y', outputPath,
  ]);

  // Cleanup temp files
  for (const seg of segmentPaths) {
    await fs.unlink(seg).catch(() => {});
  }
  await fs.unlink(concatFile).catch(() => {});
  await fs.rmdir(tempDir).catch(() => {});

  const stat = await fs.stat(outputPath);
  const totalDuration = slides.reduce((sum, s) => sum + (s.duration || 5), 0);

  log.info('Composition complete', {
    projectId,
    output: outputName,
    slides: slides.length,
    duration: totalDuration,
    size: stat.size,
    renderMs: Date.now() - start,
  });

  return {
    path: outputPath,
    name: outputName,
    size: stat.size,
    duration_ms: totalDuration * 1000,
    slides: slides.length,
  };
}

/**
 * Render a single slide to a video segment using FFmpeg.
 */
async function renderSlide(slide, outputPath, { width, height, fps }) {
  const {
    duration = 5,
    text = '',
    subtitle = '',
    background = '#0d1117',
    textColor = '#e6edf3',
    accentColor = '#5096b3',
    fontSize = 64,
    subtitleSize = 28,
  } = slide;

  // FFmpeg color source → drawtext
  const args = [
    '-f', 'lavfi',
    '-i', `color=c=${background}:s=${width}x${height}:d=${duration}:r=${fps}`,
  ];

  // Build filter chain
  const filters = [];

  // Main text — centered
  if (text) {
    // Escape special chars for FFmpeg drawtext
    const escapedText = escapeDrawtext(text);
    filters.push(
      `drawtext=text='${escapedText}':fontsize=${fontSize}:fontcolor=${textColor}:` +
      `x=(w-text_w)/2:y=(h-text_h)/2-${subtitle ? 30 : 0}:` +
      `fontfile=/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf`
    );
  }

  // Subtitle — below main text
  if (subtitle) {
    const escapedSub = escapeDrawtext(subtitle);
    filters.push(
      `drawtext=text='${escapedSub}':fontsize=${subtitleSize}:fontcolor=${accentColor}:` +
      `x=(w-text_w)/2:y=(h/2)+40:` +
      `fontfile=/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf`
    );
  }

  // Accent bar under title
  if (text) {
    filters.push(
      `drawbox=x=(w/2)-30:y=(h/2)+${subtitle ? 80 : 50}:w=60:h=4:color=${accentColor}:t=fill`
    );
  }

  // Slide number watermark (bottom right)
  if (slide.slideNumber) {
    filters.push(
      `drawtext=text='${slide.slideNumber}':fontsize=16:fontcolor=${textColor}40:` +
      `x=w-text_w-30:y=h-text_h-20:` +
      `fontfile=/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf`
    );
  }

  if (filters.length > 0) {
    args.push('-vf', filters.join(','));
  }

  args.push(
    '-c:v', 'libx264', '-crf', '18', '-preset', 'fast',
    '-pix_fmt', 'yuv420p',
    '-y', outputPath
  );

  await runFFmpeg(args);
}

/**
 * Escape text for FFmpeg drawtext filter.
 */
function escapeDrawtext(text) {
  return text
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "'\\\\\\''")
    .replace(/:/g, '\\:')
    .replace(/%/g, '%%')
    .replace(/\n/g, '');
}

/**
 * Run FFmpeg and return a promise.
 */
function runFFmpeg(args) {
  return new Promise((resolve, reject) => {
    const proc = spawn('ffmpeg', args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stderr = '';
    proc.stderr.on('data', chunk => { stderr += chunk.toString(); });
    proc.on('close', code => {
      if (code === 0) resolve();
      else reject(new Error(`FFmpeg exited ${code}: ${stderr.slice(-300)}`));
    });
    proc.on('error', reject);
  });
}

module.exports = { renderComposition, renderSlide, escapeDrawtext };
