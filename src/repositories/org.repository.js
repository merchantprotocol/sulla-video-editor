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

  async findById(orgId) {
    const { rows } = await pool.query('SELECT id, name, slug, created_at FROM orgs WHERE id = $1', [orgId]);
    return rows[0] || null;
  },

  async update(orgId, { name, slug }) {
    const sets = [];
    const values = [];
    let idx = 1;
    if (name !== undefined) { sets.push(`name = $${idx++}`); values.push(name); }
    if (slug !== undefined) { sets.push(`slug = $${idx++}`); values.push(slug); }
    if (sets.length === 0) return null;
    values.push(orgId);
    const { rows } = await pool.query(
      `UPDATE orgs SET ${sets.join(', ')} WHERE id = $${idx} RETURNING id, name, slug, created_at`,
      values
    );
    return rows[0] || null;
  },

  async getMembers(orgId) {
    const { rows } = await pool.query(
      'SELECT u.id, u.name, u.email, u.avatar_url, m.role, m.created_at FROM org_members m JOIN users u ON u.id = m.user_id WHERE m.org_id = $1 ORDER BY m.created_at',
      [orgId]
    );
    return rows;
  },

  async getMember(orgId, userId) {
    const { rows } = await pool.query(
      'SELECT m.id, m.role, m.created_at, u.id as user_id, u.name, u.email FROM org_members m JOIN users u ON u.id = m.user_id WHERE m.org_id = $1 AND m.user_id = $2',
      [orgId, userId]
    );
    return rows[0] || null;
  },

  async updateMemberRole(orgId, userId, role) {
    const { rows } = await pool.query(
      'UPDATE org_members SET role = $1 WHERE org_id = $2 AND user_id = $3 RETURNING id, role',
      [role, orgId, userId]
    );
    return rows[0] || null;
  },

  async removeMember(orgId, userId) {
    await pool.query('DELETE FROM org_members WHERE org_id = $1 AND user_id = $2', [orgId, userId]);
  },

  async getInvites(orgId) {
    const { rows } = await pool.query(
      'SELECT id, email, role, invited_by, accepted_at, created_at FROM org_invites WHERE org_id = $1 ORDER BY created_at DESC',
      [orgId]
    );
    return rows;
  },

  async createInvite({ orgId, email, role, invitedBy }) {
    const { rows } = await pool.query(
      'INSERT INTO org_invites (org_id, email, role, invited_by) VALUES ($1, $2, $3, $4) ON CONFLICT (org_id, email) DO UPDATE SET role = $3 RETURNING *',
      [orgId, email, role, invitedBy]
    );
    return rows[0];
  },

  async acceptInvite(inviteId) {
    const { rows } = await pool.query(
      'UPDATE org_invites SET accepted_at = now() WHERE id = $1 RETURNING *',
      [inviteId]
    );
    return rows[0] || null;
  },

  async findInviteByEmail(orgId, email) {
    const { rows } = await pool.query(
      'SELECT * FROM org_invites WHERE org_id = $1 AND email = $2 AND accepted_at IS NULL',
      [orgId, email]
    );
    return rows[0] || null;
  },

  async deleteInvite(inviteId) {
    await pool.query('DELETE FROM org_invites WHERE id = $1', [inviteId]);
  },
};

module.exports = OrgRepository;
