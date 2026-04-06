#!/bin/bash
set -e

cd /var/www/html

# Install root deps (express for the API server)
echo "Installing server dependencies..."
npm install --production 2>/dev/null

# Always build React SPA if app/ exists
if [ -d "/var/www/html/app" ]; then
  echo "Building React app..."
  cd /var/www/html/app
  npm install --include=dev
  # Fix binary permissions (npm sometimes loses +x on extracted bins)
  chmod +x node_modules/.bin/* 2>/dev/null || true
  npm run build
  # Ensure public/ directory exists
  mkdir -p /var/www/html/public
  # Copy built files to public/ where nginx + express serve them
  cp -r dist/* /var/www/html/public/
  echo "React app built and copied to public/"
else
  echo "No app/ directory found, skipping frontend build"
fi
