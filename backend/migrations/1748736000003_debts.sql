-- Up Migration
--
-- Debt tracker.
--
-- Single-table inheritance: one `debts` table with a type discriminator covers
-- everything from CCJs to personal IOUs. Type-specific fields are nullable;
-- a `metadata` JSONB escape hatch holds anything unexpected.
--
-- Supporting tables:
--   debt_payments      — individual payment records (one debt → many payments)
--   debt_plans         — payment arrangements (one debt → at most one active plan)
--   debt_interactions  — communications log (calls, letters, etc.) for evidence trail

CREATE TABLE IF NOT EXISTS debts (
    id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Direction: are we owing money out, or are they owing us?
    direction                TEXT NOT NULL CHECK (direction IN ('owed_by_me','owed_to_me')),

    -- Type of debt — drives priority defaults, UI grouping, and limitation rules
    debt_type                TEXT NOT NULL CHECK (debt_type IN (
        'mortgage','secured_loan','rent','council_tax','court_fine','child_maintenance',
        'tax','utility','tv_licence','credit_agreement','bnpl','default','ccj',
        'statutory_demand','enforcement','student_loan','personal','business','other'
    )),

    -- Priority framework (UK):
    --   critical  — loss of home / liberty consequences (mortgage, rent, council_tax, court_fine, child_maintenance)
    --   high      — essential services / serious enforcement (tax, utility, tv_licence)
    --   standard  — most consumer credit (credit_agreement, bnpl, ccj, default)
    --   low       — personal debts, statute-barred, etc.
    -- Auto-suggested from debt_type but user can override (this column is the override).
    priority_level           TEXT NOT NULL DEFAULT 'standard'
                             CHECK (priority_level IN ('critical','high','standard','low')),

    -- Status lifecycle
    status                   TEXT NOT NULL DEFAULT 'active' CHECK (status IN (
        'active','arrears','in_dispute','payment_plan','defaulted',
        'ccj_pending','ccj_active','ccj_satisfied',
        'enforcement','written_off','statute_barred','settled'
    )),

    -- Parties
    creditor_name            TEXT NOT NULL,
    creditor_type            TEXT CHECK (creditor_type IN (
        'mortgage_lender','landlord','council','utility_provider','hmrc',
        'court','bailiff','bank','credit_card','finance_company','dca',
        'mobile_network','isp','individual','business','government','other'
    )),
    original_creditor        TEXT,         -- if debt was sold to a DCA
    contact_phone            TEXT,
    contact_email            TEXT,
    contact_address          TEXT,

    -- References
    account_reference        TEXT,         -- your account number with them
    their_reference          TEXT,         -- their case reference for you

    -- Amounts
    original_amount          NUMERIC(12,2) NOT NULL,
    current_balance          NUMERIC(12,2) NOT NULL,
    currency                 TEXT NOT NULL DEFAULT 'GBP',
    interest_rate            NUMERIC(5,2),

    -- Dates that matter
    agreement_date           DATE,
    default_date             DATE,         -- starts the 6-year credit-file clock
    last_payment_date        DATE,         -- last payment we made — affects statute-barred
    last_acknowledgement_date DATE,        -- last time we admitted the debt in writing
    statute_barred_date      DATE,         -- when (if ever) it becomes unenforceable

    -- CCJ-specific
    ccj_case_number          TEXT,
    ccj_court                TEXT,
    ccj_judgement_date       DATE,
    ccj_judgement_amount     NUMERIC(12,2),
    ccj_satisfied_date       DATE,

    -- Secured debt-specific
    secured_against          TEXT,         -- e.g. "1 Example Street" for a mortgage

    -- Free-form
    notes                    TEXT,
    metadata                 JSONB DEFAULT '{}'::jsonb,
    is_archived              BOOLEAN NOT NULL DEFAULT FALSE,

    created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at               TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_debts_status        ON debts(status)        WHERE is_archived = FALSE;
CREATE INDEX IF NOT EXISTS idx_debts_priority      ON debts(priority_level) WHERE is_archived = FALSE;
CREATE INDEX IF NOT EXISTS idx_debts_direction     ON debts(direction)     WHERE is_archived = FALSE;
CREATE INDEX IF NOT EXISTS idx_debts_debt_type     ON debts(debt_type)     WHERE is_archived = FALSE;
CREATE INDEX IF NOT EXISTS idx_debts_default_date  ON debts(default_date)  WHERE default_date IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_debts_statute_date  ON debts(statute_barred_date) WHERE statute_barred_date IS NOT NULL;

-- Trigger to keep updated_at fresh
DROP TRIGGER IF EXISTS trg_debts_updated_at ON debts;
CREATE TRIGGER trg_debts_updated_at
    BEFORE UPDATE ON debts
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- ── Payment records ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS debt_payments (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    debt_id     UUID NOT NULL REFERENCES debts(id) ON DELETE CASCADE,
    amount      NUMERIC(12,2) NOT NULL,
    date        DATE NOT NULL,
    method      TEXT CHECK (method IN (
        'bank_transfer','standing_order','direct_debit','card','cash',
        'cheque','postal_order','online','other'
    )),
    reference   TEXT,
    notes       TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_debt_payments_debt_date ON debt_payments(debt_id, date DESC);

-- ── Payment plans ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS debt_plans (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    debt_id             UUID NOT NULL REFERENCES debts(id) ON DELETE CASCADE,
    frequency           TEXT NOT NULL CHECK (frequency IN (
        'weekly','fortnightly','four_weekly','monthly','quarterly','one_off'
    )),
    amount              NUMERIC(12,2) NOT NULL,
    start_date          DATE NOT NULL,
    end_date            DATE,                       -- NULL = open-ended until paid off
    next_due_date       DATE,                       -- recomputed when a payment lands or by cron
    agreement_reference TEXT,
    agreement_date      DATE,
    notes               TEXT,
    is_active           BOOLEAN NOT NULL DEFAULT TRUE,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Enforce at most one active plan per debt
CREATE UNIQUE INDEX IF NOT EXISTS idx_debt_plans_one_active
    ON debt_plans(debt_id) WHERE is_active = TRUE;

CREATE INDEX IF NOT EXISTS idx_debt_plans_next_due
    ON debt_plans(next_due_date) WHERE is_active = TRUE AND next_due_date IS NOT NULL;

-- ── Communications log ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS debt_interactions (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    debt_id     UUID NOT NULL REFERENCES debts(id) ON DELETE CASCADE,
    type        TEXT NOT NULL CHECK (type IN (
        'call_inbound','call_outbound','letter_sent','letter_received',
        'email_sent','email_received','sms_sent','sms_received',
        'payment','status_change','note','other'
    )),
    date        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    summary     TEXT NOT NULL,
    notes       TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_debt_interactions_debt_date
    ON debt_interactions(debt_id, date DESC);

-- Down Migration
DROP TABLE IF EXISTS debt_interactions;
DROP TABLE IF EXISTS debt_plans;
DROP TABLE IF EXISTS debt_payments;
DROP INDEX IF EXISTS idx_debts_statute_date;
DROP INDEX IF EXISTS idx_debts_default_date;
DROP INDEX IF EXISTS idx_debts_debt_type;
DROP INDEX IF EXISTS idx_debts_direction;
DROP INDEX IF EXISTS idx_debts_priority;
DROP INDEX IF EXISTS idx_debts_status;
DROP TABLE IF EXISTS debts;
