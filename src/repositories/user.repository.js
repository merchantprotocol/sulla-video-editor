const pool = require('../lib/db');

const UserRepository = {
  async findByEmail(email) {
    const { rows } = await pool.query(
      'SELECT id, name, email, password_hash, avatar_url, created_at FROM users WHERE email = $1',
      [email]
    );
    return rows[0] || null;
  },

  async findById(id) {
    const { rows } = await pool.query(
      'SELECT id, name, email, avatar_url, created_at FROM users WHERE id = $1',
      [id]
    );
    return rows[0] || null;
  },

  async create({ name, email, passwordHash }) {
    const { rows } = await pool.query(
      'INSERT INTO users (name, email, password_hash) VALUES ($1, $2, $3) RETURNING id, name, email, created_at',
      [name, email, passwordHash]
    );
    return rows[0];
  },

  async findAll() {
    const { rows } = await pool.query(
      'SELECT id, name, email, avatar_url, created_at, updated_at FROM users ORDER BY created_at DESC'
    );
    return rows;
  },

  async update(id, { name, email, avatarUrl }) {
    const sets = [];
    const values = [];
    let idx = 1;

    if (name !== undefined) { sets.push(`name = $${idx++}`); values.push(name); }
    if (email !== undefined) { sets.push(`email = $${idx++}`); values.push(email); }
    if (avatarUrl !== undefined) { sets.push(`avatar_url = $${idx++}`); values.push(avatarUrl); }

    if (sets.length === 0) return null;
    sets.push('updated_at = now()');
    values.push(id);

    const { rows } = await pool.query(
      `UPDATE users SET ${sets.join(', ')} WHERE id = $${idx} RETURNING id, name, email, avatar_url, created_at, updated_at`,
      values
    );
    return rows[0] || null;
  },

  async updatePassword(id, passwordHash) {
    await pool.query('UPDATE users SET password_hash = $1, updated_at = now() WHERE id = $2', [passwordHash, id]);
  },

  async delete(id) {
    await pool.query('DELETE FROM users WHERE id = $1', [id]);
  },

  async getOrgsForUser(userId) {
    const { rows } = await pool.query(
      'SELECT o.id, o.name, m.role FROM org_members m JOIN orgs o ON o.id = m.org_id WHERE m.user_id = $1 ORDER BY m.created_at',
      [userId]
    );
    return rows;
  },
};

module.exports = UserRepository;
