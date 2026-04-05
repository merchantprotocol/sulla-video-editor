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

  async getOrgsForUser(userId) {
    const { rows } = await pool.query(
      'SELECT o.id, o.name, m.role FROM org_members m JOIN orgs o ON o.id = m.org_id WHERE m.user_id = $1 ORDER BY m.created_at',
      [userId]
    );
    return rows;
  },
};

module.exports = UserRepository;
