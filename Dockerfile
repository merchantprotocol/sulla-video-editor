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

# Install Chromium deps + download Puppeteer's bundled Chromium
# (Ubuntu 24.04's chromium-browser is a snap stub that doesn't work in Docker)
RUN apt-get update && apt-get install -y --no-install-recommends \
    fonts-liberation \
    fonts-noto-color-emoji \
    fonts-dejavu-core \
    fonts-freefont-ttf \
    libatk-bridge2.0-0 \
    libatk1.0-0 \
    libcups2 \
    libdrm2 \
    libgbm1 \
    libgtk-3-0 \
    libnspr4 \
    libnss3 \
    libxcomposite1 \
    libxdamage1 \
    libxrandr2 \
    libasound2t64 \
    libpango-1.0-0 \
    libcairo2 \
    xdg-utils \
    && rm -rf /var/lib/apt/lists/*

# Install puppeteer (with bundled Chromium) globally
RUN npm install -g puppeteer@latest \
    && CHROMIUM_PATH=$(node -e "console.log(require('puppeteer').executablePath())") \
    && echo "Chromium installed at: $CHROMIUM_PATH" \
    && ln -sf "$CHROMIUM_PATH" /usr/local/bin/chromium

ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=false
ENV PUPPETEER_EXECUTABLE_PATH=/usr/local/bin/chromium
