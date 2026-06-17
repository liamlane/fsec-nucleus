-- Up Migration
--
-- IT Ticketing system for Fast Lane Technology.
--
-- tickets          — job/issue records, linked to business_clients and business_projects
-- ticket_updates   — chronological activity log (notes, status changes, time entries)

CREATE TABLE IF NOT EXISTS tickets (
    id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Linking to existing business data
    client_id            UUID REFERENCES business_clients(id) ON DELETE SET NULL,
    project_id           UUID REFERENCES business_projects(id) ON DELETE SET NULL,
    billed_to_invoice_id UUID REFERENCES business_invoices(id) ON DELETE SET NULL,

    -- Identification
    ticket_number        TEXT NOT NULL UNIQUE,

    -- Core fields
    title                TEXT NOT NULL,
    description          TEXT,

    status               TEXT NOT NULL DEFAULT 'new' CHECK (status IN (
        'new','triaged','in_progress','waiting_client','waiting_third_party',
        'resolved','closed','cancelled'
    )),
    priority             TEXT NOT NULL DEFAULT 'medium' CHECK (priority IN (
        'critical','high','medium','low'
    )),
    category             TEXT CHECK (category IN (
        'network','server','desktop','cloud','security','email',
        'backup','hardware','software','access','telephony','printing','other'
    )),
    ticket_type          TEXT NOT NULL DEFAULT 'incident' CHECK (ticket_type IN (
        'incident','service_request','change','problem'
    )),

    -- Reporter (may differ from the client's main contact)
    reported_by          TEXT,
    reported_email       TEXT,
    reported_phone       TEXT,

    -- Billing
    billable             BOOLEAN NOT NULL DEFAULT TRUE,
    hourly_rate          NUMERIC(8,2),

    -- SLA tracking (optional — fill in when client has an SLA)
    response_due_at      TIMESTAMPTZ,
    resolution_due_at    TIMESTAMPTZ,

    -- Lifecycle timestamps
    responded_at         TIMESTAMPTZ,
    resolved_at          TIMESTAMPTZ,
    closed_at            TIMESTAMPTZ,

    -- Aggregated time (updated by trigger or application code when time entries are added)
    total_time_minutes   INT NOT NULL DEFAULT 0,

    -- Free-form
    notes                TEXT,
    metadata             JSONB DEFAULT '{}'::jsonb,

    created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tickets_status     ON tickets(status)   WHERE status NOT IN ('closed','cancelled');
CREATE INDEX IF NOT EXISTS idx_tickets_priority   ON tickets(priority) WHERE status NOT IN ('closed','cancelled');
CREATE INDEX IF NOT EXISTS idx_tickets_client     ON tickets(client_id) WHERE client_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_tickets_project    ON tickets(project_id) WHERE project_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_tickets_created    ON tickets(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_tickets_sla_resp   ON tickets(response_due_at) WHERE response_due_at IS NOT NULL AND responded_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_tickets_sla_resol  ON tickets(resolution_due_at) WHERE resolution_due_at IS NOT NULL AND resolved_at IS NULL;

-- updated_at trigger
DROP TRIGGER IF EXISTS trg_tickets_updated_at ON tickets;
CREATE TRIGGER trg_tickets_updated_at
    BEFORE UPDATE ON tickets
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- ── Activity log ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ticket_updates (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ticket_id       UUID NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,

    type            TEXT NOT NULL CHECK (type IN (
        'note','status_change','time_entry','email','escalation','resolution'
    )),
    content         TEXT NOT NULL,

    -- For time_entry type
    time_minutes    INT,

    -- For status_change type
    old_status      TEXT,
    new_status      TEXT,

    -- Visibility (for future client portal — internal notes vs client-visible)
    is_internal     BOOLEAN NOT NULL DEFAULT TRUE,

    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ticket_updates_ticket ON ticket_updates(ticket_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ticket_updates_time   ON ticket_updates(ticket_id) WHERE type = 'time_entry';

-- Down Migration
DROP TABLE IF EXISTS ticket_updates;
DROP TABLE IF EXISTS tickets;
