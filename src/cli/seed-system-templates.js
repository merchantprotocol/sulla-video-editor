#!/usr/bin/env node

/**
 * Upserts system templates from src/templates/system/*.json into the database.
 * Safe to run multiple times — uses ON CONFLICT to update existing entries.
 *
 * Usage: node src/cli/seed-system-templates.js
 */

const pool = require('../lib/db');
const { SYSTEM_TEMPLATES } = require('../templates/system');

async function seedSystemTemplates() {
  const slugs = Object.keys(SYSTEM_TEMPLATES);
  console.log(`Seeding ${slugs.length} system templates: ${slugs.join(', ')}`);

  for (const slug of slugs) {
    const tpl = SYSTEM_TEMPLATES[slug];
    const config = {
      theme: tpl.theme,
      scenes: tpl.scenes,
      rules: tpl.rules,
      export: tpl.export,
    };

    await pool.query(
      `INSERT INTO templates (name, slug, description, config, is_system, org_id, created_by)
       VALUES ($1, $2, $3, $4, true, NULL, NULL)
       ON CONFLICT (slug) WHERE is_system = true
       DO UPDATE SET name = $1, description = $3, config = $4, updated_at = now()`,
      [tpl.name, tpl.slug, tpl.description, JSON.stringify(config)]
    );

    console.log(`  ✓ ${tpl.name} (${slug})`);
  }

  console.log('Done.');
}

seedSystemTemplates()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Failed to seed system templates:', err);
    process.exit(1);
  });
