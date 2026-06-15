BEGIN;
ALTER TABLE application DROP COLUMN IF EXISTS interview_at;
ALTER TABLE application DROP COLUMN IF EXISTS interview_location;
COMMIT;
