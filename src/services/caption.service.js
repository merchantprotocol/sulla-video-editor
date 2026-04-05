const fs = require('fs/promises');
const path = require('path');

/**
 * Generate an ASS subtitle file from transcript + EDL.
 * ASS format allows styled word-by-word highlighting.
 */
function generateASS(transcript, edl, options = {}) {
  const {
    fontName = 'Inter',
    fontSize = 32,
    primaryColor = '&H00FFFFFF', // white
    highlightColor = '&H009E7F3A', // accent blue (BGR)
    outlineColor = '&H00000000',
    backColor = '&H80000000',
    position = 'bottom', // bottom, center, top
    maxWordsPerLine = 4,
  } = options;

  // Compute kept time segments (apply EDL cuts)
  const cuts = (edl?.cuts || []).sort((a, b) => a.start_ms - b.start_ms);

  function adjustedTime(timeMs) {
    let offset = 0;
    for (const cut of cuts) {
      if (cut.end_ms <= timeMs) {
        offset += cut.end_ms - cut.start_ms;
      } else if (cut.start_ms < timeMs) {
        offset += timeMs - cut.start_ms;
      }
    }
    return timeMs - offset;
  }

  function isCut(startMs, endMs) {
    return cuts.some(c => c.start_ms <= startMs && c.end_ms >= endMs);
  }

  // ASS alignment: bottom=2, center=5, top=8
  const alignMap = { bottom: 2, center: 5, top: 8 };
  const alignment = alignMap[position] || 2;

  // Header
  let ass = `[Script Info]
Title: Sulla Video Captions
ScriptType: v4.00+
PlayResX: 1920
PlayResY: 1080
WrapStyle: 0

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,${fontName},${fontSize},${primaryColor},${highlightColor},${outlineColor},${backColor},-1,0,0,0,100,100,0,0,1,2,1,${alignment},40,40,60,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
`;

  // Generate caption events — group words into lines
  const words = transcript.words.filter(w => !isCut(Math.round(w.start * 1000), Math.round(w.end * 1000)));

  for (let i = 0; i < words.length; i += maxWordsPerLine) {
    const chunk = words.slice(i, i + maxWordsPerLine);
    if (chunk.length === 0) continue;

    const startMs = adjustedTime(Math.round(chunk[0].start * 1000));
    const endMs = adjustedTime(Math.round(chunk[chunk.length - 1].end * 1000));

    const text = chunk.map(w => w.word).join(' ');
    const startTime = formatASSTime(startMs);
    const endTime = formatASSTime(endMs);

    ass += `Dialogue: 0,${startTime},${endTime},Default,,0,0,0,,${text}\n`;
  }

  return ass;
}

function formatASSTime(ms) {
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  const cs = Math.floor((ms % 1000) / 10);
  return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(cs).padStart(2, '0')}`;
}

/**
 * Write ASS file to project exports directory
 */
async function writeCaptionFile(projectDir, transcript, edl, options = {}) {
  const ass = generateASS(transcript, edl, options);
  const captionPath = path.join(projectDir, 'data', 'captions.ass');
  await fs.writeFile(captionPath, ass, 'utf-8');
  return captionPath;
}

module.exports = { generateASS, formatASSTime, writeCaptionFile };
