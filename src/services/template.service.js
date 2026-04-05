const TemplateRepository = require('../repositories/template.repository');
const OrgRepository = require('../repositories/org.repository');
const { NotFoundError, ValidationError } = require('../utils/errors');

// Default template configs for each rule type
const DEFAULT_TEMPLATES = {
  podcast: {
    theme: { accentColor: '#5096b3', background: 'dark', fontFamily: 'Inter', captionStyle: 'bold' },
    scenes: [
      { type: 'TitleCard', duration: 4, transitionIn: 'fade', transitionOut: 'crossfade' },
      { type: 'PiP', pipPosition: 'bottom-right', pipSize: 120, pipShape: 'circle' },
      { type: 'TitleCard', duration: 6, transitionIn: 'crossfade', transitionOut: 'fade' },
    ],
    rules: { removeFillers: true, trimSilence: { enabled: true, thresholdMs: 1500 }, studioSound: true, normalize: { enabled: true, targetLufs: -14 }, autoCaptions: true, autoClips: false },
    export: { defaultFormat: '16:9', defaultResolution: '1080p', defaultCodec: 'h264' },
  },
  youtube: {
    theme: { accentColor: '#e5534b', background: 'dark', fontFamily: 'Inter', captionStyle: 'highlight' },
    scenes: [
      { type: 'TitleCard', duration: 3, transitionIn: 'fade' },
      { type: 'FullFrame', transitionIn: 'cut' },
      { type: 'PiP', pipPosition: 'bottom-right', pipSize: 140, pipShape: 'rounded' },
      { type: 'BRoll', transitionIn: 'crossfade' },
      { type: 'PiP' },
      { type: 'CaptionFocus' },
      { type: 'TitleCard', duration: 8, transitionIn: 'crossfade', transitionOut: 'fade' },
    ],
    rules: { removeFillers: true, trimSilence: { enabled: true, thresholdMs: 1500 }, studioSound: true, normalize: { enabled: true, targetLufs: -14 }, autoCaptions: true, autoClips: true },
    export: { defaultFormat: '16:9', defaultResolution: '1080p', defaultCodec: 'h264' },
  },
  social: {
    theme: { accentColor: '#3fb950', background: 'dark', fontFamily: 'Inter', captionStyle: 'highlight' },
    scenes: [
      { type: 'CaptionFocus' },
      { type: 'FullFrame' },
      { type: 'TitleCard', duration: 3 },
    ],
    rules: { removeFillers: true, trimSilence: { enabled: true, thresholdMs: 1000 }, autoCaptions: true, autoClips: true },
    export: { defaultFormat: '9:16', defaultResolution: '1080p', defaultCodec: 'h264' },
  },
  tutorial: {
    theme: { accentColor: '#7c3aed', background: 'light', fontFamily: 'Inter', captionStyle: 'box' },
    scenes: [
      { type: 'TitleCard', duration: 5 },
      { type: 'FullFrame' },
      { type: 'PiP', pipPosition: 'top-right', pipSize: 100, pipShape: 'rounded' },
      { type: 'FullFrame' },
      { type: 'TitleCard', duration: 6 },
    ],
    rules: { removeFillers: true, trimSilence: { enabled: true, thresholdMs: 2000 }, autoCaptions: true },
    export: { defaultFormat: '16:9', defaultResolution: '1080p', defaultCodec: 'h264' },
  },
  interview: {
    theme: { accentColor: '#d29922', background: 'dark', fontFamily: 'Inter', captionStyle: 'bold' },
    scenes: [
      { type: 'TitleCard', duration: 4 },
      { type: 'SideBySide' },
      { type: 'FullFrame' },
      { type: 'TitleCard', duration: 5 },
    ],
    rules: { removeFillers: true, trimSilence: { enabled: true, thresholdMs: 1500 }, studioSound: true, normalize: { enabled: true, targetLufs: -14 }, autoCaptions: true },
    export: { defaultFormat: '16:9', defaultResolution: '1080p', defaultCodec: 'h264' },
  },
};

const TemplateService = {
  async list(userId) {
    const org = await OrgRepository.getUserOrg(userId);
    if (!org) return [];
    return TemplateRepository.findByOrgId(org.id);
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

  async create(userId, { name, ruleType, config }) {
    if (!name) throw new ValidationError('Template name is required');

    const org = await OrgRepository.getUserOrg(userId);
    if (!org) throw new ValidationError('No organization found');

    // If a rule type is provided, merge with default template
    const templateConfig = config || DEFAULT_TEMPLATES[ruleType] || DEFAULT_TEMPLATES.podcast;

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

    return TemplateRepository.update(templateId, { name, config });
  },

  async delete(templateId, userId) {
    const org = await OrgRepository.getUserOrg(userId);
    if (!org) throw new NotFoundError('Template not found');

    const template = await TemplateRepository.findByIdAndOrg(templateId, org.id);
    if (!template) throw new NotFoundError('Template not found');

    await TemplateRepository.delete(templateId);
  },

  getDefaultTemplates() {
    return DEFAULT_TEMPLATES;
  },
};

module.exports = TemplateService;
