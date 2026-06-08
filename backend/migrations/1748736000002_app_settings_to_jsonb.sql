-- Up Migration
--
-- Fix app_settings.value column type.
--
-- The column was originally declared as TEXT (a historical accident — it
-- should have been JSONB from day one). The application code wrote JSON
-- strings into it, which worked but meant pg returned values as strings,
-- which the app then spread `{...value}` and produced numbered-key
-- corruption on subsequent writes.
--
-- This migration:
--   1. Coerces plain-string rows (currency, locale, etc.) into JSON strings
--      so they're valid JSON
--   2. Cleans up the known-corrupted business_profile row by resetting it
--      to a sane default (user re-enters real values via the Profile UI)
--   3. Alters the column type from TEXT to JSONB
--
-- Idempotent via DO blocks + IF EXISTS guards. Safe to re-run.

DO $$
DECLARE
    col_type TEXT;
BEGIN
    SELECT data_type INTO col_type
    FROM information_schema.columns
    WHERE table_name = 'app_settings' AND column_name = 'value';

    IF col_type = 'jsonb' THEN
        RAISE NOTICE 'app_settings.value already JSONB — skipping conversion';
        RETURN;
    END IF;

    RAISE NOTICE 'Converting app_settings.value from % to JSONB', col_type;

    -- Step 1: ensure every row contains valid JSON text.
    -- Plain-string values like 'GBP' or 'en-GB' aren't valid JSON;
    -- wrap them as quoted JSON strings.
    UPDATE app_settings
    SET value = to_jsonb(value)::text
    WHERE value !~ '^\s*[\[\{"]'   -- doesn't start with [, {, or "
       OR value = '';

    -- Step 2: clean known-corrupted business_profile row.
    -- The user can re-fill via the Business → Profile UI.
    UPDATE app_settings
    SET value = '{"name":"Fast Lane Technology","tagline":"","address":"","email":"","phone":"","website":"","vat_number":"","company_number":"","bank_name":"","bank_account_name":"","bank_sort_code":"","bank_account_number":"","bank_iban":"","payment_terms":"Payment due within 30 days of invoice date. Late payments may incur charges as per the Late Payment of Commercial Debts (Interest) Act 1998."}'
    WHERE key = 'business_profile'
      AND value ~ '"0":"'  -- only if it looks corrupted (has stringified-char keys)
    ;

    -- Step 3: convert column type. Any row that still fails will surface here.
    ALTER TABLE app_settings
        ALTER COLUMN value TYPE JSONB USING value::jsonb;

    RAISE NOTICE 'app_settings.value is now JSONB';
END $$;

-- Down Migration
--
-- Revert column to TEXT. Stored JSONB objects become their canonical text form.

DO $$
DECLARE
    col_type TEXT;
BEGIN
    SELECT data_type INTO col_type
    FROM information_schema.columns
    WHERE table_name = 'app_settings' AND column_name = 'value';

    IF col_type = 'text' THEN
        RAISE NOTICE 'app_settings.value already TEXT — skipping';
        RETURN;
    END IF;

    ALTER TABLE app_settings
        ALTER COLUMN value TYPE TEXT USING value::text;
END $$;
