FROM ghcr.io/merchantprotocol/docker-nginx-node20-ffmpeg:latest

# Install whisper.cpp build dependencies + postgresql client for migrations
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    cmake \
    postgresql-client \
    && rm -rf /var/lib/apt/lists/*

# Build a pinned whisper.cpp release for the portable baseline of each target.
# BuildKit sets TARGETARCH for every platform in a multi-arch build.
ARG TARGETARCH
ARG WHISPER_CPP_VERSION=v1.9.4
RUN case "$TARGETARCH" in \
      arm64) ARCH_FLAGS="-march=armv8-a" ;; \
      amd64) ARCH_FLAGS="-march=x86-64" ;; \
      *) echo "Unsupported TARGETARCH: $TARGETARCH" >&2; exit 1 ;; \
    esac \
    && git clone --branch "$WHISPER_CPP_VERSION" --depth 1 https://github.com/ggml-org/whisper.cpp.git /opt/whisper.cpp \
    && cd /opt/whisper.cpp \
    && cmake -B build -DGGML_NATIVE=OFF -DGGML_METAL=OFF -DGGML_CUDA=OFF \
        -DWHISPER_BUILD_TESTS=OFF -DWHISPER_BUILD_SERVER=OFF \
        -DCMAKE_C_FLAGS="$ARCH_FLAGS" -DCMAKE_CXX_FLAGS="$ARCH_FLAGS" \
    && cmake --build build --config Release -j$(nproc) \
    && cp build/bin/whisper-cli /usr/local/bin/whisper-cli \
    && chmod +x /usr/local/bin/whisper-cli \
    && cp build/bin/libwhisper.so* /usr/local/lib/ \
    && cp build/bin/libggml*.so* /usr/local/lib/ \
    && ldconfig

# Ship the fast English default and retain large-v3-turbo as an opt-in model.
RUN cd /opt/whisper.cpp \
    && bash models/download-ggml-model.sh base.en \
    && bash models/download-ggml-model.sh large-v3-turbo

RUN mkdir -p /opt/whisper-models \
    && cp /opt/whisper.cpp/models/ggml-base.en.bin /opt/whisper-models/ \
    && cp /opt/whisper.cpp/models/ggml-large-v3-turbo.bin /opt/whisper-models/ \
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

# Bake the application source into the image so the container is self-contained.
# In dev, docker-compose bind-mounts `./:/var/www/html` which overlays this COPY.
WORKDIR /var/www/html
COPY . /var/www/html

# Install backend production deps and build the React SPA into public/
RUN npm install --omit=dev && npm run build


