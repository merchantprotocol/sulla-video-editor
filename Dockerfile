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

# Install Chromium for headless rendering (React → video frames)
RUN apt-get update && apt-get install -y --no-install-recommends \
    chromium-browser \
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
    xdg-utils \
    && rm -rf /var/lib/apt/lists/*

# Tell Puppeteer to use the installed Chromium
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser
