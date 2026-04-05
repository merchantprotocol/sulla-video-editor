const { hashPassword, verifyPassword, createToken, verifyToken } = require('../../src/lib/auth');

describe('Password hashing', () => {
  test('hashPassword returns a salt:hash string', async () => {
    const hash = await hashPassword('testpassword');
    expect(typeof hash).toBe('string');
    expect(hash).toContain(':');

    const [salt, hashPart] = hash.split(':');
    expect(salt.length).toBe(32); // 16 bytes hex
    expect(hashPart.length).toBe(128); // 64 bytes hex
  });

  test('same password produces different hashes (different salts)', async () => {
    const hash1 = await hashPassword('testpassword');
    const hash2 = await hashPassword('testpassword');
    expect(hash1).not.toBe(hash2);
  });

  test('verifyPassword returns true for correct password', async () => {
    const hash = await hashPassword('mySecretPass123');
    const valid = await verifyPassword('mySecretPass123', hash);
    expect(valid).toBe(true);
  });

  test('verifyPassword returns false for wrong password', async () => {
    const hash = await hashPassword('correctPassword');
    const valid = await verifyPassword('wrongPassword', hash);
    expect(valid).toBe(false);
  });

  test('verifyPassword is case-sensitive', async () => {
    const hash = await hashPassword('TestPassword');
    expect(await verifyPassword('testpassword', hash)).toBe(false);
    expect(await verifyPassword('TESTPASSWORD', hash)).toBe(false);
    expect(await verifyPassword('TestPassword', hash)).toBe(true);
  });

  test('handles empty password', async () => {
    const hash = await hashPassword('');
    expect(await verifyPassword('', hash)).toBe(true);
    expect(await verifyPassword('anything', hash)).toBe(false);
  });

  test('handles unicode passwords', async () => {
    const hash = await hashPassword('пароль🔑');
    expect(await verifyPassword('пароль🔑', hash)).toBe(true);
    expect(await verifyPassword('пароль', hash)).toBe(false);
  });
});

describe('JWT tokens', () => {
  test('createToken returns a 3-part token string', () => {
    const token = createToken({ sub: 'user-123', email: 'test@test.com' });
    expect(typeof token).toBe('string');
    const parts = token.split('.');
    expect(parts.length).toBe(3);
  });

  test('verifyToken returns payload for valid token', () => {
    const token = createToken({ sub: 'user-123', email: 'test@test.com' });
    const payload = verifyToken(token);
    expect(payload).not.toBeNull();
    expect(payload.sub).toBe('user-123');
    expect(payload.email).toBe('test@test.com');
  });

  test('verifyToken returns null for tampered token', () => {
    const token = createToken({ sub: 'user-123' });
    // Tamper with the payload
    const parts = token.split('.');
    parts[1] = Buffer.from(JSON.stringify({ sub: 'hacker', exp: Date.now() / 1000 + 9999 })).toString('base64url');
    const tampered = parts.join('.');
    expect(verifyToken(tampered)).toBeNull();
  });

  test('verifyToken returns null for garbage input', () => {
    expect(verifyToken('not.a.jwt')).toBeNull();
    expect(verifyToken('')).toBeNull();
    expect(verifyToken('abc')).toBeNull();
  });

  test('token contains expiry', () => {
    const token = createToken({ sub: 'user-123' });
    const payload = verifyToken(token);
    expect(payload.exp).toBeDefined();
    expect(payload.exp).toBeGreaterThan(Math.floor(Date.now() / 1000));
  });

  test('expired token is rejected', () => {
    // Create a token that's already expired by manually building it
    const crypto = require('crypto');
    const secret = process.env.JWT_SECRET || 'sulla-local-dev-secret';
    const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
    const body = Buffer.from(JSON.stringify({ sub: 'user-123', exp: 1 })).toString('base64url');
    const sig = crypto.createHmac('sha256', secret).update(`${header}.${body}`).digest('base64url');
    const expired = `${header}.${body}.${sig}`;

    expect(verifyToken(expired)).toBeNull();
  });

  test('different payloads produce different tokens', () => {
    const t1 = createToken({ sub: 'user-1' });
    const t2 = createToken({ sub: 'user-2' });
    expect(t1).not.toBe(t2);
  });

  test('payload preserves custom fields', () => {
    const token = createToken({ sub: 'user-123', role: 'admin', orgId: 'org-456' });
    const payload = verifyToken(token);
    expect(payload.role).toBe('admin');
    expect(payload.orgId).toBe('org-456');
  });
});
