const { generateASS, formatASSTime } = require('../../src/services/caption.service');

describe('formatASSTime', () => {
  test('formats zero', () => {
    expect(formatASSTime(0)).toBe('0:00:00.00');
  });

  test('formats seconds', () => {
    expect(formatASSTime(5000)).toBe('0:00:05.00');
    expect(formatASSTime(30000)).toBe('0:00:30.00');
  });

  test('formats minutes', () => {
    expect(formatASSTime(60000)).toBe('0:01:00.00');
    expect(formatASSTime(90000)).toBe('0:01:30.00');
  });

  test('formats hours', () => {
    expect(formatASSTime(3600000)).toBe('1:00:00.00');
  });

  test('formats centiseconds', () => {
    expect(formatASSTime(1230)).toBe('0:00:01.23');
    expect(formatASSTime(5670)).toBe('0:00:05.67');
  });

  test('formats complex time', () => {
    expect(formatASSTime(4567890)).toBe('1:16:07.89');
  });
});

describe('generateASS', () => {
  const transcript = {
    words: [
      { word: 'Hello', start: 0, end: 0.5, speaker: 's1' },
      { word: 'world', start: 0.6, end: 1.0, speaker: 's1' },
      { word: 'how', start: 1.2, end: 1.5, speaker: 's1' },
      { word: 'are', start: 1.6, end: 1.8, speaker: 's1' },
      { word: 'you', start: 1.9, end: 2.2, speaker: 's1' },
      { word: 'today', start: 2.3, end: 2.8, speaker: 's1' },
    ],
  };

  test('generates valid ASS header', () => {
    const ass = generateASS(transcript, {});
    expect(ass).toContain('[Script Info]');
    expect(ass).toContain('[V4+ Styles]');
    expect(ass).toContain('[Events]');
    expect(ass).toContain('Style: Default');
  });

  test('generates dialogue events with word groups', () => {
    const ass = generateASS(transcript, {}, { maxWordsPerLine: 3 });
    const lines = ass.split('\n').filter(l => l.startsWith('Dialogue:'));
    expect(lines.length).toBe(2); // 6 words / 3 per line = 2 lines
  });

  test('default maxWordsPerLine is 4', () => {
    const ass = generateASS(transcript, {});
    const lines = ass.split('\n').filter(l => l.startsWith('Dialogue:'));
    expect(lines.length).toBe(2); // 6 words / 4 per line = 2 lines (4 + 2)
  });

  test('dialogue contains word text', () => {
    const ass = generateASS(transcript, {});
    expect(ass).toContain('Hello world how are');
    expect(ass).toContain('you today');
  });

  test('excludes cut words', () => {
    const edl = {
      cuts: [
        { type: 'remove', start_ms: 1200, end_ms: 1800, reason: 'filler' }, // cuts "how" and "are"
      ],
    };
    const ass = generateASS(transcript, edl);
    // "how" (1.2-1.5) and "are" (1.6-1.8) should be excluded
    expect(ass).not.toContain('how are');
    expect(ass).toContain('Hello world');
    expect(ass).toContain('you today');
  });

  test('handles empty transcript', () => {
    const ass = generateASS({ words: [] }, {});
    expect(ass).toContain('[Script Info]');
    const lines = ass.split('\n').filter(l => l.startsWith('Dialogue:'));
    expect(lines.length).toBe(0);
  });

  test('uses custom font settings', () => {
    const ass = generateASS(transcript, {}, { fontName: 'Arial', fontSize: 48 });
    expect(ass).toContain('Arial');
    expect(ass).toContain(',48,');
  });

  test('positions captions correctly', () => {
    // ASS Style line ends with: ...Alignment,MarginL,MarginR,MarginV,Encoding
    // So alignment is the 4th-from-last comma-separated value in the Style line
    const bottom = generateASS(transcript, {}, { position: 'bottom' });
    const bottomStyle = bottom.split('\n').find(l => l.startsWith('Style:'));
    expect(bottomStyle).toContain(',2,40,40,60,1'); // alignment 2

    const center = generateASS(transcript, {}, { position: 'center' });
    const centerStyle = center.split('\n').find(l => l.startsWith('Style:'));
    expect(centerStyle).toContain(',5,40,40,60,1'); // alignment 5

    const top = generateASS(transcript, {}, { position: 'top' });
    const topStyle = top.split('\n').find(l => l.startsWith('Style:'));
    expect(topStyle).toContain(',8,40,40,60,1'); // alignment 8
  });
});
