FROM ghcr.io/merchantprotocol/docker-nginx-node20-ffmpeg:latest

# Install whisper.cpp build dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    cmake \
    && rm -rf /var/lib/apt/lists/*

# Build whisper.cpp
RUN git clone https://github.com/ggerganov/whisper.cpp.git /opt/whisper.cpp \
    && cd /opt/whisper.cpp \
    && cmake -B build \
    && cmake --build build --config Release -j$(nproc) \
    && cp build/bin/whisper-cli /usr/local/bin/whisper-cli \
    && chmod +x /usr/local/bin/whisper-cli

# Download the base English model
RUN cd /opt/whisper.cpp \
    && bash models/download-ggml-model.sh base.en

RUN mkdir -p /opt/whisper-models \
    && cp /opt/whisper.cpp/models/ggml-base.en.bin /opt/whisper-models/ \
    && rm -rf /opt/whisper.cpp/build

ENV WHISPER_MODEL_PATH=/opt/whisper-models/ggml-base.en.bin

# Install Chromium for headless rendering
# Ubuntu 24.04 replaced chromium with a snap stub, so we install from
# the Debian repos via a direct .deb, or use Playwright's Chromium
RUN apt-get update && apt-get install -y --no-install-recommends \
    fonts-liberation \
    fonts-noto-color-emoji \
    fonts-dejavu-core \
    fonts-freefont-ttf \
    libasound2t64 \
    libatk-bridge2.0-0 \
    libatk1.0-0 \
    libcairo2 \
    libcups2 \
    libdrm2 \
    libgbm1 \
    libgtk-3-0 \
    libnspr4 \
    libnss3 \
    libpango-1.0-0 \
    libxcomposite1 \
    libxdamage1 \
    libxrandr2 \
    xdg-utils \
    && rm -rf /var/lib/apt/lists/*

# Use npx playwright to install a working Chromium binary (ARM64 + AMD64)
RUN npx playwright install chromium --with-deps 2>/dev/null \
    && CHROMIUM_PATH=$(npx playwright install --dry-run chromium 2>/dev/null | grep -oP '/.*chromium-\d+/chrome-linux/chrome' || find /root/.cache -name "chrome" -type f 2>/dev/null | head -1) \
    && if [ -n "$CHROMIUM_PATH" ] && [ -f "$CHROMIUM_PATH" ]; then \
         ln -sf "$CHROMIUM_PATH" /usr/local/bin/chromium; \
         echo "Chromium linked: $CHROMIUM_PATH"; \
       else \
         echo "Finding Chromium..."; \
         FOUND=$(find / -name "chrome" -type f -path "*/chromium*" 2>/dev/null | head -1); \
         if [ -n "$FOUND" ]; then ln -sf "$FOUND" /usr/local/bin/chromium; echo "Chromium: $FOUND"; \
         else echo "WARNING: Chromium not found"; fi; \
       fi

ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/local/bin/chromium
