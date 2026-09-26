ALTER TABLE objects ADD COLUMN IF NOT EXISTS section TEXT;
CREATE INDEX IF NOT EXISTS idx_objects_section ON objects (section) WHERE deleted_at IS NULL;
