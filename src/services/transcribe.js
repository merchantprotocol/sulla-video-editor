const { execFile, spawn } = require('child_process');
const { promisify } = require('util');
const fs = require('fs/promises');
const path = require('path');
const os = require('os');
const { EventEmitter } = require('events');
const log = require('../utils/logger').create('transcribe');
const Aligner = require('./aligner');

const exec = promisify(execFile);

const WHISPER_CLI = process.env.WHISPER_CLI || 'whisper-cli';
const WHISPER_MODEL = process.env.WHISPER_MODEL_PATH || '/opt/whisper-models/ggml-base.en.bin';

// Enable Dynamic Time Warping for more accurate word-level timestamps.
// DTW aligns the audio spectrogram to token boundaries, reducing drift
// from ~100-200ms to ~20-50ms. Requires a tdrz or tiny-diarize model for
// best results, but improves any model.
const WHISPER_DTW = process.env.WHISPER_DTW || 'large.v3.turbo';
const WHISPER_USE_GPU = process.env.WHISPER_USE_GPU === '1';

// Track active whisper processes and broadcast progress to multiple SSE observers
// Map: audioPath -> { proc, eventBus, lastProgress }
const activeTranscriptions = new Map();

/**
 * Expose the broadcast event bus for an active transcription so project.service
 * can emit 'transcription_complete' after saving, notifying all observers.
 */
function getActiveEventBus(audioPath) {
  return activeTranscriptions.get(audioPath)?.eventBus ?? null;
}

/**
 * Run whisper.cpp on an audio file and return structured transcript.
 * Uses SRT output with -ml 1 for word-level segments, plus DTW with
 * flash attention disabled (DTW requires standard attention).
 */
async function transcribe(audioPath) {
  const outputBase = audioPath.replace(/\.\w+$/, '');

  const args = [
    '-m', WHISPER_MODEL,
    '-f', audioPath,
    '-osrt',                 // SRT output (has word-level segments with -ml 1)
    '-ml', '1',              // max 1 char per segment = word-level output
    '-pp',                   // print progress
    '--dtw', WHISPER_DTW,    // Dynamic Time Warping for precise token alignment
    '--no-flash-attn',       // DTW is incompatible with flash attention
    '-of', outputBase,
    ...(!WHISPER_USE_GPU ? ['-ng'] : []),
  ];

  await exec('stdbuf', ['-eL', WHISPER_CLI, ...args], {
    timeout: 14400000,
  });

  const srtPath = `${outputBase}.srt`;
  const raw = await fs.readFile(srtPath, 'utf-8');
  const transcript = parseSrtToTranscript(raw);
  await fs.unlink(srtPath).catch(() => {});

  return transcript;
}

/**
 * Run whisper.cpp with progress events streamed back via an EventEmitter.
 * Emits: 'progress' (number 0-100), 'done' (transcript), 'error' (Error)
 */
function transcribeWithProgress(audioPath) {
  // If whisper already running: return an observer emitter that mirrors the shared bus.
  // This lets reconnected SSE clients see live progress without spawning a second process.
  if (activeTranscriptions.has(audioPath)) {
    const { eventBus, lastProgress } = activeTranscriptions.get(audioPath);
    const observer = new EventEmitter();
    observer._isObserver = true;

    // Replay last known progress so the reconnected client isn't stuck at 0%
    if (lastProgress > 0) process.nextTick(() => observer.emit('progress', lastProgress));

    const onProgress = (pct) => observer.emit('progress', pct);
    const onComplete = (summary) => observer.emit('transcription_complete', summary);
    const onError = (err) => observer.emit('error', err);

    eventBus.on('progress', onProgress);
    eventBus.once('transcription_complete', onComplete);
    eventBus.once('error', onError);

    observer.once('observer_detach', () => {
      eventBus.removeListener('progress', onProgress);
      eventBus.removeListener('transcription_complete', onComplete);
      eventBus.removeListener('error', onError);
    });
    return observer;
  }

  const emitter = new EventEmitter();
  const eventBus = new EventEmitter();
  eventBus.setMaxListeners(50);
  const outputBase = audioPath.replace(/\.\w+$/, '');

  // stdbuf -eL forces line-buffered stderr so progress lines flush immediately
  // instead of sitting in whisper's internal pipe buffer until the process exits.
  const proc = spawn('stdbuf', [
    '-eL', WHISPER_CLI,
    '-m', WHISPER_MODEL,
    '-f', audioPath,
    '-osrt',                 // SRT for word-level segments
    '-ml', '1',
    '-pp',
    '--dtw', WHISPER_DTW,
    '--no-flash-attn',       // DTW requires standard attention
    '-of', outputBase,
    ...(!WHISPER_USE_GPU ? ['-ng'] : []),
  ], { timeout: 14400000 });

  activeTranscriptions.set(audioPath, { proc, eventBus, lastProgress: 0 });

  let stderrBuf = '';
  let lastProgress = -1;

  proc.stderr.on('data', (chunk) => {
    stderrBuf += chunk.toString();
    // whisper.cpp prints: "whisper_print_progress_callback: progress =  42%"
    const matches = stderrBuf.match(/progress\s*=\s*(\d+)%/g);
    if (matches) {
      const last = matches[matches.length - 1];
      const pct = parseInt(last.match(/(\d+)%/)[1], 10);
      if (pct !== lastProgress) {
        lastProgress = pct;
        const entry = activeTranscriptions.get(audioPath);
        if (entry) entry.lastProgress = pct;
        emitter.emit('progress', pct);
        eventBus.emit('progress', pct);
      }
    }
  });

  proc.on('close', async (code) => {
    activeTranscriptions.delete(audioPath);
    if (code !== 0) {
      const err = new Error(`whisper-cli exited with code ${code}: ${stderrBuf.slice(-500)}`);
      emitter.emit('error', err);
      eventBus.emit('error', err);
      return;
    }

    try {
      const srtPath = `${outputBase}.srt`;
      const raw = await fs.readFile(srtPath, 'utf-8');
      const transcript = parseSrtToTranscript(raw);
      await fs.unlink(srtPath).catch(() => {});
      emitter.emit('done', transcript);
    } catch (err) {
      emitter.emit('error', err);
      eventBus.emit('error', err);
    }
  });

  proc.on('error', (err) => {
    activeTranscriptions.delete(audioPath);
    emitter.emit('error', err);
    eventBus.emit('error', err);
  });

  return emitter;
}

module.exports.getActiveEventBus = getActiveEventBus;

/**
 * Parse SRT timestamp "HH:MM:SS,mmm" to seconds
 */
function parseSrtTime(str) {
  const [time, ms] = str.split(',');
  const [h, m, s] = time.split(':').map(Number);
  return h * 3600 + m * 60 + s + parseInt(ms) / 1000;
}

/**
 * Parse whisper SRT output (word-level with -ml 1) into our transcript format.
 * Each SRT entry is a single word with precise DTW timestamps.
 */
function parseSrtToTranscript(srtText) {
  const fillerWords = new Set(['um', 'uh', 'like', 'basically', 'actually', 'literally', 'right', 'okay', 'so', 'well', 'you know', 'i mean']);
  const words = [];

  // Parse SRT entries: "1\n00:00:00,790 --> 00:00:01,990\n okay\n"
  const blocks = srtText.trim().split(/\n\n+/);
  for (const block of blocks) {
    const lines = block.trim().split('\n');
    if (lines.length < 2) continue;

    // Line 0: sequence number, Line 1: timestamps, Line 2+: text
    const tsLine = lines.find(l => l.includes('-->'));
    if (!tsLine) continue;
    const [startStr, endStr] = tsLine.split('-->').map(s => s.trim());
    const text = lines.slice(lines.indexOf(tsLine) + 1).join(' ').trim();
    if (!text) continue;

    const start = parseSrtTime(startStr);
    const end = parseSrtTime(endStr);

    const entry = {
      word: text,
      start,
      end,
      confidence: 0.95,
      speaker: 's1',
    };

    if (fillerWords.has(text.toLowerCase().replace(/[.,!?]/g, ''))) {
      entry.filler = true;
    }

    words.push(entry);
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
 * Transform whisper.cpp JSON into our transcript format (legacy fallback)
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
      '-osrt',
      '-ml', '1',
      '--dtw', WHISPER_DTW,
      '--no-flash-attn',
      '-of', outputBase,
      ...(!WHISPER_USE_GPU ? ['-ng'] : []),
    ];

    await exec(WHISPER_CLI, args, { timeout: 120000 });

    // Parse whisper SRT output
    const srtPath = `${outputBase}.srt`;
    const raw = await fs.readFile(srtPath, 'utf-8');
    const segTranscript = parseSrtToTranscript(raw);

    await fs.unlink(srtPath).catch(() => {});

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

/**
 * Refine a whisper transcript with forced alignment.
 * Whisper provides the TEXT, the aligner provides the TIMESTAMPS.
 *
 * @param {string} audioPath - Path to the audio WAV file
 * @param {object} transcript - Whisper transcript in our format
 * @returns {object} Transcript with refined timestamps from forced alignment
 */
async function refineWithAlignment(audioPath, transcript) {
  if (!await Aligner.isAvailable()) {
    log.warn('Forced alignment service unavailable — using whisper timestamps');
    return transcript;
  }

  // Build plain text from whisper words (the aligner needs raw text)
  const plainText = transcript.words.map(w => w.word).join(' ');

  try {
    const alignedWords = await Aligner.align(audioPath, plainText);

    if (!alignedWords || alignedWords.length === 0) {
      log.warn('Aligner returned no words — keeping whisper timestamps');
      return transcript;
    }

    // Match aligned words back to whisper words.
    // The aligner returns uppercase words; whisper has original casing + punctuation.
    // Match by position since both are in the same order.
    let alignIdx = 0;
    for (let i = 0; i < transcript.words.length; i++) {
      const whisperWord = transcript.words[i];
      const cleanWhisper = whisperWord.word.replace(/[.,!?;:'"()\u2026]/g, '').toUpperCase().trim();

      // Skip punctuation-only tokens (aligner doesn't produce these)
      if (!cleanWhisper) continue;

      if (alignIdx < alignedWords.length) {
        const aligned = alignedWords[alignIdx];

        // Verify words match (case-insensitive, ignoring punctuation)
        if (aligned.word === cleanWhisper) {
          whisperWord.start = aligned.start;
          whisperWord.end = aligned.end;
          whisperWord.confidence = Math.min(1, Math.max(0, (aligned.score + 10) / 10)); // normalize log-prob to 0-1
          alignIdx++;
        } else {
          // Mismatch — try to skip ahead in aligned words to find match
          let found = false;
          for (let j = alignIdx + 1; j < Math.min(alignIdx + 3, alignedWords.length); j++) {
            if (alignedWords[j].word === cleanWhisper) {
              whisperWord.start = alignedWords[j].start;
              whisperWord.end = alignedWords[j].end;
              alignIdx = j + 1;
              found = true;
              break;
            }
          }
          if (!found) {
            log.warn('Alignment word mismatch', { expected: cleanWhisper, got: aligned.word, idx: i });
            alignIdx++;
          }
        }
      }
    }

    // Assign timestamps to punctuation tokens based on adjacent words
    for (let i = 0; i < transcript.words.length; i++) {
      const w = transcript.words[i];
      const clean = w.word.replace(/[.,!?;:'"()\u2026]/g, '').trim();
      if (clean) continue; // not punctuation-only

      // Punctuation inherits end time of previous word and start time of next word
      const prev = i > 0 ? transcript.words[i - 1] : null;
      const next = i < transcript.words.length - 1 ? transcript.words[i + 1] : null;
      if (prev) w.start = prev.end;
      if (next) w.end = next.start;
      else if (prev) w.end = prev.end + 0.05;
    }

    // Recalculate silences with new timestamps
    transcript.silences = [];
    for (let i = 1; i < transcript.words.length; i++) {
      const gap = transcript.words[i].start - transcript.words[i - 1].end;
      if (gap > 1.5) {
        transcript.silences.push({
          start: transcript.words[i - 1].end,
          end: transcript.words[i].start,
          duration: gap,
          after_word_index: i - 1,
        });
      }
    }

    const lastWord = transcript.words[transcript.words.length - 1];
    transcript.duration_ms = lastWord ? Math.round(lastWord.end * 1000) : transcript.duration_ms;

    log.info('Forced alignment applied', {
      alignedWords: alignedWords.length,
      transcriptWords: transcript.words.length,
      matched: alignIdx,
    });

    return transcript;
  } catch (err) {
    log.error('Forced alignment failed — keeping whisper timestamps', { error: err.message });
    return transcript;
  }
}

module.exports = { transcribe, transcribeWithProgress, parseSrtToTranscript, transformWhisperOutput, realignWords, refineWithAlignment };
