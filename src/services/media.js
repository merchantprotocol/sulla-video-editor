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

  // Build track list from all streams
  const tracks = (probe.streams || []).map((s, i) => ({
    index: i,
    type: s.codec_type, // 'video', 'audio', 'subtitle', 'data'
    codec: s.codec_name,
    label: s.tags?.title || s.tags?.handler_name || null,
    duration_ms: Math.round(parseFloat(s.duration || format.duration || 0) * 1000),
    ...(s.codec_type === 'video' ? {
      width: s.width,
      height: s.height,
      fps: parseFraction(s.r_frame_rate),
    } : {}),
    ...(s.codec_type === 'audio' ? {
      channels: s.channels,
      channel_layout: s.channel_layout,
      sample_rate: parseInt(s.sample_rate || 0),
    } : {}),
  }));

  return {
    duration_ms: Math.round(durationSec * 1000),
    resolution: width && height ? `${width}x${height}` : null,
    tracks,
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
 * Extract waveform amplitude data from an audio file.
 * Outputs a JSON array of amplitude values (0.0-1.0) sampled at the given rate.
 * Used for: rendering real waveforms in the track panel, and verifying
 * transcript timestamp alignment against actual audio activity.
 *
 * @param {string} inputPath - audio or video file
 * @param {string} outputPath - where to write waveform.json
 * @param {number} samplesPerSecond - resolution (default 100 = 10ms per sample)
 */
async function extractWaveform(inputPath, outputPath, samplesPerSecond = 100) {
  // Use FFmpeg's astats filter to get per-frame RMS amplitude
  // Output format: one float per line representing the amplitude
  const { stdout } = await exec('ffmpeg', [
    '-i', inputPath,
    '-vn',
    '-af', `asetnsamples=n=${Math.round(16000 / samplesPerSecond)},astats=metadata=1:reset=1,ametadata=print:key=lavfi.astats.Overall.RMS_level:file=-`,
    '-f', 'null', '-',
  ], { maxBuffer: 50 * 1024 * 1024 }); // 50MB buffer for long files

  // Parse RMS levels from FFmpeg output
  const lines = stdout.split('\n');
  const amplitudes = [];
  for (const line of lines) {
    const match = line.match(/lavfi\.astats\.Overall\.RMS_level=(-?[\d.]+)/);
    if (match) {
      const db = parseFloat(match[1]);
      // Convert dB to 0-1 linear scale (clamp -60dB to 0dB range)
      const linear = db <= -60 ? 0 : Math.pow(10, db / 20);
      amplitudes.push(Math.round(linear * 1000) / 1000); // 3 decimal places
    }
  }

  const fs = require('fs/promises');
  await fs.writeFile(outputPath, JSON.stringify({
    samples_per_second: samplesPerSecond,
    sample_count: amplitudes.length,
    duration_ms: Math.round((amplitudes.length / samplesPerSecond) * 1000),
    amplitudes,
  }, null, 0)); // compact JSON — no indentation for large arrays

  return { sample_count: amplitudes.length, duration_ms: Math.round((amplitudes.length / samplesPerSecond) * 1000) };
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

module.exports = { extractMetadata, extractAudio, extractWaveform, generateThumbnails, parseFraction };
