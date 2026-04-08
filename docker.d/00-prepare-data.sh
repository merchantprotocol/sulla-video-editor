#!/bin/bash
set -e

# Ensure /data directory is writable by the www-data user that runs Node
DATA_DIR="${DATA_DIR:-/data}"
mkdir -p "$DATA_DIR/inbox"
chown -R www-data:www-data "$DATA_DIR"
echo "[sulla] Data directory prepared: $DATA_DIR"
