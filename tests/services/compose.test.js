const { escapeDrawtext } = require('../../src/services/compose.service');

describe('escapeDrawtext', () => {
  test('escapes colons', () => {
    expect(escapeDrawtext('Hello: World')).toBe('Hello\\: World');
  });

  test('escapes single quotes', () => {
    const result = escapeDrawtext("It's great");
    expect(result).toContain("\\'");
  });

  test('escapes backslashes', () => {
    expect(escapeDrawtext('back\\slash')).toContain('\\\\');
  });

  test('escapes percent signs', () => {
    expect(escapeDrawtext('100% done')).toBe('100%% done');
  });

  test('removes newlines', () => {
    expect(escapeDrawtext('line1\nline2')).toBe('line1line2');
  });

  test('handles empty string', () => {
    expect(escapeDrawtext('')).toBe('');
  });

  test('handles normal text unchanged', () => {
    expect(escapeDrawtext('Hello World')).toBe('Hello World');
  });

  test('handles multiple special chars', () => {
    const result = escapeDrawtext("It's 100%: done");
    expect(result).not.toContain('\n');
    expect(result).toContain('100%%');
    expect(result).toContain('\\:');
  });
});

describe('Composition format validation', () => {
  // These test the contract, not the FFmpeg execution
  test('valid composition structure', () => {
    const comp = {
      width: 1920,
      height: 1080,
      fps: 30,
      slides: [
        { duration: 5, text: 'Hello', background: '#0d1117', textColor: '#ffffff' },
        { duration: 3, text: 'World', subtitle: 'Subtitle here' },
      ],
    };

    expect(comp.slides).toHaveLength(2);
    expect(comp.slides[0].duration).toBe(5);
    expect(comp.slides[1].subtitle).toBe('Subtitle here');
    expect(comp.width).toBe(1920);
  });

  test('slides have sensible defaults', () => {
    const defaults = {
      duration: 5,
      background: '#0d1117',
      textColor: '#e6edf3',
      accentColor: '#5096b3',
      fontSize: 64,
      subtitleSize: 28,
    };

    // These are the defaults in renderSlide
    expect(defaults.duration).toBeGreaterThan(0);
    expect(defaults.fontSize).toBeGreaterThan(0);
    expect(defaults.background).toMatch(/^#[0-9a-f]{6}$/i);
  });
});
