#!/bin/bash
set -e

# Run build script first
bash /var/www/html/docker.d/01-build-app.sh

# Then start the node server (exec replaces this shell process)
echo "[sulla] Starting Node.js server..."
exec /usr/bin/node /var/www/html/src/index.js
