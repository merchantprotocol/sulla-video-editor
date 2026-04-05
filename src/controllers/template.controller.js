const TemplateService = require('../services/template.service');

const TemplateController = {
  async list(req, res, next) {
    try {
      const templates = await TemplateService.list(req.userId);
      res.json({ templates });
    } catch (err) { next(err); }
  },

  async get(req, res, next) {
    try {
      const template = await TemplateService.get(req.params.id, req.userId);
      res.json({ template });
    } catch (err) { next(err); }
  },

  async create(req, res, next) {
    try {
      const { name, rule_type, config } = req.body;
      const template = await TemplateService.create(req.userId, { name, ruleType: rule_type, config });
      res.json({ template });
    } catch (err) { next(err); }
  },

  async update(req, res, next) {
    try {
      const { name, config } = req.body;
      const template = await TemplateService.update(req.params.id, req.userId, { name, config });
      res.json({ template });
    } catch (err) { next(err); }
  },

  async delete(req, res, next) {
    try {
      await TemplateService.delete(req.params.id, req.userId);
      res.json({ deleted: true });
    } catch (err) { next(err); }
  },

  async defaults(req, res) {
    res.json({ templates: TemplateService.getDefaultTemplates() });
  },

  async listSystem(req, res, next) {
    try {
      const templates = await TemplateService.listSystem();
      res.json({ templates });
    } catch (err) { next(err); }
  },

  async getBySlug(req, res, next) {
    try {
      const template = await TemplateService.getBySlug(req.params.slug);
      res.json({ template });
    } catch (err) { next(err); }
  },
};

module.exports = TemplateController;
