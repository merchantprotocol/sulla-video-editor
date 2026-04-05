const fs = require('fs');
const path = require('path');

const TEMPLATE_DIR = __dirname;

/**
 * Load all system template JSON files from this directory.
 * Returns an object keyed by slug, e.g. { podcast: {...}, youtube: {...} }
 */
function loadSystemTemplates() {
  const templates = {};
  const files = fs.readdirSync(TEMPLATE_DIR).filter(f => f.endsWith('.json'));

  for (const file of files) {
    const data = JSON.parse(fs.readFileSync(path.join(TEMPLATE_DIR, file), 'utf8'));
    templates[data.slug] = data;
  }

  return templates;
}

const SYSTEM_TEMPLATES = loadSystemTemplates();

module.exports = { SYSTEM_TEMPLATES, loadSystemTemplates };
