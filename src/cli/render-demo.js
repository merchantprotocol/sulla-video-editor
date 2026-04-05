#!/usr/bin/env node

/**
 * Render the Sulla demo video.
 * Usage: node src/cli/render-demo.js [output-path]
 *
 * This bypasses the API and renders directly using the compose service.
 * Useful for testing the FFmpeg pipeline without a running server.
 */

const path = require('path');
const fs = require('fs/promises');
const { renderComposition } = require('../services/compose.service');
const log = require('../utils/logger').create('cli');

const DEMO_COMP = require('../compositions/sulla-demo.json');

async function main() {
  const outputDir = process.argv[2] || path.join(__dirname, '..', '..', 'output');
  const projectId = 'demo-render';

  log.info('Starting demo render', { slides: DEMO_COMP.slides.length, outputDir });

  // Create a temp project directory structure
  const config = require('../utils/config');
  const projectDir = path.join(config.storageRoot, projectId);
  await fs.mkdir(path.join(projectDir, 'exports'), { recursive: true });
  await fs.mkdir(path.join(projectDir, 'data'), { recursive: true });
  await fs.mkdir(path.join(projectDir, 'temp'), { recursive: true });

  try {
    const result = await renderComposition(projectId, DEMO_COMP, 'sulla-demo.mp4');

    // Copy to output dir
    await fs.mkdir(outputDir, { recursive: true });
    const finalPath = path.join(outputDir, 'sulla-demo.mp4');
    await fs.copyFile(result.path, finalPath);

    log.info('Demo video saved', { path: finalPath, size: result.size, duration: result.duration_ms / 1000 + 's' });
    console.log(`\n  Video saved: ${finalPath}`);
    console.log(`  Size: ${(result.size / 1e6).toFixed(1)} MB`);
    console.log(`  Duration: ${result.duration_ms / 1000}s`);
    console.log(`  Slides: ${result.slides}\n`);
  } catch (err) {
    log.error('Demo render failed', { error: err.message, stack: err.stack });
    console.error('Render failed:', err.message);
    process.exit(1);
  }
}

main();
