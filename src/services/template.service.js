const TemplateRepository = require('../repositories/template.repository');
const OrgRepository = require('../repositories/org.repository');
const { NotFoundError, ValidationError } = require('../utils/errors');
const { SYSTEM_TEMPLATES } = require('../templates/system');

const TemplateService = {
  async list(userId) {
    let systemTemplates;
    try {
      systemTemplates = await TemplateRepository.findSystemTemplates();
    } catch {
      // Migration not yet run — fall back to file-based templates
      systemTemplates = [];
    }

    // If no system templates in DB, serve directly from JSON files
    if (systemTemplates.length === 0) {
      systemTemplates = Object.values(SYSTEM_TEMPLATES).map(tpl => ({
        id: `system-${tpl.slug}`,
        name: tpl.name,
        slug: tpl.slug,
        description: tpl.description,
        is_system: true,
        config: { theme: tpl.theme, scenes: tpl.scenes, rules: tpl.rules, export: tpl.export },
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }));
    }

    const org = await OrgRepository.getUserOrg(userId);
    const orgTemplates = org ? await TemplateRepository.findByOrgId(org.id) : [];
    return [...systemTemplates, ...orgTemplates];
  },

  async get(templateId, userId) {
    const org = await OrgRepository.getUserOrg(userId);
    if (!org) throw new NotFoundError('Template not found');

    const template = await TemplateRepository.findByIdAndOrg(templateId, org.id);
    if (!template) throw new NotFoundError('Template not found');

    // Parse config if it's a string
    if (typeof template.config === 'string') {
      template.config = JSON.parse(template.config);
    }
    return template;
  },

  async listSystem() {
    return TemplateRepository.findSystemTemplates();
  },

  async getBySlug(slug) {
    const template = await TemplateRepository.findBySlug(slug);
    if (!template) throw new NotFoundError('System template not found');
    if (typeof template.config === 'string') {
      template.config = JSON.parse(template.config);
    }
    return template;
  },

  async create(userId, { name, ruleType, config }) {
    if (!name) throw new ValidationError('Template name is required');

    const org = await OrgRepository.getUserOrg(userId);
    if (!org) throw new ValidationError('No organization found');

    // If a rule type is provided, use matching system template config
    let templateConfig = config;
    if (!templateConfig && ruleType && SYSTEM_TEMPLATES[ruleType]) {
      const tpl = SYSTEM_TEMPLATES[ruleType];
      templateConfig = { theme: tpl.theme, scenes: tpl.scenes, rules: tpl.rules, export: tpl.export };
    }
    if (!templateConfig) {
      const fallback = SYSTEM_TEMPLATES.podcast;
      templateConfig = { theme: fallback.theme, scenes: fallback.scenes, rules: fallback.rules, export: fallback.export };
    }

    return TemplateRepository.create({
      orgId: org.id,
      name,
      config: templateConfig,
      createdBy: userId,
    });
  },

  async update(templateId, userId, { name, config }) {
    const org = await OrgRepository.getUserOrg(userId);
    if (!org) throw new NotFoundError('Template not found');

    const template = await TemplateRepository.findByIdAndOrg(templateId, org.id);
    if (!template) throw new NotFoundError('Template not found');
    if (template.is_system) throw new ValidationError('System templates cannot be modified');

    return TemplateRepository.update(templateId, { name, config });
  },

  async delete(templateId, userId) {
    const org = await OrgRepository.getUserOrg(userId);
    if (!org) throw new NotFoundError('Template not found');

    const template = await TemplateRepository.findByIdAndOrg(templateId, org.id);
    if (!template) throw new NotFoundError('Template not found');
    if (template.is_system) throw new ValidationError('System templates cannot be deleted');

    await TemplateRepository.delete(templateId);
  },

  getDefaultTemplates() {
    return SYSTEM_TEMPLATES;
  },
};

module.exports = TemplateService;
