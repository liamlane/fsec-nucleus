-- Up Migration
--
-- Stage B.1: email infrastructure
--   - email_log: every send tracked, success or failure
--   - reminder columns on business_invoices: track which dunning reminders sent
--   - smtp_config + email_templates in app_settings: editable from the Business → Profile UI

CREATE TABLE IF NOT EXISTS email_log (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    to_address    TEXT NOT NULL,
    cc_address    TEXT,
    bcc_address   TEXT,
    subject       TEXT NOT NULL,
    body          TEXT,
    attachments   TEXT[],
    related_type  TEXT,
    related_id    UUID,
    status        TEXT NOT NULL CHECK (status IN ('sent','failed')),
    error         TEXT,
    sent_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_email_log_sent_at      ON email_log(sent_at DESC);
CREATE INDEX IF NOT EXISTS idx_email_log_related      ON email_log(related_type, related_id);
CREATE INDEX IF NOT EXISTS idx_email_log_status       ON email_log(status) WHERE status = 'failed';

ALTER TABLE business_invoices ADD COLUMN IF NOT EXISTS reminder_1_sent_at TIMESTAMPTZ;
ALTER TABLE business_invoices ADD COLUMN IF NOT EXISTS reminder_2_sent_at TIMESTAMPTZ;
ALTER TABLE business_invoices ADD COLUMN IF NOT EXISTS reminder_3_sent_at TIMESTAMPTZ;

-- SMTP credentials (empty defaults — user fills in via Business → Profile)
INSERT INTO app_settings (key, value) VALUES (
    'smtp_config',
    '{"host":"","port":587,"secure":false,"user":"","pass":"","from_email":"","from_name":"Fast Lane Technology","reply_to":"","allow_self_signed":false}'::jsonb
) ON CONFLICT (key) DO NOTHING;

-- Email templates — defaults are professional but personable. User can edit per-template.
-- Placeholders: {client_name}, {invoice_number}, {quote_number}, {amount}, {due_date}, {valid_until}, {days_overdue}, {from_name}
INSERT INTO app_settings (key, value) VALUES (
    'email_templates',
    $TEMPLATES${
      "invoice_send": {
        "subject": "Invoice {invoice_number} from {from_name}",
        "body": "Hi {client_name},\n\nPlease find attached invoice {invoice_number} for {amount}, due on {due_date}.\n\nBank details and payment terms are on the invoice.\n\nAny questions, just reply.\n\nMany thanks,\nLiam"
      },
      "quote_send": {
        "subject": "Quote {quote_number} from {from_name}",
        "body": "Hi {client_name},\n\nPlease find attached quote {quote_number} for the work we discussed. The quote is valid until {valid_until}.\n\nHappy to chat through any questions before you decide.\n\nMany thanks,\nLiam"
      },
      "reminder_1": {
        "subject": "Friendly reminder: invoice {invoice_number}",
        "body": "Hi {client_name},\n\nJust a quick reminder that invoice {invoice_number} for {amount} was due on {due_date} and is now {days_overdue} days overdue.\n\nIf you've paid in the last day or two, please ignore this — our system is just catching up. Otherwise, the bank details are on the invoice (re-attached for convenience).\n\nMany thanks,\nLiam"
      },
      "reminder_2": {
        "subject": "Outstanding invoice: {invoice_number}",
        "body": "Hi {client_name},\n\nInvoice {invoice_number} for {amount} remains outstanding — it's now {days_overdue} days past due.\n\nCould you let me know when payment is expected, or if there's anything I can help with to resolve it?\n\nThe invoice is attached for reference.\n\nMany thanks,\nLiam"
      },
      "reminder_3": {
        "subject": "Final reminder: invoice {invoice_number}",
        "body": "Hi {client_name},\n\nInvoice {invoice_number} for {amount} is now {days_overdue} days overdue and I haven't yet heard from you.\n\nCould you please confirm when this will be paid? If there's a dispute or issue with the invoice, please let me know so we can resolve it.\n\nIf I don't hear back, I'll need to escalate the matter under the Late Payment of Commercial Debts (Interest) Act 1998.\n\nMany thanks,\nLiam"
      }
    }$TEMPLATES$::jsonb
) ON CONFLICT (key) DO NOTHING;

-- Down Migration
DELETE FROM app_settings WHERE key IN ('smtp_config','email_templates');
ALTER TABLE business_invoices DROP COLUMN IF EXISTS reminder_3_sent_at;
ALTER TABLE business_invoices DROP COLUMN IF EXISTS reminder_2_sent_at;
ALTER TABLE business_invoices DROP COLUMN IF EXISTS reminder_1_sent_at;
DROP TABLE IF EXISTS email_log;
