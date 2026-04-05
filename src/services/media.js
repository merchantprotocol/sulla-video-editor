const { execFile } = require('child_process');
const { promisify } = require('util');
const path = require('path');
const fs = require('fs/promises');

const exec = promisify(execFile);

function parseFraction(str) {
  if (!str) return 30;
  const parts = str.split('/');
  if (parts.length === 2) {
    const num = parseInt(parts[0]);
    const den = parseInt(parts[1]);
    if (isNaN(num) || isNaN(den) || den === 0) return 30;
    return num / den;
  }
  const val = parseFloat(str);
  return isNaN(val) ? 30 : val;
}

/**
 * Extract metadata from a media file using ffprobe
 */
async function extractMetadata(filePath) {
  const { stdout } = await exec('ffprobe', [
    '-v', 'quiet',
    '-print_format', 'json',
    '-show_format',
    '-show_streams',
    filePath,
  ]);

  const probe = JSON.parse(stdout);
  const videoStream = probe.streams?.find(s => s.codec_type === 'video');
  const audioStream = probe.streams?.find(s => s.codec_type === 'audio');
  const format = probe.format || {};

  const durationSec = parseFloat(format.duration || videoStream?.duration || 0);
  const width = videoStream?.width || 0;
  const height = videoStream?.height || 0;

  return {
    duration_ms: Math.round(durationSec * 1000),
    resolution: width && height ? `${width}x${height}` : null,
    fps: videoStream ? parseFraction(videoStream.r_frame_rate || '30') : null,
    file_size: parseInt(format.size || 0),
    format: format.format_name,
    codec_video: videoStream?.codec_name,
    codec_audio: audioStream?.codec_name,
    channels: audioStream?.channels,
    sample_rate: audioStream?.sample_rate,
    has_video: !!videoStream,
    has_audio: !!audioStream,
  };
}

/**
 * Extract audio to WAV (16kHz mono for Whisper)
 */
async function extractAudio(inputPath, outputPath) {
  await exec('ffmpeg', [
    '-i', inputPath,
    '-vn',              // no video
    '-ar', '16000',     // 16kHz sample rate (whisper requirement)
    '-ac', '1',         // mono
    '-f', 'wav',
    '-y',               // overwrite
    outputPath,
  ]);
}

/**
 * Generate thumbnail images (1 every 10 seconds)
 */
async function generateThumbnails(inputPath, outputDir) {
  await fs.mkdir(outputDir, { recursive: true });
  await exec('ffmpeg', [
    '-i', inputPath,
    '-vf', 'fps=1/10,scale=320:-1',  // 1 frame per 10 sec, 320px wide
    '-q:v', '5',
    '-y',
    path.join(outputDir, 'thumb-%04d.jpg'),
  ]);
}

module.exports = { extractMetadata, extractAudio, generateThumbnails, parseFraction };
