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

# Download the base English model (small — good balance of speed vs accuracy)
RUN cd /opt/whisper.cpp \
    && bash models/download-ggml-model.sh base.en

# Keep models dir accessible, clean up build artifacts
RUN mkdir -p /opt/whisper-models \
    && cp /opt/whisper.cpp/models/ggml-base.en.bin /opt/whisper-models/ \
    && rm -rf /opt/whisper.cpp/build

ENV WHISPER_MODEL_PATH=/opt/whisper-models/ggml-base.en.bin
