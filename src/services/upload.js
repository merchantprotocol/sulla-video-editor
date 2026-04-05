const path = require('path');
const fs = require('fs/promises');
const { existsSync, createWriteStream } = require('fs');
const crypto = require('crypto');
const config = require('../utils/config');
const log = require('../utils/logger').create('upload');

const CHUNK_DIR = 'upload';

function uploadPath(projectId, uploadId, ...segments) {
  return path.join(config.storageRoot, projectId, CHUNK_DIR, uploadId, ...segments);
}

function manifestPath(projectId, uploadId) {
  return uploadPath(projectId, uploadId, 'manifest.json');
}

async function readManifest(projectId, uploadId) {
  const mp = manifestPath(projectId, uploadId);
  if (!existsSync(mp)) return null;
  return JSON.parse(await fs.readFile(mp, 'utf-8'));
}

async function writeManifest(projectId, uploadId, manifest) {
  await fs.writeFile(manifestPath(projectId, uploadId), JSON.stringify(manifest, null, 2));
}

const UploadService = {
  /**
   * Initialize a new chunked upload session.
   * Returns { uploadId, chunkSize, totalChunks }
   */
  async init(projectId, { filename, fileSize, chunkSize }) {
    const uploadId = crypto.randomBytes(8).toString('hex');
    const totalChunks = Math.ceil(fileSize / chunkSize);

    const dir = uploadPath(projectId, uploadId);
    await fs.mkdir(dir, { recursive: true });

    const manifest = {
      uploadId,
      filename,
      fileSize,
      chunkSize,
      totalChunks,
      receivedChunks: [],
      createdAt: new Date().toISOString(),
      complete: false,
    };

    await writeManifest(projectId, uploadId, manifest);
    log.info('Upload initialized', { projectId, uploadId, filename, fileSize, totalChunks, chunkSize });

    return { uploadId, chunkSize, totalChunks };
  },

  /**
   * Store a single chunk. Body is a Buffer.
   * Returns { received, totalChunks }
   */
  async storeChunk(projectId, uploadId, chunkIndex, data) {
    const manifest = await readManifest(projectId, uploadId);
    if (!manifest) throw new Error('Upload session not found');
    if (manifest.complete) throw new Error('Upload already completed');
    if (chunkIndex < 0 || chunkIndex >= manifest.totalChunks) {
      throw new Error(`Invalid chunk index ${chunkIndex}, expected 0-${manifest.totalChunks - 1}`);
    }

    const chunkPath = uploadPath(projectId, uploadId, `chunk-${String(chunkIndex).padStart(6, '0')}`);
    await fs.writeFile(chunkPath, data);

    if (!manifest.receivedChunks.includes(chunkIndex)) {
      manifest.receivedChunks.push(chunkIndex);
      manifest.receivedChunks.sort((a, b) => a - b);
      await writeManifest(projectId, uploadId, manifest);
    }

    return { received: manifest.receivedChunks.length, totalChunks: manifest.totalChunks };
  },

  /**
   * Get upload status for resume support.
   * Returns { uploadId, filename, totalChunks, receivedChunks, complete }
   */
  async status(projectId, uploadId) {
    const manifest = await readManifest(projectId, uploadId);
    if (!manifest) return null;

    return {
      uploadId: manifest.uploadId,
      filename: manifest.filename,
      fileSize: manifest.fileSize,
      totalChunks: manifest.totalChunks,
      receivedChunks: manifest.receivedChunks,
      complete: manifest.complete,
    };
  },

  /**
   * Find an existing incomplete upload for this project by filename + size.
   * Used for resume: if the user uploads the same file again, pick up where we left off.
   */
  async findExisting(projectId, filename, fileSize) {
    const base = path.join(config.storageRoot, projectId, CHUNK_DIR);
    if (!existsSync(base)) return null;

    const dirs = await fs.readdir(base);
    for (const dir of dirs) {
      const mp = path.join(base, dir, 'manifest.json');
      if (!existsSync(mp)) continue;
      try {
        const manifest = JSON.parse(await fs.readFile(mp, 'utf-8'));
        if (manifest.filename === filename && manifest.fileSize === fileSize && !manifest.complete) {
          return {
            uploadId: manifest.uploadId,
            filename: manifest.filename,
            fileSize: manifest.fileSize,
            chunkSize: manifest.chunkSize,
            totalChunks: manifest.totalChunks,
            receivedChunks: manifest.receivedChunks,
          };
        }
      } catch {}
    }
    return null;
  },

  /**
   * Reassemble chunks into the final media file.
   * Returns the path to the assembled file.
   */
  async complete(projectId, uploadId) {
    const manifest = await readManifest(projectId, uploadId);
    if (!manifest) throw new Error('Upload session not found');
    if (manifest.complete) throw new Error('Upload already completed');

    // Verify all chunks received
    if (manifest.receivedChunks.length !== manifest.totalChunks) {
      const missing = [];
      for (let i = 0; i < manifest.totalChunks; i++) {
        if (!manifest.receivedChunks.includes(i)) missing.push(i);
      }
      throw new Error(`Missing ${missing.length} chunks: ${missing.slice(0, 10).join(', ')}${missing.length > 10 ? '...' : ''}`);
    }

    log.info('Reassembling upload', { projectId, uploadId, totalChunks: manifest.totalChunks });

    const ext = path.extname(manifest.filename) || '.mp4';
    const mediaDir = path.join(config.storageRoot, projectId, 'media');
    await fs.mkdir(mediaDir, { recursive: true });
    const outputPath = path.join(mediaDir, `source${ext}`);

    // Stream chunks into final file
    const ws = createWriteStream(outputPath);
    for (let i = 0; i < manifest.totalChunks; i++) {
      const chunkPath = uploadPath(projectId, uploadId, `chunk-${String(i).padStart(6, '0')}`);
      const data = await fs.readFile(chunkPath);
      await new Promise((resolve, reject) => {
        ws.write(data, (err) => err ? reject(err) : resolve());
      });
    }
    await new Promise((resolve) => ws.end(resolve));

    // Mark complete
    manifest.complete = true;
    await writeManifest(projectId, uploadId, manifest);

    // Clean up chunks (keep manifest for reference)
    for (let i = 0; i < manifest.totalChunks; i++) {
      const chunkPath = uploadPath(projectId, uploadId, `chunk-${String(i).padStart(6, '0')}`);
      await fs.unlink(chunkPath).catch(() => {});
    }

    log.info('Upload reassembled', { projectId, uploadId, outputPath });
    return { outputPath, filename: manifest.filename };
  },

  /**
   * Clean up an upload session entirely.
   */
  async cleanup(projectId, uploadId) {
    const dir = uploadPath(projectId, uploadId);
    if (existsSync(dir)) {
      await fs.rm(dir, { recursive: true, force: true });
    }
  },
};

module.exports = UploadService;
