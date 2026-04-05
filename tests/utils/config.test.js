const config = require('../../src/utils/config');

describe('Config', () => {
  test('has required properties', () => {
    expect(config).toHaveProperty('port');
    expect(config).toHaveProperty('databaseUrl');
    expect(config).toHaveProperty('jwtSecret');
    expect(config).toHaveProperty('jwtExpirySeconds');
    expect(config).toHaveProperty('storageRoot');
    expect(config).toHaveProperty('whisperCli');
    expect(config).toHaveProperty('whisperModel');
    expect(config).toHaveProperty('fillerWords');
    expect(config).toHaveProperty('silenceThresholdMs');
  });

  test('port is a number', () => {
    expect(typeof config.port).toBe('number');
    expect(config.port).toBeGreaterThan(0);
  });

  test('fillerWords is a Set with expected entries', () => {
    expect(config.fillerWords).toBeInstanceOf(Set);
    expect(config.fillerWords.has('um')).toBe(true);
    expect(config.fillerWords.has('uh')).toBe(true);
    expect(config.fillerWords.has('like')).toBe(true);
    expect(config.fillerWords.has('basically')).toBe(true);
    expect(config.fillerWords.has('you know')).toBe(true);
    // Should NOT contain normal words
    expect(config.fillerWords.has('the')).toBe(false);
    expect(config.fillerWords.has('hello')).toBe(false);
  });

  test('silenceThresholdMs is a positive number', () => {
    expect(config.silenceThresholdMs).toBeGreaterThan(0);
  });

  test('jwtExpirySeconds is reasonable', () => {
    expect(config.jwtExpirySeconds).toBeGreaterThan(3600); // at least 1 hour
    expect(config.jwtExpirySeconds).toBeLessThanOrEqual(60 * 60 * 24 * 365); // at most 1 year
  });

  test('storageRoot is an absolute path', () => {
    const path = require('path');
    expect(path.isAbsolute(config.storageRoot)).toBe(true);
  });
});
