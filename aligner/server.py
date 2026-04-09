"""
CTC Forced Alignment Service using wav2vec2.

Takes audio + transcript text from whisper, produces word-level timestamps
with ~20ms accuracy using CTC forced alignment against the actual audio signal.

Architecture:
  1. Load wav2vec2-base-960h model (pre-trained ASR model with CTC head)
  2. Run forward pass on audio to get per-frame character probabilities
  3. Build a trellis (alignment matrix) between audio frames and transcript characters
  4. Viterbi backtrack to find optimal alignment path
  5. Merge character alignments into word boundaries

This is the same approach used by WhisperX and Montreal Forced Aligner.
"""

import io
import logging
import re
import tempfile
import wave
import struct
from pathlib import Path

import torch
from fastapi import FastAPI, UploadFile, File, Form, HTTPException
from fastapi.responses import JSONResponse

logging.basicConfig(level=logging.INFO)
log = logging.getLogger("aligner")

app = FastAPI(title="Forced Alignment Service")

# Load model once at startup using the cached checkpoint directly
log.info("Loading wav2vec2 model...")
SAMPLE_RATE = 16000

# Load the wav2vec2 model (torchaudio only used for model loading, not audio I/O)
import torchaudio
bundle = torchaudio.pipelines.WAV2VEC2_ASR_BASE_960H
model = bundle.get_model()
model.eval()
labels = bundle.get_labels()
log.info(f"Model loaded. Labels: {len(labels)}, Sample rate: {SAMPLE_RATE}")

# Build label-to-index mapping
label_to_idx = {c: i for i, c in enumerate(labels)}
BLANK = label_to_idx.get("-", 0)  # CTC blank token
PIPE = label_to_idx.get("|", 0)   # Word separator


def forced_align(waveform: torch.Tensor, transcript: str):
    """
    Perform CTC forced alignment between audio waveform and transcript text.
    Returns list of {word, start, end, score} dicts.
    """
    # Normalize transcript to uppercase, keep only chars in the model's vocabulary
    clean = transcript.upper().strip()
    # Replace any char not in labels with nothing; keep spaces as pipe separators
    chars = []
    for c in clean:
        if c == " ":
            chars.append("|")
        elif c in label_to_idx:
            chars.append(c)
    if not chars:
        raise ValueError("No alignable characters in transcript")

    tokens = [label_to_idx[c] for c in chars]

    # Get CTC emission probabilities from wav2vec2
    with torch.no_grad():
        emissions, _ = model(waveform)
    emission = emissions[0]  # [T, C] — T frames, C characters
    emission = torch.log_softmax(emission, dim=-1)

    T = emission.size(0)  # Number of audio frames
    S = len(tokens)        # Number of transcript tokens

    if T < S:
        raise ValueError(f"Audio too short ({T} frames) for transcript ({S} tokens)")

    # Build trellis: trellis[t, s] = best log-probability of aligning
    # tokens[0:s+1] to audio frames[0:t+1]
    trellis = torch.full((T + 1, S + 1), float("-inf"))
    trellis[0, 0] = 0.0

    for t in range(T):
        # Stay on same token (CTC allows repetition)
        trellis[t + 1, :S + 1] = torch.maximum(
            trellis[t, :S + 1] + emission[t, BLANK],
            trellis[t + 1, :S + 1],
        )
        # Advance to next token
        for s in range(S):
            score = trellis[t, s] + emission[t, tokens[s]]
            if score > trellis[t + 1, s + 1]:
                trellis[t + 1, s + 1] = score

    # Backtrack to find optimal path
    path = []
    t, s = T, S
    while t > 0 and s > 0:
        stayed = trellis[t - 1, s] + emission[t - 1, BLANK]
        advanced = trellis[t - 1, s - 1] + emission[t - 1, tokens[s - 1]]
        if advanced >= stayed:
            path.append((t - 1, s - 1, emission[t - 1, tokens[s - 1]].item()))
            s -= 1
        t -= 1
    path.reverse()

    if not path:
        raise ValueError("Alignment failed — empty path")

    # Convert frame indices to timestamps
    # wav2vec2 base has 20ms frame hop (320 samples at 16kHz)
    duration_sec = waveform.size(1) / SAMPLE_RATE
    frame_duration = duration_sec / T

    # Group character alignments into words (split on pipe "|")
    words = []
    current_word_chars = []
    current_word_scores = []
    word_start_frame = None

    for frame_idx, token_idx, score in path:
        char = chars[token_idx]
        if char == "|":
            # Word boundary — emit current word
            if current_word_chars and word_start_frame is not None:
                words.append({
                    "word": "".join(current_word_chars).strip(),
                    "start": round(word_start_frame * frame_duration, 3),
                    "end": round(frame_idx * frame_duration, 3),
                    "score": round(sum(current_word_scores) / len(current_word_scores), 4),
                })
            current_word_chars = []
            current_word_scores = []
            word_start_frame = None
        else:
            if word_start_frame is None:
                word_start_frame = frame_idx
            current_word_chars.append(char)
            current_word_scores.append(score)

    # Emit final word
    if current_word_chars and word_start_frame is not None:
        last_frame = path[-1][0]
        words.append({
            "word": "".join(current_word_chars).strip(),
            "start": round(word_start_frame * frame_duration, 3),
            "end": round(last_frame * frame_duration, 3),
            "score": round(sum(current_word_scores) / len(current_word_scores), 4),
        })

    return words


@app.get("/health")
def health():
    return {"status": "ok", "model": "wav2vec2-base-960h"}


@app.post("/align")
async def align(
    audio: UploadFile = File(...),
    transcript: str = Form(...),
):
    """
    Align transcript text to audio file.
    Returns word-level timestamps with CTC forced alignment.
    """
    try:
        # Read uploaded audio into a temp file (torchaudio needs a file path or buffer)
        audio_bytes = await audio.read()
        with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as tmp:
            tmp.write(audio_bytes)
            tmp_path = tmp.name

        # Read WAV using Python's wave module (no torchaudio.load dependency issues)
        with wave.open(tmp_path, 'rb') as wf:
            sr = wf.getframerate()
            n_channels = wf.getnchannels()
            n_frames = wf.getnframes()
            raw = wf.readframes(n_frames)

        Path(tmp_path).unlink(missing_ok=True)

        # Convert raw bytes to float tensor
        samples = struct.unpack(f'<{n_frames * n_channels}h', raw)
        waveform = torch.tensor(samples, dtype=torch.float32) / 32768.0
        if n_channels > 1:
            waveform = waveform.view(-1, n_channels).mean(dim=1)
        waveform = waveform.unsqueeze(0)  # [1, T]

        # Resample if needed
        if sr != SAMPLE_RATE:
            waveform = torchaudio.functional.resample(waveform, sr, SAMPLE_RATE)

        log.info(f"Aligning {waveform.size(1)/SAMPLE_RATE:.1f}s audio with {len(transcript.split())} words")

        words = forced_align(waveform, transcript)

        log.info(f"Aligned {len(words)} words, "
                 f"first: {words[0]['start']:.3f}s, last: {words[-1]['end']:.3f}s")

        return JSONResponse({"words": words})

    except Exception as e:
        log.error(f"Alignment failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))
