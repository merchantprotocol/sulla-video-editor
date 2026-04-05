const pool = require('../lib/db');

const OrgRepository = {
  async create({ name, slug }) {
    const { rows } = await pool.query(
      'INSERT INTO orgs (name, slug) VALUES ($1, $2) RETURNING id, name, slug',
      [name, slug]
    );
    return rows[0];
  },

  async addMember({ orgId, userId, role = 'member' }) {
    const { rows } = await pool.query(
      'INSERT INTO org_members (org_id, user_id, role) VALUES ($1, $2, $3) RETURNING id',
      [orgId, userId, role]
    );
    return rows[0];
  },

  async getUserOrg(userId) {
    const { rows } = await pool.query(
      'SELECT o.id, o.name FROM org_members m JOIN orgs o ON o.id = m.org_id WHERE m.user_id = $1 ORDER BY m.created_at LIMIT 1',
      [userId]
    );
    return rows[0] || null;
  },

  async getMembers(orgId) {
    const { rows } = await pool.query(
      'SELECT u.id, u.name, u.email, u.avatar_url, m.role, m.created_at FROM org_members m JOIN users u ON u.id = m.user_id WHERE m.org_id = $1',
      [orgId]
    );
    return rows;
  },
};

module.exports = OrgRepository;
