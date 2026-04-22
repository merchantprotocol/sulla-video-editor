const https = require('https');
const http = require('http');
const { execFile, spawn } = require('child_process');
const { promisify } = require('util');
const fs = require('fs/promises');
const { createWriteStream, existsSync } = require('fs');
const path = require('path');
const os = require('os');
const { EventEmitter } = require('events');
const log = require('../utils/logger').create('tts');

const exec = promisify(execFile);

const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY || null;
const ELEVENLABS_BASE = 'https://api.elevenlabs.io/v1';
const DEFAULT_MODEL = 'eleven_multilingual_v2';

// Audio filter presets applied per-speaker via FFmpeg
const AUDIO_FILTERS = {
  'none': null,
  'phone-line': 'highpass=f=300,lowpass=f=3400,acompressor=threshold=-20dB:ratio=4,volume=0.9',
  'speaker': 'highpass=f=80,acompressor=threshold=-15dB:ratio=3,treble=g=2',
  'radio': 'highpass=f=200,lowpass=f=5000,acompressor=threshold=-18dB:ratio=5,volume=0.85',
};

/**
 * Generate audio from a conversation transcript using ElevenLabs TTS.
 *
 * Input format (conversation):
 * {
 *   speakers: [
 *     { id: "sulla", name: "Sulla AI", voiceId: "EXAVITQu4vr4xnSDxMaL", filter: "none" },
 *     { id: "caller", name: "Caller", voiceId: "pNInz6obpgDQGcFmaJgB", filter: "phone-line" }
 *   ],
 *   lines: [
 *     { speaker: "sulla", text: "Hi, how can I help?" },
 *     { speaker: "caller", text: "I need a drain cleaning." }
 *   ],
 *   options: {
 *     pauseBetweenLines: 0.6,     // seconds of silence between lines
 *     pauseBetweenSpeakers: 0.8,  // extra pause on speaker change
 *     model: "eleven_multilingual_v2"
 *   }
 * }
 *
 * Output: { audioPath, transcript }
 *   - audioPath: path to the combined WAV file
 *   - transcript: standard sulla transcript format (speakers, words, silences, duration_ms)
 */
async function generateConversation(conversation, outputDir, options = {}) {
  if (!ELEVENLABS_API_KEY) {
    throw new Error('ELEVENLABS_API_KEY not set — add it to .env');
  }

  const {
    pauseBetweenLines = 0.6,
    pauseBetweenSpeakers = 0.8,
    model = DEFAULT_MODEL,
  } = { ...conversation.options, ...options };

  const speakerMap = {};
  for (const s of conversation.speakers) {
    speakerMap[s.id] = s;
  }

  const tmpDir = path.join(os.tmpdir(), `tts-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  await fs.mkdir(tmpDir, { recursive: true });

  const lineFiles = [];
  const lineTimings = []; // { speaker, text, start, end, audioFile }
  let cursor = 0; // current time position in seconds

  log.info('Starting TTS generation', {
    lines: conversation.lines.length,
    speakers: conversation.speakers.length,
  });

  try {
    // 1. Generate audio for each line
    for (let i = 0; i < conversation.lines.length; i++) {
      const line = conversation.lines[i];
      const speaker = speakerMap[line.speaker];
      if (!speaker) throw new Error(`Unknown speaker: ${line.speaker}`);

      // Add pause before this line
      if (i > 0) {
        const prevSpeaker = conversation.lines[i - 1].speaker;
        const pause = line.speaker !== prevSpeaker ? pauseBetweenSpeakers : pauseBetweenLines;
        cursor += pause;
      }

      log.info(`Generating line ${i + 1}/${conversation.lines.length}`, {
        speaker: line.speaker,
        chars: line.text.length,
      });

      // Call ElevenLabs TTS
      const rawFile = path.join(tmpDir, `line-${String(i).padStart(3, '0')}-raw.mp3`);
      await elevenLabsTTS(speaker.voiceId, line.text, rawFile, model);

      // Convert to WAV and apply speaker filter
      const wavFile = path.join(tmpDir, `line-${String(i).padStart(3, '0')}.wav`);
      const filter = speaker.filter || 'none';
      await applyFilter(rawFile, wavFile, filter);

      // Get duration of the generated audio
      const duration = await getAudioDuration(wavFile);

      lineTimings.push({
        index: i,
        speaker: line.speaker,
        text: line.text,
        start: cursor,
        end: cursor + duration,
        duration,
        audioFile: wavFile,
      });

      cursor += duration;
      lineFiles.push(wavFile);
    }

    // 2. Concatenate all lines with silence gaps into one WAV
    const combinedPath = path.join(outputDir, 'tts-audio.wav');
    await concatenateWithPauses(lineTimings, combinedPath, pauseBetweenLines, pauseBetweenSpeakers, conversation.lines);

    const totalDuration = cursor;
    log.info('Audio concatenated', { totalDuration, outputPath: combinedPath });

    // 3. Build transcript in standard sulla format
    const transcript = buildTranscript(conversation.speakers, lineTimings, totalDuration);

    // 4. Save transcript
    const transcriptPath = path.join(outputDir, 'transcript.json');
    await fs.writeFile(transcriptPath, JSON.stringify(transcript, null, 2));

    log.info('TTS generation complete', {
      duration_ms: transcript.duration_ms,
      word_count: transcript.word_count,
      audioPath: combinedPath,
    });

    return { audioPath: combinedPath, transcriptPath, transcript };
  } finally {
    // Clean up temp files
    await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  }
}

/**
 * Generate audio with progress events via EventEmitter.
 * Emits: 'progress' (0-100), 'line' ({index, speaker, text}), 'done' ({audioPath, transcript}), 'error'
 */
function generateConversationWithProgress(conversation, outputDir, options = {}) {
  const emitter = new EventEmitter();

  generateConversation(conversation, outputDir, options)
    .then(result => emitter.emit('done', result))
    .catch(err => emitter.emit('error', err));

  return emitter;
}

/**
 * Call ElevenLabs TTS API and save audio to file.
 */
function elevenLabsTTS(voiceId, text, outputPath, model = DEFAULT_MODEL) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({
      text,
      model_id: model,
      voice_settings: {
        stability: 0.5,
        similarity_boost: 0.75,
        style: 0.0,
        use_speaker_boost: true,
      },
    });

    const url = new URL(`${ELEVENLABS_BASE}/text-to-speech/${voiceId}`);

    const req = https.request({
      hostname: url.hostname,
      path: url.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'xi-api-key': ELEVENLABS_API_KEY,
        'Accept': 'audio/mpeg',
        'Content-Length': Buffer.byteLength(body),
      },
    }, (res) => {
      if (res.statusCode !== 200) {
        let errBody = '';
        res.on('data', chunk => { errBody += chunk.toString(); });
        res.on('end', () => {
          reject(new Error(`ElevenLabs API error ${res.statusCode}: ${errBody}`));
        });
        return;
      }

      const file = createWriteStream(outputPath);
      res.pipe(file);
      file.on('finish', () => {
        file.close();
        resolve();
      });
      file.on('error', reject);
    });

    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

/**
 * Apply an audio filter preset using FFmpeg.
 */
async function applyFilter(inputPath, outputPath, filterName) {
  const filterStr = AUDIO_FILTERS[filterName];

  const args = [
    '-i', inputPath,
    '-ar', '44100',
    '-ac', '1',
  ];

  if (filterStr) {
    args.push('-af', filterStr);
  }

  args.push('-f', 'wav', '-y', outputPath);

  await exec('ffmpeg', args, { timeout: 30000 });
}

/**
 * Get audio duration in seconds using ffprobe.
 */
async function getAudioDuration(filePath) {
  const { stdout } = await exec('ffprobe', [
    '-v', 'quiet',
    '-show_entries', 'format=duration',
    '-of', 'csv=p=0',
    filePath,
  ], { timeout: 10000 });

  return parseFloat(stdout.trim());
}

/**
 * Concatenate audio files with silence pauses using FFmpeg concat filter.
 */
async function concatenateWithPauses(lineTimings, outputPath, defaultPause, speakerPause, lines) {
  if (lineTimings.length === 0) throw new Error('No audio lines to concatenate');

  // Build FFmpeg filter complex for concat with silence gaps
  const inputs = [];
  const filterParts = [];
  let inputIdx = 0;

  for (let i = 0; i < lineTimings.length; i++) {
    const lt = lineTimings[i];

    // Add silence before this line (except first)
    if (i > 0) {
      const prevSpeaker = lines[i - 1].speaker;
      const pause = lt.speaker !== prevSpeaker ? speakerPause : defaultPause;
      // Generate silence using anullsrc
      inputs.push('-f', 'lavfi', '-t', String(pause), '-i', `anullsrc=r=44100:cl=mono`);
      filterParts.push(`[${inputIdx}:a]`);
      inputIdx++;
    }

    // Add the audio line
    inputs.push('-i', lt.audioFile);
    filterParts.push(`[${inputIdx}:a]`);
    inputIdx++;
  }

  const concatFilter = `${filterParts.join('')}concat=n=${filterParts.length}:v=0:a=1[out]`;

  const args = [
    ...inputs,
    '-filter_complex', concatFilter,
    '-map', '[out]',
    '-ar', '44100',
    '-ac', '1',
    '-f', 'wav',
    '-y', outputPath,
  ];

  await exec('ffmpeg', args, { timeout: 120000 });
}

/**
 * Build a standard sulla transcript from TTS line timings.
 *
 * Since we don't have word-level timestamps from ElevenLabs, we estimate
 * word positions proportionally within each line's duration. For precise
 * word-level timestamps, run the output audio through Whisper afterwards.
 */
function buildTranscript(speakers, lineTimings, totalDuration) {
  const words = [];

  for (const lt of lineTimings) {
    const lineWords = lt.text.split(/\s+/).filter(w => w);
    const wordDuration = lt.duration / lineWords.length;

    for (let j = 0; j < lineWords.length; j++) {
      const raw = lineWords[j];

      // Split trailing punctuation into its own token (matches Whisper behavior)
      const punctMatch = raw.match(/^(.+?)([.,!?;:]+)$/);
      if (punctMatch) {
        const wordStart = lt.start + j * wordDuration;
        const wordEnd = lt.start + (j + 0.85) * wordDuration;
        const punctEnd = lt.start + (j + 1) * wordDuration;

        words.push({
          word: punctMatch[1],
          start: Math.round(wordStart * 1000) / 1000,
          end: Math.round(wordEnd * 1000) / 1000,
          confidence: 1.0,
          speaker: lt.speaker,
        });
        words.push({
          word: punctMatch[2],
          start: Math.round(wordEnd * 1000) / 1000,
          end: Math.round(punctEnd * 1000) / 1000,
          confidence: 1.0,
          speaker: lt.speaker,
        });
      } else {
        const wordStart = lt.start + j * wordDuration;
        const wordEnd = lt.start + (j + 1) * wordDuration;

        words.push({
          word: raw,
          start: Math.round(wordStart * 1000) / 1000,
          end: Math.round(wordEnd * 1000) / 1000,
          confidence: 1.0,
          speaker: lt.speaker,
        });
      }
    }
  }

  // Detect silences (pauses between lines)
  const silences = [];
  for (let i = 1; i < words.length; i++) {
    const gap = words[i].start - words[i - 1].end;
    if (gap > 0.4) {
      silences.push({
        start: words[i - 1].end,
        end: words[i].start,
        duration: Math.round(gap * 1000) / 1000,
        after_word_index: i - 1,
      });
    }
  }

  const lastWord = words[words.length - 1];
  return {
    speakers: speakers.map(s => ({
      id: s.id,
      name: s.name,
      color: s.color || '#3a7f9e',
      voiceId: s.voiceId,
      filter: s.filter || 'none',
    })),
    words,
    silences,
    duration_ms: lastWord ? Math.round(lastWord.end * 1000) : 0,
    word_count: words.length,
  };
}

/**
 * List available ElevenLabs voices.
 */
async function listVoices() {
  if (!ELEVENLABS_API_KEY) {
    throw new Error('ELEVENLABS_API_KEY not set');
  }

  return new Promise((resolve, reject) => {
    const url = new URL(`${ELEVENLABS_BASE}/voices`);

    https.get({
      hostname: url.hostname,
      path: url.pathname,
      headers: { 'xi-api-key': ELEVENLABS_API_KEY },
    }, (res) => {
      let body = '';
      res.on('data', chunk => { body += chunk; });
      res.on('end', () => {
        try {
          const data = JSON.parse(body);
          const voices = (data.voices || []).map(v => ({
            voiceId: v.voice_id,
            name: v.name,
            category: v.category,
            labels: v.labels,
            previewUrl: v.preview_url,
          }));
          resolve(voices);
        } catch (e) {
          reject(new Error(`Failed to parse voices response: ${e.message}`));
        }
      });
    }).on('error', reject);
  });
}

module.exports = {
  generateConversation,
  generateConversationWithProgress,
  listVoices,
  AUDIO_FILTERS,
};
