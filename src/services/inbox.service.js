const { watch } = require('fs');
const { readdir, stat, rename, mkdir } = require('fs/promises');
const { existsSync } = require('fs');
const path = require('path');
const config = require('../utils/config');
const log = require('../utils/logger').create('inbox');

const MEDIA_EXTENSIONS = new Set(['.mp4', '.mov', '.webm', '.mkv', '.avi', '.m4v']);
const POLL_INTERVAL_MS = 5000; // 5 seconds
const STABLE_WAIT_MS = 3000;  // file must be stable for 3s before ingest

// Track files we've seen and their last-known size (to detect when writing is complete)
const pendingFiles = new Map(); // path -> { size, firstSeen }
let pollTimer = null;

/**
 * Start watching the inbox directory for new media files.
 * When a stable media file is detected, calls the onIngest callback.
 *
 * @param {function} onIngest - async (filePath, filename) => void
 */
function startWatching(onIngest) {
  const inboxDir = config.inboxDir;
  if (!inboxDir) {
    log.info('No INBOX_DIR configured — inbox watcher disabled');
    return;
  }

  if (!existsSync(inboxDir)) {
    try {
      require('fs').mkdirSync(inboxDir, { recursive: true });
      log.info('Created inbox directory', { inboxDir });
    } catch (err) {
      log.error('Failed to create inbox directory', { inboxDir, error: err.message });
      return;
    }
  }

  log.info('Inbox watcher started', { inboxDir, pollIntervalMs: POLL_INTERVAL_MS });

  // Poll for new files (more reliable than fs.watch across platforms/volumes)
  pollTimer = setInterval(() => pollInbox(inboxDir, onIngest), POLL_INTERVAL_MS);

  // Also do an immediate scan
  pollInbox(inboxDir, onIngest);
}

function stopWatching() {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
    log.info('Inbox watcher stopped');
  }
}

async function pollInbox(inboxDir, onIngest) {
  try {
    const files = await readdir(inboxDir);

    for (const filename of files) {
      const ext = path.extname(filename).toLowerCase();
      if (!MEDIA_EXTENSIONS.has(ext)) continue;

      const filePath = path.join(inboxDir, filename);

      try {
        const fileStat = await stat(filePath);
        if (!fileStat.isFile()) continue;

        const existing = pendingFiles.get(filePath);

        if (!existing) {
          // First time seeing this file — record size and wait
          pendingFiles.set(filePath, { size: fileStat.size, firstSeen: Date.now() });
          log.info('New file detected in inbox', { filename, size: fileStat.size });
          continue;
        }

        if (fileStat.size !== existing.size) {
          // File is still being written — update size and reset timer
          pendingFiles.set(filePath, { size: fileStat.size, firstSeen: Date.now() });
          continue;
        }

        // Size is stable — check if enough time has passed
        if (Date.now() - existing.firstSeen < STABLE_WAIT_MS) {
          continue; // Not stable long enough
        }

        // File is stable — ingest it
        pendingFiles.delete(filePath);
        log.info('Ingesting stable file from inbox', { filename, size: fileStat.size });

        try {
          await onIngest(filePath, filename);

          // Move to processed subfolder
          const processedDir = path.join(inboxDir, 'processed');
          await mkdir(processedDir, { recursive: true });
          const dest = path.join(processedDir, filename);
          await rename(filePath, dest);
          log.info('File moved to processed', { filename });
        } catch (err) {
          log.error('Ingest failed for inbox file', { filename, error: err.message });
          // Move to failed subfolder
          const failedDir = path.join(inboxDir, 'failed');
          await mkdir(failedDir, { recursive: true });
          await rename(filePath, path.join(failedDir, filename)).catch(() => {});
        }
      } catch (err) {
        // File may have been removed between readdir and stat
        if (err.code !== 'ENOENT') {
          log.warn('Error checking inbox file', { filename, error: err.message });
        }
      }
    }
  } catch (err) {
    log.error('Inbox poll failed', { error: err.message });
  }
}

module.exports = { startWatching, stopWatching };
