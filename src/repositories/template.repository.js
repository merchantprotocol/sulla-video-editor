const pool = require('../lib/db');

const TemplateRepository = {
  async findByOrgId(orgId) {
    const { rows } = await pool.query(
      'SELECT id, name, config, created_by, created_at, updated_at FROM templates WHERE org_id = $1 ORDER BY updated_at DESC',
      [orgId]
    );
    return rows;
  },

  async findById(id) {
    const { rows } = await pool.query('SELECT * FROM templates WHERE id = $1', [id]);
    return rows[0] || null;
  },

  async findByIdAndOrg(id, orgId) {
    const { rows } = await pool.query('SELECT * FROM templates WHERE id = $1 AND org_id = $2', [id, orgId]);
    return rows[0] || null;
  },

  async create({ orgId, name, config, createdBy }) {
    const { rows } = await pool.query(
      'INSERT INTO templates (org_id, name, config, created_by) VALUES ($1, $2, $3, $4) RETURNING *',
      [orgId, name, JSON.stringify(config), createdBy]
    );
    return rows[0];
  },

  async update(id, { name, config }) {
    const sets = [];
    const values = [];
    let idx = 1;

    if (name !== undefined) { sets.push(`name = $${idx++}`); values.push(name); }
    if (config !== undefined) { sets.push(`config = $${idx++}`); values.push(JSON.stringify(config)); }

    if (sets.length === 0) return null;

    sets.push(`updated_at = now()`);
    values.push(id);

    const { rows } = await pool.query(
      `UPDATE templates SET ${sets.join(', ')} WHERE id = $${idx} RETURNING *`,
      values
    );
    return rows[0] || null;
  },

  async delete(id) {
    await pool.query('DELETE FROM templates WHERE id = $1', [id]);
  },
};

module.exports = TemplateRepository;
