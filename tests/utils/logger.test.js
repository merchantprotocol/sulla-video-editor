describe('Logger', () => {
  let create, LOG_DIR;
  const captured = { stdout: [], stderr: [] };
  const origStdout = process.stdout.write;
  const origStderr = process.stderr.write;

  beforeAll(() => {
    // Capture stdout/stderr to test log output
    process.stdout.write = (data) => { captured.stdout.push(data); return true; };
    process.stderr.write = (data) => { captured.stderr.push(data); return true; };

    // Require after capturing
    const logger = require('../../src/utils/logger');
    create = logger.create;
    LOG_DIR = logger.LOG_DIR;
  });

  afterAll(() => {
    process.stdout.write = origStdout;
    process.stderr.write = origStderr;
  });

  beforeEach(() => {
    captured.stdout = [];
    captured.stderr = [];
  });

  test('creates tagged loggers with all levels', () => {
    const log = create('test-tag');
    expect(typeof log.debug).toBe('function');
    expect(typeof log.info).toBe('function');
    expect(typeof log.warn).toBe('function');
    expect(typeof log.error).toBe('function');
  });

  test('info outputs to stdout with correct format', () => {
    const log = create('myservice');
    log.info('Something happened');

    expect(captured.stdout.length).toBeGreaterThanOrEqual(1);
    const line = captured.stdout[captured.stdout.length - 1];
    expect(line).toContain('[INFO ]');
    expect(line).toContain('[myservice]');
    expect(line).toContain('Something happened');
    expect(line).toContain(`[pid:${process.pid}]`);
  });

  test('error outputs to stderr', () => {
    const log = create('db');
    log.error('Connection failed');

    expect(captured.stderr.length).toBeGreaterThanOrEqual(1);
    const line = captured.stderr[captured.stderr.length - 1];
    expect(line).toContain('[ERROR]');
    expect(line).toContain('[db]');
    expect(line).toContain('Connection failed');
  });

  test('warn outputs to stdout (not stderr)', () => {
    const log = create('auth');
    log.warn('Token expired');

    const line = captured.stdout[captured.stdout.length - 1];
    expect(line).toContain('[WARN ]');
    expect(line).toContain('[auth]');
  });

  test('includes metadata as JSON', () => {
    const log = create('project');
    log.info('Created', { projectId: 'abc-123', name: 'my video' });

    const line = captured.stdout[captured.stdout.length - 1];
    expect(line).toContain('"projectId":"abc-123"');
    expect(line).toContain('"name":"my video"');
  });

  test('omits metadata when empty or undefined', () => {
    const log = create('test');
    log.info('No meta');

    const line = captured.stdout[captured.stdout.length - 1];
    expect(line).not.toContain('{}');
    expect(line).toMatch(/No meta\n$/);
  });

  test('includes ISO timestamp at start of line', () => {
    const log = create('test');
    log.info('Timestamped');

    const line = captured.stdout[captured.stdout.length - 1];
    expect(line).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
  });

  test('each line ends with newline', () => {
    const log = create('test');
    log.info('Newline check');

    const line = captured.stdout[captured.stdout.length - 1];
    expect(line.endsWith('\n')).toBe(true);
  });

  test('LOG_DIR is a non-empty string', () => {
    expect(typeof LOG_DIR).toBe('string');
    expect(LOG_DIR.length).toBeGreaterThan(0);
  });

  test('different tags produce different prefixes', () => {
    const log1 = create('alpha');
    const log2 = create('beta');

    log1.info('from alpha');
    const line1 = captured.stdout[captured.stdout.length - 1];

    log2.info('from beta');
    const line2 = captured.stdout[captured.stdout.length - 1];

    expect(line1).toContain('[alpha]');
    expect(line2).toContain('[beta]');
  });
});
