const pool = require('../lib/db');
const { hashPassword, verifyPassword, createToken } = require('../lib/auth');
const UserRepository = require('../repositories/user.repository');
const OrgRepository = require('../repositories/org.repository');
const { ValidationError, UnauthorizedError, ConflictError } = require('../utils/errors');

const AuthService = {
  async register({ name, email, password, orgName }) {
    if (!name || !email || !password || !orgName) {
      throw new ValidationError('Name, email, password, and organization name are required');
    }
    if (password.length < 8) {
      throw new ValidationError('Password must be at least 8 characters');
    }

    const existing = await UserRepository.findByEmail(email);
    if (existing) throw new ConflictError('An account with this email already exists');

    const passwordHash = await hashPassword(password);
    const slug = orgName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const user = await UserRepository.create({ name, email, passwordHash });
      const org = await OrgRepository.create({ name: orgName, slug });
      await OrgRepository.addMember({ orgId: org.id, userId: user.id, role: 'owner' });
      await client.query("UPDATE app_state SET value = 'true', updated_at = now() WHERE key = 'onboarded'");

      await client.query('COMMIT');

      const token = createToken({ sub: user.id, email });
      return { token, user: { id: user.id, name, email }, orgs: [{ id: org.id, name: orgName, role: 'owner' }] };
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  },

  async login({ email, password }) {
    if (!email || !password) throw new ValidationError('Email and password are required');

    const user = await UserRepository.findByEmail(email);
    if (!user) throw new UnauthorizedError('Invalid email or password');

    const valid = await verifyPassword(password, user.password_hash);
    if (!valid) throw new UnauthorizedError('Invalid email or password');

    const orgs = await UserRepository.getOrgsForUser(user.id);
    const token = createToken({ sub: user.id, email });

    return {
      token,
      user: { id: user.id, name: user.name, email: user.email, avatar_url: user.avatar_url },
      orgs,
    };
  },

  async getMe(userId) {
    const user = await UserRepository.findById(userId);
    if (!user) throw new UnauthorizedError('User not found');

    const orgs = await UserRepository.getOrgsForUser(userId);
    return { user, orgs };
  },

  async isOnboarded() {
    try {
      const { rows } = await pool.query("SELECT value FROM app_state WHERE key = 'onboarded'");
      return rows[0]?.value === 'true' || rows[0]?.value === true;
    } catch {
      return false;
    }
  },
};

module.exports = AuthService;
