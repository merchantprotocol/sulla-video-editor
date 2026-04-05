-- Add system template support
-- System templates are globally available and not tied to any org or user.

ALTER TABLE templates ADD COLUMN IF NOT EXISTS is_system BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE templates ADD COLUMN IF NOT EXISTS slug TEXT;
ALTER TABLE templates ADD COLUMN IF NOT EXISTS description TEXT;

-- System templates don't require org_id or created_by
ALTER TABLE templates ALTER COLUMN org_id DROP NOT NULL;
ALTER TABLE templates ALTER COLUMN created_by DROP NOT NULL;

-- Unique constraint on slug for system templates
CREATE UNIQUE INDEX IF NOT EXISTS idx_templates_system_slug
  ON templates (slug) WHERE is_system = true;

CREATE INDEX IF NOT EXISTS idx_templates_is_system ON templates (is_system);
