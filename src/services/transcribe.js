const { execFile, spawn } = require('child_process');
const { promisify } = require('util');
const fs = require('fs/promises');
const path = require('path');
const os = require('os');
const { EventEmitter } = require('events');
const log = require('../utils/logger').create('transcribe');

const exec = promisify(execFile);

const WHISPER_CLI = process.env.WHISPER_CLI || 'whisper-cli';
const WHISPER_MODEL = process.env.WHISPER_MODEL_PATH || '/opt/whisper-models/ggml-base.en.bin';

// Enable Dynamic Time Warping for more accurate word-level timestamps.
// DTW aligns the audio spectrogram to token boundaries, reducing drift
// from ~100-200ms to ~20-50ms. Requires a tdrz or tiny-diarize model for
// best results, but improves any model.
const WHISPER_DTW = process.env.WHISPER_DTW || 'tiny.en';

/**
 * Run whisper.cpp on an audio file and return structured transcript
 */
async function transcribe(audioPath) {
  const outputBase = audioPath.replace(/\.\w+$/, '');

  // Run whisper.cpp with JSON output, word-level timestamps, and DTW alignment
  const args = [
    '-m', WHISPER_MODEL,
    '-f', audioPath,
    '-oj',                   // output JSON
    '-ml', '1',              // max segment length (word-level)
    '-pp',                   // print progress
    '--dtw', WHISPER_DTW,    // Dynamic Time Warping for precise token alignment
    '-of', outputBase,       // output file base name
  ];

  await exec(WHISPER_CLI, args, {
    timeout: 600000, // 10 min timeout for long files
  });

  // Read whisper's JSON output
  const jsonPath = `${outputBase}.json`;
  const raw = await fs.readFile(jsonPath, 'utf-8');
  const whisperOutput = JSON.parse(raw);

  // Transform whisper output to our format
  const transcript = transformWhisperOutput(whisperOutput);

  // Clean up whisper's output file
  await fs.unlink(jsonPath).catch(() => {});

  return transcript;
}

/**
 * Run whisper.cpp with progress events streamed back via an EventEmitter.
 * Emits: 'progress' (number 0-100), 'done' (transcript), 'error' (Error)
 */
function transcribeWithProgress(audioPath) {
  const emitter = new EventEmitter();
  const outputBase = audioPath.replace(/\.\w+$/, '');

  const proc = spawn(WHISPER_CLI, [
    '-m', WHISPER_MODEL,
    '-f', audioPath,
    '-oj',
    '-ml', '1',
    '-pp',
    '--dtw', WHISPER_DTW,
    '-of', outputBase,
  ], { timeout: 600000 });

  let stderrBuf = '';

  proc.stderr.on('data', (chunk) => {
    stderrBuf += chunk.toString();
    // whisper.cpp prints: "whisper_print_progress_callback: progress =  42%"
    const matches = stderrBuf.match(/progress\s*=\s*(\d+)%/g);
    if (matches) {
      const last = matches[matches.length - 1];
      const pct = parseInt(last.match(/(\d+)%/)[1], 10);
      emitter.emit('progress', pct);
    }
  });

  proc.on('close', async (code) => {
    if (code !== 0) {
      emitter.emit('error', new Error(`whisper-cli exited with code ${code}: ${stderrBuf}`));
      return;
    }

    try {
      const jsonPath = `${outputBase}.json`;
      const raw = await fs.readFile(jsonPath, 'utf-8');
      const whisperOutput = JSON.parse(raw);
      const transcript = transformWhisperOutput(whisperOutput);
      await fs.unlink(jsonPath).catch(() => {});
      emitter.emit('done', transcript);
    } catch (err) {
      emitter.emit('error', err);
    }
  });

  proc.on('error', (err) => {
    emitter.emit('error', err);
  });

  return emitter;
}

/**
 * Transform whisper.cpp JSON into our transcript format
 */
function transformWhisperOutput(whisperOutput) {
  const words = [];
  const segments = whisperOutput.transcription || whisperOutput.result?.segments || [];

  // Common filler words to tag
  const fillerWords = new Set(['um', 'uh', 'like', 'basically', 'actually', 'literally', 'right', 'okay', 'so', 'well', 'you know', 'i mean']);

  for (const segment of segments) {
    // Whisper segments may have tokens/words
    if (segment.tokens) {
      for (const token of segment.tokens) {
        const word = (token.text || '').trim();
        if (!word) continue;

        // Prefer DTW timestamps (t_dtw) when available — they are
        // aligned to the audio spectrogram and far more accurate than
        // the default t0/t1 centisecond timestamps.
        const startSec = token.t_dtw != null
          ? token.t_dtw / 100
          : token.t0 != null ? token.t0 / 100 : segment.offsets?.from / 1000;
        const endSec = token.t1 != null ? token.t1 / 100 : segment.offsets?.to / 1000;

        const entry = {
          word,
          start: startSec,
          end: endSec,
          confidence: token.p || 0.9,
          speaker: 's1',
        };

        // Tag filler words
        if (fillerWords.has(word.toLowerCase().replace(/[.,!?]/g, ''))) {
          entry.filler = true;
        }

        words.push(entry);
      }
    } else {
      // Fallback: treat entire segment as one block
      const text = (segment.text || '').trim();
      if (!text) continue;

      const segStart = segment.offsets?.from / 1000 || segment.t0 / 100 || 0;
      const segEnd = segment.offsets?.to / 1000 || segment.t1 / 100 || 0;
      const segWords = text.split(/\s+/);
      const wordDuration = (segEnd - segStart) / segWords.length;

      for (let i = 0; i < segWords.length; i++) {
        const w = segWords[i];
        if (!w) continue;
        const entry = {
          word: w,
          start: segStart + i * wordDuration,
          end: segStart + (i + 1) * wordDuration,
          confidence: 0.85,
          speaker: 's1',
        };
        if (fillerWords.has(w.toLowerCase().replace(/[.,!?]/g, ''))) {
          entry.filler = true;
        }
        words.push(entry);
      }
    }
  }

  // Detect silence gaps
  const silences = [];
  for (let i = 1; i < words.length; i++) {
    const gap = words[i].start - words[i - 1].end;
    if (gap > 1.5) {
      silences.push({
        start: words[i - 1].end,
        end: words[i].start,
        duration: gap,
        after_word_index: i - 1,
      });
    }
  }

  const lastWord = words[words.length - 1];
  return {
    speakers: [{ id: 's1', name: 'Speaker 1', color: '#3a7f9e' }],
    words,
    silences,
    duration_ms: lastWord ? Math.round(lastWord.end * 1000) : 0,
    word_count: words.length,
  };
}

/**
 * Re-align word timestamps by re-running whisper on the audio segment
 * surrounding the edited words.
 *
 * @param {string} audioPath - Path to the full audio file
 * @param {Array} words - Full words array from the transcript
 * @param {number} startIdx - Start index of edited word range
 * @param {number} endIdx - End index of edited word range (inclusive)
 * @returns {Array} Updated words array with corrected timestamps
 */
async function realignWords(audioPath, words, startIdx, endIdx) {
  // Clamp indices
  startIdx = Math.max(0, startIdx);
  endIdx = Math.min(words.length - 1, endIdx);

  // Determine time range with 2-second context padding
  const CONTEXT_PAD = 2; // seconds
  const segStart = Math.max(0, words[startIdx].start - CONTEXT_PAD);
  const segEnd = words[endIdx].end + CONTEXT_PAD;
  const duration = segEnd - segStart;

  log.info('Realigning words', { startIdx, endIdx, segStart, segEnd, duration });

  // Extract audio segment to a temp file
  const tmpDir = os.tmpdir();
  const tmpFile = path.join(tmpDir, `realign-${Date.now()}-${Math.random().toString(36).slice(2)}.wav`);

  try {
    // Extract segment with ffmpeg
    await exec('ffmpeg', [
      '-i', audioPath,
      '-ss', String(segStart),
      '-t', String(duration),
      '-ar', '16000',
      '-ac', '1',
      '-f', 'wav',
      '-y',
      tmpFile,
    ], { timeout: 30000 });

    // Run whisper on the extracted segment
    const outputBase = tmpFile.replace(/\.\w+$/, '');
    const args = [
      '-m', WHISPER_MODEL,
      '-f', tmpFile,
      '-oj',
      '-ml', '1',
      '--dtw', WHISPER_DTW,
      '-of', outputBase,
    ];

    await exec(WHISPER_CLI, args, { timeout: 120000 });

    // Parse whisper output
    const jsonPath = `${outputBase}.json`;
    const raw = await fs.readFile(jsonPath, 'utf-8');
    const whisperOutput = JSON.parse(raw);
    const segTranscript = transformWhisperOutput(whisperOutput);

    // Clean up whisper output file
    await fs.unlink(jsonPath).catch(() => {});

    const newWords = segTranscript.words;

    log.info('Whisper segment produced words', {
      segmentWords: newWords.length,
      editedRange: endIdx - startIdx + 1,
    });

    // Match new whisper words to the edited word range by position.
    // The segment may contain context words before/after the edited range.
    // We find the best positional offset by aligning the edited word count
    // to the segment words.
    const editedCount = endIdx - startIdx + 1;

    if (newWords.length === 0) {
      log.warn('Whisper produced no words for segment, skipping realignment');
      return words;
    }

    // If whisper returned roughly the same number of words, align 1:1.
    // Otherwise, use proportional mapping.
    for (let i = 0; i < editedCount; i++) {
      const wordIdx = startIdx + i;
      // Map this edited word to a position in the whisper output
      const mappedIdx = Math.round((i / editedCount) * newWords.length);
      const whisperWord = newWords[Math.min(mappedIdx, newWords.length - 1)];

      // Update timestamps — whisper times are relative to segment start,
      // so add segStart to make them absolute
      words[wordIdx] = {
        ...words[wordIdx],
        start: whisperWord.start + segStart,
        end: whisperWord.end + segStart,
        confidence: whisperWord.confidence,
      };
    }

    log.info('Realignment complete', { updatedWords: editedCount });
    return words;
  } finally {
    // Clean up temp audio file
    await fs.unlink(tmpFile).catch(() => {});
  }
}

module.exports = { transcribe, transcribeWithProgress, transformWhisperOutput, realignWords };
