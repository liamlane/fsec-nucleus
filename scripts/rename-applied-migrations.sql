-- Update the pgmigrations bookkeeping table so the already-applied
-- baseline and email_infrastructure migrations are recognised by their
-- new timestamp-prefixed filenames.
--
-- Run this BEFORE deploying the renamed migration files. Otherwise
-- node-pg-migrate will try to apply them again and fail (tables already
-- exist).
--
-- Run on TrueNAS:
--   sudo docker compose exec -T postgres psql -U nucleus -d nucleus \
--     < scripts/rename-applied-migrations.sql

UPDATE pgmigrations
SET name = '1748736000000_baseline'
WHERE name = '0000_baseline';

UPDATE pgmigrations
SET name = '1748736000001_email_infrastructure'
WHERE name = '0001_email_infrastructure';

-- Verify
SELECT id, name, run_on FROM pgmigrations ORDER BY id;
