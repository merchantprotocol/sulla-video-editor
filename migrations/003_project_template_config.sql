-- Store the full template config snapshot on the project so the editor
-- knows which rules to auto-apply (removeFillers, trimSilence, etc.)
-- and which export defaults to use.

ALTER TABLE projects ADD COLUMN IF NOT EXISTS template_id UUID REFERENCES templates(id);
ALTER TABLE projects ADD COLUMN IF NOT EXISTS template_config JSONB;
