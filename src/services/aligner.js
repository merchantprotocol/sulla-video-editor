/**
 * Forced alignment client — sends audio + transcript to the wav2vec2 CTC
 * alignment sidecar for ~20ms-accurate word-level timestamps.
 *
 * Architecture: whisper produces TEXT, the aligner produces TIMESTAMPS.
 * This is the same two-phase approach used by Descript and WhisperX.
 */

const fs = require('fs');
const path = require('path');
const log = require('../utils/logger').create('aligner');

const ALIGNER_URL = process.env.ALIGNER_URL || 'http://aligner:8765';

/**
 * Check if the alignment service is available.
 */
async function isAvailable() {
  try {
    const res = await fetch(`${ALIGNER_URL}/health`, { signal: AbortSignal.timeout(3000) });
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * Send audio + transcript text to the forced alignment service.
 * Returns word-level timestamps from wav2vec2 CTC alignment.
 *
 * @param {string} audioPath - Path to the WAV audio file
 * @param {string} transcript - Plain text transcript (words separated by spaces)
 * @returns {Array<{word: string, start: number, end: number, score: number}>}
 */
async function align(audioPath, transcript) {
  const formData = new FormData();

  // Read audio file as a Blob
  const audioBuffer = fs.readFileSync(audioPath);
  const audioBlob = new Blob([audioBuffer], { type: 'audio/wav' });
  formData.append('audio', audioBlob, path.basename(audioPath));
  formData.append('transcript', transcript);

  log.info('Sending to forced aligner', {
    audioSize: audioBuffer.length,
    wordCount: transcript.split(/\s+/).length,
  });

  const res = await fetch(`${ALIGNER_URL}/align`, {
    method: 'POST',
    body: formData,
    signal: AbortSignal.timeout(300000), // 5 min timeout for long files
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Alignment service error ${res.status}: ${body}`);
  }

  const data = await res.json();
  log.info('Alignment complete', { words: data.words?.length });
  return data.words;
}

module.exports = { isAvailable, align };
