// Use full puppeteer if available (has bundled Chromium), fall back to puppeteer-core
let puppeteer;
try { puppeteer = require('puppeteer'); } catch { puppeteer = require('puppeteer-core'); }
const { spawn, execFile } = require('child_process');
const { promisify } = require('util');
const path = require('path');
const fs = require('fs/promises');
const { existsSync } = require('fs');
const config = require('../utils/config');
const log = require('../utils/logger').create('capture');

const exec = promisify(execFile);

const CHROMIUM_PATH = process.env.PUPPETEER_EXECUTABLE_PATH || '/usr/bin/google-chrome-stable';

/**
 * Render a React composition project to video.
 *
 * The React project must expose a global `window.setFrame(frameNumber)` function
 * that updates the visual state for that frame. The composition entry point
 * should read config from window.__SULLA__:
 *
 *   window.__SULLA__ = { fps: 30, width: 1920, height: 1080, totalFrames: 450 }
 *
 * Pipeline:
 *   1. npm install + npm run build
 *   2. Serve built files on a temp port
 *   3. Puppeteer loads the page once
 *   4. For each frame: call window.setFrame(n) → screenshot
 *   5. FFmpeg encodes PNG sequence to MP4
 */
async function renderReactProject(compositionDir, outputPath, options = {}) {
  const {
    width = 1920,
    height = 1080,
    fps = 30,
    durationSec = 10,
    quality = 'high',
  } = options;

  const totalFrames = Math.ceil(fps * durationSec);
  const framesDir = path.join(compositionDir, '.frames');

  log.info('Starting React render', { compositionDir, width, height, fps, totalFrames, durationSec });
  const start = Date.now();

  // 1. Build the React project
  await buildProject(compositionDir);

  // 2. Find built output
  const distDir = findDistDir(compositionDir);
  if (!distDir) throw new Error('No build output found (expected dist/ or build/)');

  // 3. Start static server
  const { server, port } = await startStaticServer(distDir);
  log.info('Serving composition', { port });

  try {
    // 4. Capture frames
    await fs.mkdir(framesDir, { recursive: true });
    await captureFrames(`http://localhost:${port}`, framesDir, {
      width, height, fps, totalFrames,
    });

    // 5. Encode to video
    log.info('Encoding frames to video');
    const crf = quality === 'high' ? '18' : quality === 'medium' ? '23' : '28';
    await runFFmpeg([
      '-framerate', String(fps),
      '-i', path.join(framesDir, 'frame-%06d.png'),
      '-c:v', 'libx264',
      '-crf', crf,
      '-preset', 'medium',
      '-pix_fmt', 'yuv420p',
      '-movflags', '+faststart',
      '-y', outputPath,
    ]);

    const stat = await fs.stat(outputPath);
    log.info('React render complete', {
      output: outputPath, frames: totalFrames, size: stat.size,
      renderMs: Date.now() - start,
    });

    return { path: outputPath, size: stat.size, width, height, fps, totalFrames, duration_ms: durationSec * 1000 };
  } finally {
    server.close();
    await fs.rm(framesDir, { recursive: true, force: true }).catch(() => {});
  }
}

/**
 * Build the React project.
 */
async function buildProject(projectDir) {
  const pkgPath = path.join(projectDir, 'package.json');
  if (!existsSync(pkgPath)) throw new Error('No package.json found in composition directory');

  if (!existsSync(path.join(projectDir, 'node_modules'))) {
    log.info('Installing dependencies');
    await exec('npm', ['install', '--production=false'], { cwd: projectDir, timeout: 120000 });
  }

  log.info('Building project');
  await exec('npm', ['run', 'build'], { cwd: projectDir, timeout: 120000 });
}

/**
 * Find build output directory.
 */
function findDistDir(projectDir) {
  for (const dir of ['dist', 'build', 'out']) {
    const p = path.join(projectDir, dir);
    if (existsSync(p) && existsSync(path.join(p, 'index.html'))) return p;
  }
  return null;
}

/**
 * Start a static file server.
 */
function startStaticServer(dir) {
  return new Promise((resolve) => {
    const express = require('express');
    const app = express();
    app.use(express.static(dir));
    app.get('*', (req, res) => res.sendFile(path.join(dir, 'index.html')));
    const server = app.listen(0, () => {
      resolve({ server, port: server.address().port });
    });
  });
}

/**
 * Capture frames — single page load, advance frame via JS.
 *
 * The React app must expose window.setFrame(n) which updates the render.
 * If setFrame doesn't exist, falls back to URL param ?frame=N (slower).
 */
async function captureFrames(baseUrl, framesDir, { width, height, fps, totalFrames }) {
  log.info('Launching browser');
  const browser = await puppeteer.launch({
    executablePath: CHROMIUM_PATH,
    headless: 'shell',
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
      `--window-size=${width},${height}`,
    ],
  });

  const page = await browser.newPage();
  await page.setViewport({ width, height, deviceScaleFactor: 1 });

  // Inject composition config before page loads
  await page.evaluateOnNewDocument((cfg) => {
    window.__SULLA__ = cfg;
  }, { fps, width, height, totalFrames });

  // Load the page once
  await page.goto(baseUrl, { waitUntil: 'networkidle0', timeout: 30000 });

  // Check if the app exposes setFrame
  const hasSetFrame = await page.evaluate(() => typeof window.setFrame === 'function');
  const logInterval = Math.max(1, Math.floor(totalFrames / 20));

  log.info('Capturing frames', { totalFrames, mode: hasSetFrame ? 'setFrame' : 'url-param' });

  for (let frame = 0; frame < totalFrames; frame++) {
    if (hasSetFrame) {
      // Fast path: call setFrame in the existing page
      await page.evaluate((f) => window.setFrame(f), frame);
      // Wait one animation frame for React to re-render
      await page.evaluate(() => new Promise(resolve => requestAnimationFrame(resolve)));
    } else {
      // Slow path: navigate to frame URL
      await page.goto(`${baseUrl}?frame=${frame}&totalFrames=${totalFrames}&fps=${fps}`, {
        waitUntil: 'networkidle0', timeout: 10000,
      });
    }

    const framePath = path.join(framesDir, `frame-${String(frame).padStart(6, '0')}.png`);
    await page.screenshot({ path: framePath, type: 'png' });

    if (frame % logInterval === 0) {
      log.info(`Frame ${frame + 1}/${totalFrames} (${Math.round(((frame + 1) / totalFrames) * 100)}%)`);
    }
  }

  await browser.close();
  log.info('All frames captured');
}

/**
 * Run FFmpeg.
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

module.exports = { renderReactProject, buildProject, findDistDir, captureFrames };
