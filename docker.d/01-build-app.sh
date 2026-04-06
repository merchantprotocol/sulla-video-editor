#!/bin/bash
set -e

cd /var/www/html

# Install root deps (express for the API server)
echo "[sulla] Installing server dependencies..."
npm install --production 2>/dev/null

# Build React SPA
if [ -d "/var/www/html/app" ]; then
  echo "[sulla] Installing frontend dependencies..."
  cd /var/www/html/app
  rm -rf node_modules
  npm install --include=dev

  # Fix binary permissions (npm sometimes loses +x on extracted bins)
  chmod +x node_modules/.bin/* 2>/dev/null || true

  echo "[sulla] Building React app..."
  npm run build

  # Copy built files to public/ where nginx + express serve them
  mkdir -p /var/www/html/public
  cp -r dist/* /var/www/html/public/
  echo "[sulla] Frontend built and deployed to public/"
else
  echo "[sulla] No app/ directory found, skipping frontend build"
fi
