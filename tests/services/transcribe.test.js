const { transformWhisperOutput } = require('../../src/services/transcribe');

describe('transformWhisperOutput', () => {
  test('transforms token-based whisper output to words', () => {
    const whisperOutput = {
      transcription: [
        {
          tokens: [
            { text: 'Hello', t0: 0, t1: 50, p: 0.95 },
            { text: 'world', t0: 55, t1: 100, p: 0.92 },
          ],
        },
      ],
    };

    const result = transformWhisperOutput(whisperOutput);
    expect(result.words).toHaveLength(2);
    expect(result.words[0].word).toBe('Hello');
    expect(result.words[0].start).toBe(0);
    expect(result.words[0].end).toBe(0.5);
    expect(result.words[0].confidence).toBe(0.95);
    expect(result.words[0].speaker).toBe('s1');
    expect(result.words[1].word).toBe('world');
  });

  test('detects filler words', () => {
    const whisperOutput = {
      transcription: [
        {
          tokens: [
            { text: 'I', t0: 0, t1: 10, p: 0.9 },
            { text: 'um', t0: 15, t1: 25, p: 0.8 },
            { text: 'think', t0: 30, t1: 50, p: 0.95 },
            { text: 'like', t0: 55, t1: 65, p: 0.85 },
            { text: 'basically', t0: 70, t1: 100, p: 0.88 },
          ],
        },
      ],
    };

    const result = transformWhisperOutput(whisperOutput);
    expect(result.words[0].filler).toBeUndefined(); // "I" is not a filler
    expect(result.words[1].filler).toBe(true); // "um"
    expect(result.words[2].filler).toBeUndefined(); // "think"
    expect(result.words[3].filler).toBe(true); // "like"
    expect(result.words[4].filler).toBe(true); // "basically"
  });

  test('detects silence gaps > 1.5s', () => {
    const whisperOutput = {
      transcription: [
        {
          tokens: [
            { text: 'First', t0: 0, t1: 50, p: 0.9 },
            { text: 'word', t0: 55, t1: 100, p: 0.9 },
          ],
        },
        {
          tokens: [
            { text: 'After', t0: 300, t1: 350, p: 0.9 }, // 2 second gap
            { text: 'pause', t0: 355, t1: 400, p: 0.9 },
          ],
        },
      ],
    };

    const result = transformWhisperOutput(whisperOutput);
    expect(result.silences).toHaveLength(1);
    expect(result.silences[0].duration).toBe(2); // 3.0 - 1.0 = 2 seconds
    expect(result.silences[0].after_word_index).toBe(1);
  });

  test('does NOT detect small gaps as silence', () => {
    const whisperOutput = {
      transcription: [
        {
          tokens: [
            { text: 'No', t0: 0, t1: 50, p: 0.9 },
            { text: 'gap', t0: 60, t1: 100, p: 0.9 }, // 0.1s gap — normal
          ],
        },
      ],
    };

    const result = transformWhisperOutput(whisperOutput);
    expect(result.silences).toHaveLength(0);
  });

  test('handles segment-level fallback (no tokens)', () => {
    const whisperOutput = {
      transcription: [
        {
          text: 'Hello world how are you',
          offsets: { from: 0, to: 5000 },
        },
      ],
    };

    const result = transformWhisperOutput(whisperOutput);
    expect(result.words.length).toBe(5);
    expect(result.words[0].word).toBe('Hello');
    expect(result.words[4].word).toBe('you');
    // Timestamps should be evenly distributed
    expect(result.words[0].start).toBe(0);
    expect(result.words[4].end).toBeCloseTo(5, 0);
  });

  test('handles empty input', () => {
    expect(transformWhisperOutput({})).toEqual({
      speakers: [{ id: 's1', name: 'Speaker 1', color: '#3a7f9e' }],
      words: [],
      silences: [],
      duration_ms: 0,
      word_count: 0,
    });

    expect(transformWhisperOutput({ transcription: [] })).toEqual({
      speakers: [{ id: 's1', name: 'Speaker 1', color: '#3a7f9e' }],
      words: [],
      silences: [],
      duration_ms: 0,
      word_count: 0,
    });
  });

  test('strips empty tokens', () => {
    const whisperOutput = {
      transcription: [
        {
          tokens: [
            { text: '', t0: 0, t1: 10, p: 0.9 },
            { text: '  ', t0: 10, t1: 20, p: 0.9 },
            { text: 'Hello', t0: 20, t1: 50, p: 0.9 },
          ],
        },
      ],
    };

    const result = transformWhisperOutput(whisperOutput);
    expect(result.words).toHaveLength(1);
    expect(result.words[0].word).toBe('Hello');
  });

  test('calculates duration_ms from last word', () => {
    const whisperOutput = {
      transcription: [
        {
          tokens: [
            { text: 'Start', t0: 0, t1: 50, p: 0.9 },
            { text: 'End', t0: 1000, t1: 1250, p: 0.9 },
          ],
        },
      ],
    };

    const result = transformWhisperOutput(whisperOutput);
    expect(result.duration_ms).toBe(12500); // 12.5 seconds * 1000
  });

  test('always returns s1 as default speaker', () => {
    const result = transformWhisperOutput({
      transcription: [{ tokens: [{ text: 'test', t0: 0, t1: 10, p: 0.9 }] }],
    });
    expect(result.speakers).toEqual([{ id: 's1', name: 'Speaker 1', color: '#3a7f9e' }]);
    expect(result.words[0].speaker).toBe('s1');
  });

  test('filler detection is case-insensitive', () => {
    const whisperOutput = {
      transcription: [
        {
          tokens: [
            { text: 'Um', t0: 0, t1: 10, p: 0.9 },
            { text: 'LIKE', t0: 15, t1: 25, p: 0.9 },
            { text: 'Basically,', t0: 30, t1: 50, p: 0.9 }, // with punctuation
          ],
        },
      ],
    };

    const result = transformWhisperOutput(whisperOutput);
    expect(result.words[0].filler).toBe(true); // Um
    expect(result.words[1].filler).toBe(true); // LIKE
    expect(result.words[2].filler).toBe(true); // Basically, (punctuation stripped)
  });
});
