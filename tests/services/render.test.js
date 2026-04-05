const { buildSelectFilter, getOutputDimensions } = require('../../src/services/render.service');

describe('buildSelectFilter', () => {
  test('returns null when no cuts', () => {
    expect(buildSelectFilter({ cuts: [] }, 60000)).toBeNull();
    expect(buildSelectFilter({}, 60000)).toBeNull();
  });

  test('builds select filter for a single cut in the middle', () => {
    const edl = {
      cuts: [{ type: 'remove', start_ms: 5000, end_ms: 8000, reason: 'filler' }],
    };
    const result = buildSelectFilter(edl, 60000);

    expect(result).not.toBeNull();
    expect(result.keeps).toHaveLength(2);
    expect(result.keeps[0]).toEqual({ start: 0, end: 5 });
    expect(result.keeps[1]).toEqual({ start: 8, end: 60 });
    expect(result.selectExpr).toContain('between(t,0.000,5.000)');
    expect(result.selectExpr).toContain('between(t,8.000,60.000)');
  });

  test('builds filter for cut at the beginning', () => {
    const edl = {
      cuts: [{ type: 'remove', start_ms: 0, end_ms: 3000, reason: 'hook' }],
    };
    const result = buildSelectFilter(edl, 30000);

    expect(result.keeps).toHaveLength(1);
    expect(result.keeps[0]).toEqual({ start: 3, end: 30 });
  });

  test('builds filter for cut at the end', () => {
    const edl = {
      cuts: [{ type: 'remove', start_ms: 25000, end_ms: 30000, reason: 'silence' }],
    };
    const result = buildSelectFilter(edl, 30000);

    expect(result.keeps).toHaveLength(1);
    expect(result.keeps[0]).toEqual({ start: 0, end: 25 });
  });

  test('handles multiple cuts', () => {
    const edl = {
      cuts: [
        { type: 'remove', start_ms: 2000, end_ms: 3000, reason: 'filler:um' },
        { type: 'remove', start_ms: 10000, end_ms: 12000, reason: 'silence' },
        { type: 'remove', start_ms: 20000, end_ms: 21000, reason: 'filler:like' },
      ],
    };
    const result = buildSelectFilter(edl, 30000);

    expect(result.keeps).toHaveLength(4);
    expect(result.keeps[0]).toEqual({ start: 0, end: 2 });
    expect(result.keeps[1]).toEqual({ start: 3, end: 10 });
    expect(result.keeps[2]).toEqual({ start: 12, end: 20 });
    expect(result.keeps[3]).toEqual({ start: 21, end: 30 });
  });

  test('handles unsorted cuts (sorts them)', () => {
    const edl = {
      cuts: [
        { type: 'remove', start_ms: 20000, end_ms: 22000, reason: 'b' },
        { type: 'remove', start_ms: 5000, end_ms: 7000, reason: 'a' },
      ],
    };
    const result = buildSelectFilter(edl, 30000);

    expect(result.keeps).toHaveLength(3);
    expect(result.keeps[0].end).toBe(5);
    expect(result.keeps[1].start).toBe(7);
    expect(result.keeps[1].end).toBe(20);
    expect(result.keeps[2].start).toBe(22);
  });

  test('handles adjacent cuts (no gap between them)', () => {
    const edl = {
      cuts: [
        { type: 'remove', start_ms: 5000, end_ms: 8000, reason: 'a' },
        { type: 'remove', start_ms: 8000, end_ms: 12000, reason: 'b' },
      ],
    };
    const result = buildSelectFilter(edl, 30000);

    expect(result.keeps).toHaveLength(2);
    expect(result.keeps[0]).toEqual({ start: 0, end: 5 });
    expect(result.keeps[1]).toEqual({ start: 12, end: 30 });
  });

  test('handles overlapping cuts', () => {
    const edl = {
      cuts: [
        { type: 'remove', start_ms: 5000, end_ms: 10000, reason: 'a' },
        { type: 'remove', start_ms: 8000, end_ms: 15000, reason: 'b' },
      ],
    };
    const result = buildSelectFilter(edl, 30000);

    // Overlapping cuts: 5-10 and 8-15 → effective cut is 5-15
    expect(result.keeps).toHaveLength(2);
    expect(result.keeps[0]).toEqual({ start: 0, end: 5 });
    expect(result.keeps[1]).toEqual({ start: 15, end: 30 });
  });

  test('throws when all content is cut', () => {
    const edl = {
      cuts: [{ type: 'remove', start_ms: 0, end_ms: 30000, reason: 'all' }],
    };
    expect(() => buildSelectFilter(edl, 30000)).toThrow('EDL cuts remove all content');
  });

  test('selectExpr uses 3 decimal places for precision', () => {
    const edl = {
      cuts: [{ type: 'remove', start_ms: 1234, end_ms: 5678, reason: 'test' }],
    };
    const result = buildSelectFilter(edl, 10000);
    expect(result.selectExpr).toContain('1.234');
    expect(result.selectExpr).toContain('5.678');
  });
});

describe('getOutputDimensions', () => {
  test('16:9 returns base dimensions', () => {
    expect(getOutputDimensions('16:9', 1920, 1080)).toEqual({ w: 1920, h: 1080 });
  });

  test('9:16 returns vertical dimensions', () => {
    const dims = getOutputDimensions('9:16', 1920, 1080);
    expect(dims.h).toBe(1080);
    expect(dims.w).toBe(1080 * 9 / 16); // 607.5
  });

  test('1:1 returns square dimensions', () => {
    const dims = getOutputDimensions('1:1', 1920, 1080);
    expect(dims.w).toBe(1080);
    expect(dims.h).toBe(1080);
  });

  test('4:5 returns portrait dimensions', () => {
    const dims = getOutputDimensions('4:5', 1920, 1080);
    expect(dims.h).toBe(1080);
    expect(dims.w).toBe(1080 * 4 / 5); // 864
  });

  test('unknown format defaults to 16:9', () => {
    expect(getOutputDimensions('unknown', 1920, 1080)).toEqual({ w: 1920, h: 1080 });
  });

  test('handles 4K base', () => {
    expect(getOutputDimensions('16:9', 3840, 2160)).toEqual({ w: 3840, h: 2160 });
    const sq = getOutputDimensions('1:1', 3840, 2160);
    expect(sq.w).toBe(2160);
    expect(sq.h).toBe(2160);
  });
});
