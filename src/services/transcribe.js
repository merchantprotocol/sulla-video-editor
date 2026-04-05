const { execFile, spawn } = require('child_process');
const { promisify } = require('util');
const fs = require('fs/promises');
const path = require('path');
const { EventEmitter } = require('events');

const exec = promisify(execFile);

const WHISPER_CLI = process.env.WHISPER_CLI || 'whisper-cli';
const WHISPER_MODEL = process.env.WHISPER_MODEL_PATH || '/opt/whisper-models/ggml-base.en.bin';

/**
 * Run whisper.cpp on an audio file and return structured transcript
 */
async function transcribe(audioPath) {
  const outputBase = audioPath.replace(/\.\w+$/, '');

  // Run whisper.cpp with JSON output and word-level timestamps
  await exec(WHISPER_CLI, [
    '-m', WHISPER_MODEL,
    '-f', audioPath,
    '-oj',          // output JSON
    '-ml', '1',     // max segment length (word-level)
    '-pp',          // print progress
    '-of', outputBase, // output file base name
  ], {
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

        const entry = {
          word,
          start: token.t0 != null ? token.t0 / 100 : segment.offsets?.from / 1000,
          end: token.t1 != null ? token.t1 / 100 : segment.offsets?.to / 1000,
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

module.exports = { transcribe, transcribeWithProgress, transformWhisperOutput };
