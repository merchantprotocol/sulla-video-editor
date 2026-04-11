-- Track the original file path from which a project was ingested from a capture session.
-- For captures: /data/captures/{sessionId}/screen.webm
-- For inbox/upload projects: NULL
ALTER TABLE projects ADD COLUMN IF NOT EXISTS capture_source_path TEXT;
