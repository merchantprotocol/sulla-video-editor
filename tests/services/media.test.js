const { parseFraction } = require('../../src/services/media');
const fs = require('fs');
const path = require('path');

describe('parseFraction', () => {
  test('parses standard ffprobe fractions', () => {
    expect(parseFraction('30/1')).toBe(30);
    expect(parseFraction('60/1')).toBe(60);
    expect(parseFraction('25/1')).toBe(25);
    expect(parseFraction('24/1')).toBe(24);
  });

  test('parses NTSC fractional frame rates', () => {
    expect(parseFraction('24000/1001')).toBeCloseTo(23.976, 2);
    expect(parseFraction('30000/1001')).toBeCloseTo(29.97, 2);
    expect(parseFraction('60000/1001')).toBeCloseTo(59.94, 2);
  });

  test('parses plain numbers', () => {
    expect(parseFraction('30')).toBe(30);
    expect(parseFraction('60')).toBe(60);
    expect(parseFraction('23.976')).toBeCloseTo(23.976, 2);
  });

  test('returns 30 for null/undefined/empty', () => {
    expect(parseFraction(null)).toBe(30);
    expect(parseFraction(undefined)).toBe(30);
    expect(parseFraction('')).toBe(30);
  });

  test('returns 30 for non-numeric garbage', () => {
    expect(parseFraction('garbage')).toBe(30);
    expect(parseFraction('abc/def')).toBe(30); // NaN / NaN = NaN → 30
  });

  test('handles zero correctly', () => {
    expect(parseFraction('0/1')).toBe(0);
    expect(parseFraction('0')).toBe(0);
  });

  test('handles division by zero gracefully', () => {
    expect(parseFraction('30/0')).toBe(30); // falls back to default
  });
});

describe('Media service source code', () => {
  const source = fs.readFileSync(path.join(__dirname, '../../src/services/media.js'), 'utf-8');

  test('does NOT use eval()', () => {
    expect(source).not.toMatch(/\beval\s*\(/);
  });

  test('extracts audio at 16kHz mono (whisper requirement)', () => {
    expect(source).toContain("'16000'");
    expect(source).toContain("'1'"); // mono channel
  });
});
