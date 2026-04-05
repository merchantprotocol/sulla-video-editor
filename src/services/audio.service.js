const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs/promises');
const { existsSync } = require('fs');
const config = require('../utils/config');
const log = require('../utils/logger').create('audio');
const { EventEmitter } = require('events');

/**
 * Apply studio sound enhancement to a project's audio.
 * Creates an enhanced audio file that can be used for playback preview.
 *
 * Returns an EventEmitter that emits:
 *  - 'progress' (number 0-100)
 *  - 'done' ({ enhancedPath, duration_ms })
 *  - 'error' (Error)
 */
function applyStudioSound(projectId) {
  const emitter = new EventEmitter();
  const projectDir = path.join(config.storageRoot, projectId);
  const audioPath = path.join(projectDir, 'media', 'audio.wav');
  const enhancedPath = path.join(projectDir, 'media', 'audio-enhanced.wav');

  if (!existsSync(audioPath)) {
    setTimeout(() => emitter.emit('error', new Error('No audio file found')), 0);
    return emitter;
  }

  log.info('Applying Studio Sound', { projectId });

  // Get duration first for progress calculation
  const probe = spawn('ffprobe', [
    '-v', 'quiet', '-show_entries', 'format=duration', '-of', 'csv=p=0', audioPath,
  ]);

  let durationSec = 0;
  let probeOut = '';
  probe.stdout.on('data', d => probeOut += d.toString());
  probe.on('close', () => {
    durationSec = parseFloat(probeOut.trim()) || 0;

    // Run FFmpeg with studio sound filters
    const proc = spawn('ffmpeg', [
      '-i', audioPath,
      '-af', [
        'highpass=f=80',
        'lowpass=f=12000',
        'acompressor=threshold=-20dB:ratio=4:attack=5:release=50',
        'equalizer=f=3000:t=q:w=1.5:g=3',
        'equalizer=f=200:t=q:w=1:g=-2',
      ].join(','),
      '-y', enhancedPath,
      '-progress', 'pipe:1',
    ]);

    let lastProgress = 0;
    proc.stdout.on('data', (chunk) => {
      const lines = chunk.toString().split('\n');
      for (const line of lines) {
        const match = line.match(/out_time_ms=(\d+)/);
        if (match && durationSec > 0) {
          const pct = Math.min(100, Math.round((parseInt(match[1]) / 1000000) / durationSec * 100));
          if (pct > lastProgress) {
            lastProgress = pct;
            emitter.emit('progress', pct);
          }
        }
      }
    });

    proc.on('close', async (code) => {
      if (code !== 0) {
        emitter.emit('error', new Error(`FFmpeg exited with code ${code}`));
        return;
      }

      log.info('Studio Sound applied', { projectId, enhancedPath });
      emitter.emit('done', {
        enhancedPath,
        duration_ms: Math.round(durationSec * 1000),
      });
    });

    proc.on('error', (err) => emitter.emit('error', err));
  });

  return emitter;
}

/**
 * Apply loudness normalization to a project's audio.
 */
function applyNormalize(projectId, targetLufs = -14) {
  const emitter = new EventEmitter();
  const projectDir = path.join(config.storageRoot, projectId);

  // Use enhanced audio if it exists, otherwise original
  const inputPath = existsSync(path.join(projectDir, 'media', 'audio-enhanced.wav'))
    ? path.join(projectDir, 'media', 'audio-enhanced.wav')
    : path.join(projectDir, 'media', 'audio.wav');
  const normalizedPath = path.join(projectDir, 'media', 'audio-normalized.wav');

  if (!existsSync(inputPath)) {
    setTimeout(() => emitter.emit('error', new Error('No audio file found')), 0);
    return emitter;
  }

  log.info('Normalizing audio', { projectId, targetLufs });

  const proc = spawn('ffmpeg', [
    '-i', inputPath,
    '-af', `loudnorm=I=${targetLufs}:TP=-1.5:LRA=11`,
    '-y', normalizedPath,
    '-progress', 'pipe:1',
  ]);

  proc.stdout.on('data', (chunk) => {
    const match = chunk.toString().match(/out_time_ms=(\d+)/);
    if (match) emitter.emit('progress', Math.min(100, parseInt(match[1]) / 10000));
  });

  proc.on('close', (code) => {
    if (code !== 0) {
      emitter.emit('error', new Error(`FFmpeg exited with code ${code}`));
      return;
    }
    log.info('Audio normalized', { projectId });
    emitter.emit('done', { normalizedPath });
  });

  proc.on('error', (err) => emitter.emit('error', err));

  return emitter;
}

module.exports = { applyStudioSound, applyNormalize };
