const pool = require('../lib/db');

const ProjectRepository = {
  async findByOrgId(orgId) {
    const { rows } = await pool.query(
      `SELECT id, name, status, rule_template, duration_ms, resolution, file_size, created_at, updated_at
       FROM projects WHERE org_id = $1 ORDER BY updated_at DESC`,
      [orgId]
    );
    return rows;
  },

  async findById(id) {
    const { rows } = await pool.query('SELECT * FROM projects WHERE id = $1', [id]);
    return rows[0] || null;
  },

  async findByIdAndUser(projectId, userId) {
    const { rows } = await pool.query(
      `SELECT p.* FROM projects p
       JOIN org_members m ON p.org_id = m.org_id
       WHERE p.id = $1 AND m.user_id = $2`,
      [projectId, userId]
    );
    return rows[0] || null;
  },

  async create({ orgId, name, ruleTemplate, createdBy }) {
    const { rows } = await pool.query(
      'INSERT INTO projects (org_id, name, rule_template, created_by) VALUES ($1, $2, $3, $4) RETURNING *',
      [orgId, name, ruleTemplate || null, createdBy]
    );
    return rows[0];
  },

  async update(id, data) {
    const fields = Object.keys(data);
    if (fields.length === 0) return null;

    const sets = fields.map((f, i) => `${f} = $${i + 1}`).join(', ');
    const values = fields.map(f => data[f]);

    const { rows } = await pool.query(
      `UPDATE projects SET ${sets}, updated_at = now() WHERE id = $${fields.length + 1} RETURNING *`,
      [...values, id]
    );
    return rows[0] || null;
  },

  async delete(id) {
    await pool.query('DELETE FROM projects WHERE id = $1', [id]);
  },
};

module.exports = ProjectRepository;
