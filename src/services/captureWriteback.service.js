const path = require('path');
const fs = require('fs/promises');
const log = require('../utils/logger').create('capture-writeback');

/**
 * Groups word-level transcript into paragraphs using silence gaps as boundaries.
 */
function buildParagraphs(transcript) {
  const { words, silences } = transcript;
  if (!words || words.length === 0) return [];

  const breakAfter = new Set((silences || []).map(s => s.after_word_index));

  const paragraphs = [];
  let paraWords = [];
  let paraStart = null;

  for (let i = 0; i < words.length; i++) {
    if (paraStart === null) paraStart = words[i].start;
    paraWords.push(words[i].word);

    if (breakAfter.has(i) || i === words.length - 1) {
      paragraphs.push({
        index: paragraphs.length,
        start: paraStart,
        end: words[i].end,
        text: paraWords.join(' '),
      });
      paraWords = [];
      paraStart = null;
    }
  }
  return paragraphs;
}

function formatTimestamp(seconds) {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

/**
 * Renders paragraphs as human-readable timestamped text.
 */
function formatTranscriptText(paragraphs) {
  return paragraphs.map(p =>
    `[${formatTimestamp(p.start)} - ${formatTimestamp(p.end)}]\n${p.text}`
  ).join('\n\n') + '\n';
}

/**
 * Writes transcription.txt and transcription.json to the capture session folder.
 * Fire-and-forget — logs warnings on failure, never throws.
 */
async function writeTranscriptionToCapture(transcript, captureSourcePath, projectId) {
  if (!captureSourcePath) return;

  const captureDir = path.dirname(captureSourcePath);

  try {
    await fs.access(captureDir, fs.constants.W_OK);
  } catch (err) {
    log.warn('Capture directory not writable, skipping write-back', {
      captureDir, error: err.message,
    });
    return;
  }

  const paragraphs = buildParagraphs(transcript);

  // Human-readable text
  const txtContent = formatTranscriptText(paragraphs);
  await fs.writeFile(path.join(captureDir, 'transcription.txt'), txtContent, 'utf-8');

  // Machine-readable JSON
  const jsonContent = {
    version: 1,
    generated_at: new Date().toISOString(),
    generated_by: 'sulla-video-editor',
    project_id: projectId,
    speakers: transcript.speakers || [],
    words: transcript.words,
    silences: transcript.silences || [],
    paragraphs,
    duration_ms: transcript.duration_ms,
    word_count: transcript.word_count,
  };
  await fs.writeFile(
    path.join(captureDir, 'transcription.json'),
    JSON.stringify(jsonContent, null, 2),
    'utf-8'
  );

  log.info('Transcription written to capture folder', {
    captureDir, projectId, paragraphs: paragraphs.length, words: transcript.word_count,
  });
}

module.exports = { writeTranscriptionToCapture, buildParagraphs, formatTranscriptText };
