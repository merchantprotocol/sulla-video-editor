#!/bin/bash
# Install root deps (express for the API server)
cd /var/www/html
npm install --production 2>/dev/null

# Build React SPA if app/ exists and public/ is empty
if [ -d "/var/www/html/app" ] && [ ! -f "/var/www/html/public/index.html" ]; then
  echo "Building React app..."
  cd /var/www/html/app
  npm install
  npm run build
  # Copy built files to public/ where nginx + express serve them
  cp -r dist/* /var/www/html/public/
  echo "React app built and copied to public/"
fi
