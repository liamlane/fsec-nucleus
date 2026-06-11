const express  = require('express');
const router   = express.Router();
const db       = require('../db/pool');
const mailer   = require('../utils/mailer');
const { generateInvoicePDF, generateQuotePDF } = require('../utils/pdf-generator');

const asyncHandler = fn => (req, res, next) =>
    Promise.resolve(fn(req, res, next)).catch(next);

const clip = (v, max = 500) => v == null ? v : String(v).slice(0, max);

/**
 * Generate a date-encoded random reference number.
 * Format: {prefix}-{YYMMDD}-{RR}  e.g. INV-260611-47, QTE-260611-83
 *
 * The date block is today. RR is a random 2-digit number (10-99).
 * Retries up to 10 times if a collision is found in the DB.
 */
async function generateDocNumber(prefix, table, column) {
    const now = new Date();
    const yy = String(now.getFullYear()).slice(2);
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const dd = String(now.getDate()).padStart(2, '0');
    const dateBlock = `${yy}${mm}${dd}`;

    for (let attempt = 0; attempt < 10; attempt++) {
        const rand = Math.floor(Math.random() * 90) + 10;  // 10-99
        const candidate = `${prefix}-${dateBlock}-${rand}`;
        const { rows } = await db.query(
            `SELECT 1 FROM ${table} WHERE ${column} = $1 LIMIT 1`,
            [candidate]
        );
        if (rows.length === 0) return candidate;
    }
    // Fallback: use seconds to guarantee uniqueness
    const sec = String(now.getSeconds()).padStart(2, '0');
    return `${prefix}-${dateBlock}-${sec}`;
}

// Load business profile from app_settings (used by PDFs and the profile editor)
async function getProfile() {
    const { rows } = await db.query(`SELECT value FROM app_settings WHERE key = 'business_profile'`);
    if (!rows[0]) return { name: 'Fast Lane Technology' };
    const val = rows[0].value;
    if (typeof val === 'string') {
        try { return JSON.parse(val); } catch { return { name: 'Fast Lane Technology' }; }
    }
    if (val && typeof val === 'object' && !Array.isArray(val)) return val;
    return { name: 'Fast Lane Technology' };
}

// ══════════════════════════════════════════════════════════════════════════
// BUSINESS PROFILE
// ══════════════════════════════════════════════════════════════════════════
router.get('/profile', asyncHandler(async (req, res) => {
    res.json(await getProfile());
}));

router.patch('/profile', asyncHandler(async (req, res) => {
    if (!req.body || typeof req.body !== 'object')
        return res.status(400).json({ error: 'body must be an object' });

    let current = await getProfile();
    if (!current || typeof current !== 'object' || Array.isArray(current)) current = {};
    const merged  = { ...current, ...req.body };

    for (const k of Object.keys(merged)) {
        if (typeof merged[k] === 'string') merged[k] = merged[k].slice(0, 2000);
    }

    await db.query(
        `INSERT INTO app_settings (key, value) VALUES ('business_profile', $1::jsonb)
         ON CONFLICT (key) DO UPDATE SET value = $1::jsonb`,
        [JSON.stringify(merged)]
    );
    res.json(merged);
}));

// ══════════════════════════════════════════════════════════════════════════
// SMTP CONFIGURATION & EMAIL TEMPLATES (Stage B.1)
// ══════════════════════════════════════════════════════════════════════════

router.get('/profile/smtp', asyncHandler(async (req, res) => {
    const cfg = await mailer.getSmtpConfig();
    if (!cfg) {
        return res.json({
            host: '', port: 587, secure: false,
            user: '', from_email: '', from_name: 'Fast Lane Technology',
            reply_to: '', allow_self_signed: false, has_password: false,
        });
    }
    const { pass, ...safe } = cfg;
    res.json({ ...safe, has_password: !!pass });
}));

router.patch('/profile/smtp', asyncHandler(async (req, res) => {
    if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body))
        return res.status(400).json({ error: 'body must be a JSON object' });

    const allowed = ['host','port','secure','user','pass','from_email','from_name','reply_to','allow_self_signed'];
    const updates = {};
    for (const k of allowed) { if (req.body[k] !== undefined) updates[k] = req.body[k]; }
    if (updates.pass === '' || updates.pass === undefined) delete updates.pass;

    let current = await mailer.getSmtpConfig();
    if (!current || typeof current !== 'object' || Array.isArray(current)) current = {};
    const merged = { ...current, ...updates };

    await db.query(
        `INSERT INTO app_settings (key, value) VALUES ('smtp_config', $1::jsonb)
         ON CONFLICT (key) DO UPDATE SET value = $1::jsonb`,
        [JSON.stringify(merged)]
    );

    const { pass, ...safe } = merged;
    res.json({ ...safe, has_password: !!pass });
}));

router.post('/profile/smtp-test', asyncHandler(async (req, res) => {
    const { to } = req.body;
    if (!to) return res.status(400).json({ error: 'recipient email (to) required' });

    try { await mailer.verifyConnection(); }
    catch (e) { return res.status(400).json({ error: 'SMTP connection failed: ' + e.message, stage: 'connection' }); }

    try {
        const result = await mailer.sendMail({
            to, subject: 'Nucleus SMTP test',
            text: `Test email from Nucleus.\n\nSent at: ${new Date().toISOString()}`,
            html: `<p>Test email from Nucleus.</p>`,
            related_type: 'smtp_test',
        });
        res.json({ ok: true, log_id: result.log_id, message: `Test sent to ${to}` });
    } catch (e) {
        res.status(500).json({ error: 'Send failed: ' + e.message, stage: 'send' });
    }
}));

router.get('/profile/email-templates', asyncHandler(async (req, res) => {
    res.json(await mailer.getTemplates());
}));

router.patch('/profile/email-templates', asyncHandler(async (req, res) => {
    if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body))
        return res.status(400).json({ error: 'body must be a JSON object' });

    let current = await mailer.getTemplates();
    if (!current || typeof current !== 'object' || Array.isArray(current)) current = {};
    const merged = { ...current };
    for (const [key, val] of Object.entries(req.body)) {
        if (val && typeof val === 'object' && !Array.isArray(val)) {
            merged[key] = { ...(merged[key] || {}), ...val };
        }
    }
    await db.query(
        `INSERT INTO app_settings (key, value) VALUES ('email_templates', $1::jsonb)
         ON CONFLICT (key) DO UPDATE SET value = $1::jsonb`,
        [JSON.stringify(merged)]
    );
    res.json(merged);
}));

// ══════════════════════════════════════════════════════════════════════════
// EMAIL LOG
// ══════════════════════════════════════════════════════════════════════════
router.get('/email-log', asyncHandler(async (req, res) => {
    const limit  = Math.min(parseInt(req.query.limit, 10) || 50, 200);
    const offset = parseInt(req.query.offset, 10) || 0;
    const { rows } = await db.query(
        `SELECT id, to_address, subject, status, error, related_type, related_id, sent_at
         FROM email_log ORDER BY sent_at DESC LIMIT $1 OFFSET $2`,
        [limit, offset]
    );
    res.json(rows);
}));

// ══════════════════════════════════════════════════════════════════════════
// EMAIL SEND HELPERS (Stage B.2)
// ══════════════════════════════════════════════════════════════════════════

function fmtCurrency(amount, symbol = '\u00a3') {
    const n = parseFloat(amount);
    if (isNaN(n)) return `${symbol}0.00`;
    return `${symbol}${n.toFixed(2)}`;
}
function fmtDate(d) {
    if (!d) return '';
    const dt = new Date(d);
    return dt.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
}
function daysOverdue(dueDate) {
    if (!dueDate) return 0;
    const ms = Date.now() - new Date(dueDate).getTime();
    return Math.max(0, Math.floor(ms / (24 * 60 * 60 * 1000)));
}

async function loadEmailContext(kind, id) {
    const profile = await getProfile() || {};
    let doc, client;
    if (kind === 'invoice') {
        const { rows } = await db.query(`SELECT * FROM business_invoices WHERE id=$1`, [id]);
        doc = rows[0];
    } else {
        const { rows } = await db.query(`SELECT * FROM business_quotes WHERE id=$1`, [id]);
        doc = rows[0];
    }
    if (!doc) return null;
    if (doc.client_id) {
        const { rows } = await db.query(`SELECT * FROM business_clients WHERE id=$1`, [doc.client_id]);
        client = rows[0];
    }
    return { doc, client, profile };
}

function buildTemplateVars({ doc, client, profile, kind, overrideDaysOverdue }) {
    const totalAmount = parseFloat(doc.amount || 0) + parseFloat(doc.vat_amount || 0);
    const vars = {
        client_name:  client?.contact_name || client?.name || client?.company || 'there',
        from_name:    profile.name || profile.business_name || 'Fast Lane Technology',
        amount:       fmtCurrency(totalAmount, profile.currency_symbol || '\u00a3'),
        due_date:     fmtDate(doc.due_date),
        valid_until:  fmtDate(doc.valid_until),
        days_overdue: overrideDaysOverdue ?? daysOverdue(doc.due_date),
    };
    if (kind === 'invoice') vars.invoice_number = doc.invoice_number;
    else                     vars.quote_number   = doc.quote_number;
    return vars;
}

async function sendBusinessEmail(opts) {
    const ctx = await loadEmailContext(opts.kind, opts.docId);
    if (!ctx) throw new Error(`${opts.kind} not found`);
    const { doc, client, profile } = ctx;

    const to = opts.toOverride || client?.email;
    if (!to) throw new Error(`No recipient email -- client has no email on file`);

    const templates = await mailer.getTemplates();
    const tpl = templates[opts.templateKey];
    if (!tpl && !opts.subjectOverride) throw new Error(`Template '${opts.templateKey}' not found and no override provided`);

    const vars = buildTemplateVars({ doc, client, profile, kind: opts.kind, overrideDaysOverdue: opts.overrideDaysOverdue });
    const subject = opts.subjectOverride || mailer.fillTemplate(tpl.subject, vars);
    const bodyText = opts.bodyOverride || mailer.fillTemplate(tpl.body, vars);

    const pdfBuffer = opts.kind === 'invoice'
        ? await generateInvoicePDF(doc, client, profile)
        : await generateQuotePDF(doc, client, profile);
    const docNum = opts.kind === 'invoice' ? doc.invoice_number : doc.quote_number;
    const filename = `${opts.kind === 'invoice' ? 'Invoice' : 'Quote'}_${docNum || doc.id.slice(0, 8)}.pdf`;

    const result = await mailer.sendMail({
        to, subject, text: bodyText,
        html: bodyText.replace(/\n/g, '<br>'),
        attachments: [{ filename, content: pdfBuffer, contentType: 'application/pdf' }],
        related_type: opts.kind, related_id: doc.id,
    });

    if (client) {
        const interactionType = opts.templateKey.startsWith('reminder')
            ? `Reminder email sent (${opts.templateKey})`
            : `${opts.kind === 'invoice' ? 'Invoice' : 'Quote'} ${docNum} sent`;
        await db.query(
            `INSERT INTO business_client_interactions (client_id, type, date, summary, notes)
             VALUES ($1, 'email', NOW(), $2, $3)`,
            [client.id, interactionType, `To: ${to}\nSubject: ${subject}`]
        ).catch(e => console.error('[send] interaction log failed:', e.message));
    }

    return { ok: true, log_id: result.log_id, to, subject };
}

// ══════════════════════════════════════════════════════════════════════════
// SEND INVOICE / QUOTE / REMINDER
// ══════════════════════════════════════════════════════════════════════════

router.post('/invoices/:id/send', asyncHandler(async (req, res) => {
    try {
        const result = await sendBusinessEmail({
            kind: 'invoice', docId: req.params.id, templateKey: 'invoice_send',
            toOverride: req.body.to, subjectOverride: req.body.subject, bodyOverride: req.body.body,
        });
        await db.query(`UPDATE business_invoices SET status='sent' WHERE id=$1 AND status='draft'`, [req.params.id]);
        res.json(result);
    } catch (e) { res.status(400).json({ error: e.message }); }
}));

router.post('/quotes/:id/send', asyncHandler(async (req, res) => {
    try {
        const result = await sendBusinessEmail({
            kind: 'quote', docId: req.params.id, templateKey: 'quote_send',
            toOverride: req.body.to, subjectOverride: req.body.subject, bodyOverride: req.body.body,
        });
        await db.query(`UPDATE business_quotes SET status='sent' WHERE id=$1 AND status='draft'`, [req.params.id]);
        res.json(result);
    } catch (e) { res.status(400).json({ error: e.message }); }
}));

router.post('/invoices/:id/send-reminder', asyncHandler(async (req, res) => {
    const { rows } = await db.query(`SELECT * FROM business_invoices WHERE id=$1`, [req.params.id]);
    const inv = rows[0];
    if (!inv) return res.status(404).json({ error: 'Invoice not found' });

    const days = daysOverdue(inv.due_date);
    let level = parseInt(req.body.level, 10);
    if (!level || level < 1 || level > 3) {
        if (days >= 30) level = 3; else if (days >= 14) level = 2; else level = 1;
    }

    try {
        const result = await sendBusinessEmail({
            kind: 'invoice', docId: req.params.id, templateKey: `reminder_${level}`,
            toOverride: req.body.to, subjectOverride: req.body.subject,
            bodyOverride: req.body.body, overrideDaysOverdue: days,
        });
        await db.query(`UPDATE business_invoices SET reminder_${level}_sent_at = NOW() WHERE id=$1`, [req.params.id]);
        res.json({ ...result, level, days_overdue: days });
    } catch (e) { res.status(400).json({ error: e.message }); }
}));

// ══════════════════════════════════════════════════════════════════════════
// DASHBOARD
// ══════════════════════════════════════════════════════════════════════════
router.get('/dashboard', asyncHandler(async (req, res) => {
    const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0];

    const [outstanding, mtdIncome, mtdExpenses, activeProjects, overdueCount, clientCounts, openQuotes, typeCounts] = await Promise.all([
        db.query(`SELECT COALESCE(SUM(amount + COALESCE(vat_amount, 0)), 0) AS total
                  FROM business_invoices WHERE status IN ('sent','overdue')`),
        db.query(`SELECT COALESCE(SUM(amount), 0) AS total
                  FROM business_invoices WHERE status = 'paid' AND paid_date >= $1`, [monthStart]),
        db.query(`SELECT COALESCE(SUM(amount), 0) AS total
                  FROM business_expenses WHERE date >= $1 AND claimable = true`, [monthStart]),
        db.query(`SELECT COUNT(*) AS count FROM business_projects WHERE status='active' AND is_deleted=false`),
        db.query(`SELECT COUNT(*) AS count FROM business_invoices WHERE status='sent' AND due_date < CURRENT_DATE`),
        db.query(`SELECT status, COUNT(*) AS count FROM business_clients WHERE is_deleted=false GROUP BY status`),
        db.query(`SELECT COALESCE(SUM(amount + COALESCE(vat_amount, 0)), 0) AS total, COUNT(*) AS count
                  FROM business_quotes WHERE status IN ('draft','sent')`),
        db.query(`SELECT client_type, COUNT(*) AS count FROM business_clients WHERE is_deleted=false GROUP BY client_type`),
    ]);

    res.json({
        outstanding_invoiced: parseFloat(outstanding.rows[0].total),
        mtd_income:           parseFloat(mtdIncome.rows[0].total),
        mtd_expenses:         parseFloat(mtdExpenses.rows[0].total),
        mtd_net:              parseFloat(mtdIncome.rows[0].total) - parseFloat(mtdExpenses.rows[0].total),
        active_projects:      parseInt(activeProjects.rows[0].count),
        overdue_invoices:     parseInt(overdueCount.rows[0].count),
        client_counts:        clientCounts.rows.reduce((a, r) => ({ ...a, [r.status]: parseInt(r.count) }), {}),
        type_counts:          typeCounts.rows.reduce((a, r) => ({ ...a, [r.client_type || 'commercial']: parseInt(r.count) }), {}),
        open_quotes_count:    parseInt(openQuotes.rows[0].count),
        open_quotes_value:    parseFloat(openQuotes.rows[0].total),
    });
}));

// ══════════════════════════════════════════════════════════════════════════
// CLIENTS
// ══════════════════════════════════════════════════════════════════════════
router.get('/clients', asyncHandler(async (req, res) => {
    const { status, client_type } = req.query;
    let q = `
        SELECT c.*,
            (SELECT COUNT(*) FROM business_projects p WHERE p.client_id=c.id AND p.is_deleted=false) AS project_count,
            (SELECT COALESCE(SUM(amount),0) FROM business_invoices i WHERE i.client_id=c.id AND i.status='paid') AS total_invoiced,
            (SELECT COALESCE(SUM(amount),0) FROM business_invoices i WHERE i.client_id=c.id AND i.status IN ('sent','overdue')) AS outstanding,
            (SELECT MAX(date) FROM business_client_interactions WHERE client_id = c.id) AS last_interaction,
            (SELECT COUNT(*) FROM business_client_interactions WHERE client_id = c.id) AS interaction_count
        FROM business_clients c
        WHERE c.is_deleted=false
    `;
    const params = [];
    let i = 1;
    if (status)      { q += ` AND c.status=$${i++}`;       params.push(status); }
    if (client_type) { q += ` AND c.client_type=$${i++}`;  params.push(client_type); }
    q += ' ORDER BY c.name';
    const { rows } = await db.query(q, params);
    res.json(rows);
}));

router.post('/clients', asyncHandler(async (req, res) => {
    const { name, company, email, phone, address, website, status, client_type, hourly_rate, notes, tags, colour } = req.body;
    if (!name) return res.status(400).json({ error: 'name is required' });
    const { rows } = await db.query(
        `INSERT INTO business_clients (name, company, email, phone, address, website, status, client_type, hourly_rate, notes, tags, colour)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *`,
        [clip(name), clip(company), clip(email), clip(phone), clip(address, 1000), clip(website),
         status || 'lead', client_type || 'commercial', hourly_rate || null, clip(notes, 5000), tags || [], colour || '#6366f1']
    );
    res.status(201).json(rows[0]);
}));

router.patch('/clients/:id', asyncHandler(async (req, res) => {
    const fields = ['name','company','email','phone','address','website','status','client_type','hourly_rate','notes','tags','colour'];
    const updates = fields.filter(f => req.body[f] !== undefined);
    if (!updates.length) return res.status(400).json({ error: 'No fields to update' });
    const sets = updates.map((f, i) => `${f}=$${i + 1}`).join(',');
    const { rows } = await db.query(
        `UPDATE business_clients SET ${sets}, updated_at=NOW() WHERE id=$${updates.length + 1} RETURNING *`,
        [...updates.map(f => req.body[f]), req.params.id]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Client not found' });
    res.json(rows[0]);
}));

router.delete('/clients/:id', asyncHandler(async (req, res) => {
    await db.query('UPDATE business_clients SET is_deleted=true WHERE id=$1', [req.params.id]);
    res.status(204).end();
}));

// Client interactions
router.get('/clients/:id/interactions', asyncHandler(async (req, res) => {
    const { rows } = await db.query('SELECT * FROM business_client_interactions WHERE client_id=$1 ORDER BY date DESC', [req.params.id]);
    res.json(rows);
}));
router.post('/clients/:id/interactions', asyncHandler(async (req, res) => {
    const { type, date, summary, notes } = req.body;
    if (!type || !summary) return res.status(400).json({ error: 'type and summary required' });
    const { rows } = await db.query(
        `INSERT INTO business_client_interactions (client_id, type, date, summary, notes) VALUES ($1,$2,$3,$4,$5) RETURNING *`,
        [req.params.id, type, date || new Date(), clip(summary, 500), clip(notes, 5000)]
    );
    res.status(201).json(rows[0]);
}));
router.patch('/interactions/:id', asyncHandler(async (req, res) => {
    const fields = ['type','date','summary','notes'];
    const updates = fields.filter(f => req.body[f] !== undefined);
    if (!updates.length) return res.status(400).json({ error: 'No fields to update' });
    const sets = updates.map((f, i) => `${f}=$${i + 1}`).join(',');
    const { rows } = await db.query(
        `UPDATE business_client_interactions SET ${sets} WHERE id=$${updates.length + 1} RETURNING *`,
        [...updates.map(f => req.body[f]), req.params.id]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Interaction not found' });
    res.json(rows[0]);
}));
router.delete('/interactions/:id', asyncHandler(async (req, res) => {
    await db.query('DELETE FROM business_client_interactions WHERE id=$1', [req.params.id]);
    res.status(204).end();
}));

// ══════════════════════════════════════════════════════════════════════════
// PROJECTS
// ══════════════════════════════════════════════════════════════════════════
router.get('/projects', asyncHandler(async (req, res) => {
    const { status, client_id } = req.query;
    let q = `
        SELECT p.*, c.name AS client_name, c.colour AS client_colour,
            (SELECT COALESCE(SUM(amount),0) FROM business_invoices i WHERE i.project_id=p.id AND i.status='paid') AS invoiced_paid,
            (SELECT COALESCE(SUM(amount),0) FROM business_expenses e WHERE e.project_id=p.id) AS expenses_total
        FROM business_projects p
        LEFT JOIN business_clients c ON c.id = p.client_id
        WHERE p.is_deleted=false
    `;
    const params = [];
    let i = 1;
    if (status)    { q += ` AND p.status=$${i++}`;    params.push(status); }
    if (client_id) { q += ` AND p.client_id=$${i++}`; params.push(client_id); }
    q += ' ORDER BY p.start_date DESC NULLS LAST, p.created_at DESC';
    const { rows } = await db.query(q, params);
    res.json(rows);
}));
router.post('/projects', asyncHandler(async (req, res) => {
    const { client_id, name, description, status, billing_type, value, start_date, end_date, notes } = req.body;
    if (!name) return res.status(400).json({ error: 'name is required' });
    const { rows } = await db.query(
        `INSERT INTO business_projects (client_id, name, description, status, billing_type, value, start_date, end_date, notes)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
        [client_id || null, clip(name), clip(description, 2000), status || 'active',
         billing_type || 'fixed', value || null, start_date || null, end_date || null, clip(notes, 5000)]
    );
    res.status(201).json(rows[0]);
}));
router.patch('/projects/:id', asyncHandler(async (req, res) => {
    const fields = ['client_id','name','description','status','billing_type','value','start_date','end_date','notes'];
    const updates = fields.filter(f => req.body[f] !== undefined);
    if (!updates.length) return res.status(400).json({ error: 'No fields to update' });
    const sets = updates.map((f, i) => `${f}=$${i + 1}`).join(',');
    const { rows } = await db.query(
        `UPDATE business_projects SET ${sets}, updated_at=NOW() WHERE id=$${updates.length + 1} RETURNING *`,
        [...updates.map(f => req.body[f]), req.params.id]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Project not found' });
    res.json(rows[0]);
}));
router.delete('/projects/:id', asyncHandler(async (req, res) => {
    await db.query('UPDATE business_projects SET is_deleted=true WHERE id=$1', [req.params.id]);
    res.status(204).end();
}));

// ══════════════════════════════════════════════════════════════════════════
// QUOTES
// ══════════════════════════════════════════════════════════════════════════
router.get('/quotes', asyncHandler(async (req, res) => {
    const { status, client_id } = req.query;
    await db.query(`UPDATE business_quotes SET status='expired'
                    WHERE status IN ('draft','sent') AND valid_until IS NOT NULL AND valid_until < CURRENT_DATE`);
    let q = `
        SELECT q.*, c.name AS client_name, c.colour AS client_colour, p.name AS project_name
        FROM business_quotes q
        LEFT JOIN business_clients  c ON c.id = q.client_id
        LEFT JOIN business_projects p ON p.id = q.project_id
        WHERE 1=1
    `;
    const params = [];
    let n = 1;
    if (status)    { q += ` AND q.status=$${n++}`;    params.push(status); }
    if (client_id) { q += ` AND q.client_id=$${n++}`; params.push(client_id); }
    q += ' ORDER BY q.issue_date DESC, q.created_at DESC';
    const { rows } = await db.query(q, params);
    res.json(rows);
}));
router.post('/quotes', asyncHandler(async (req, res) => {
    const { client_id, project_id, quote_number, issue_date, valid_until, amount, vat_amount, status, notes, line_items } = req.body;
    if (!quote_number || amount == null) return res.status(400).json({ error: 'quote_number and amount required' });
    const { rows } = await db.query(
        `INSERT INTO business_quotes (client_id, project_id, quote_number, issue_date, valid_until, amount, vat_amount, status, notes, line_items)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
        [client_id || null, project_id || null, quote_number,
         issue_date || new Date().toISOString().split('T')[0],
         valid_until || null, amount, vat_amount || 0, status || 'draft',
         clip(notes, 2000), line_items ? JSON.stringify(line_items) : null]
    );
    res.status(201).json(rows[0]);
}));
router.patch('/quotes/:id', asyncHandler(async (req, res) => {
    const fields = ['client_id','project_id','quote_number','issue_date','valid_until','amount','vat_amount','status','notes','line_items'];
    const updates = fields.filter(f => req.body[f] !== undefined);
    if (!updates.length) return res.status(400).json({ error: 'No fields to update' });
    const sets = updates.map((f, i) => `${f}=$${i + 1}`).join(',');
    const values = updates.map(f => f === 'line_items' && req.body[f] ? JSON.stringify(req.body[f]) : req.body[f]);
    const { rows } = await db.query(
        `UPDATE business_quotes SET ${sets}, updated_at=NOW() WHERE id=$${updates.length + 1} RETURNING *`,
        [...values, req.params.id]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Quote not found' });
    res.json(rows[0]);
}));
router.delete('/quotes/:id', asyncHandler(async (req, res) => {
    await db.query('DELETE FROM business_quotes WHERE id=$1', [req.params.id]);
    res.status(204).end();
}));

router.post('/quotes/:id/convert-to-invoice', asyncHandler(async (req, res) => {
    const client = await db.connect();
    try {
        await client.query('BEGIN');
        const { rows: qRows } = await client.query('SELECT * FROM business_quotes WHERE id=$1', [req.params.id]);
        if (!qRows[0]) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'Quote not found' }); }
        if (qRows[0].converted_to_invoice_id) {
            await client.query('ROLLBACK');
            return res.status(409).json({ error: 'Quote already converted', invoice_id: qRows[0].converted_to_invoice_id });
        }
        const quote = qRows[0];

        const newInvoiceNumber = await generateDocNumber('INV', 'business_invoices', 'invoice_number');

        const dueDays   = req.body.due_days != null ? parseInt(req.body.due_days) : 30;
        const issueDate = new Date().toISOString().split('T')[0];
        const dueDate   = new Date(Date.now() + dueDays * 86400000).toISOString().split('T')[0];

        const { rows: invRows } = await client.query(
            `INSERT INTO business_invoices (client_id, project_id, invoice_number, issue_date, due_date, amount, vat_amount, status, notes, line_items)
             VALUES ($1,$2,$3,$4,$5,$6,$7,'draft',$8,$9) RETURNING *`,
            [quote.client_id, quote.project_id, newInvoiceNumber, issueDate, dueDate,
             quote.amount, quote.vat_amount, quote.notes,
             quote.line_items ? JSON.stringify(quote.line_items) : null]
        );
        await client.query(
            'UPDATE business_quotes SET status=$1, converted_to_invoice_id=$2 WHERE id=$3',
            ['accepted', invRows[0].id, req.params.id]
        );
        await client.query('COMMIT');
        res.status(201).json({ invoice: invRows[0], quote_id: req.params.id });
    } catch (e) {
        await client.query('ROLLBACK');
        throw e;
    } finally {
        client.release();
    }
}));

router.get('/quotes/next-number', asyncHandler(async (req, res) => {
    const num = await generateDocNumber('QTE', 'business_quotes', 'quote_number');
    res.json({ suggested: num });
}));

// PDF generation for quotes
router.get('/quotes/:id/pdf', asyncHandler(async (req, res) => {
    const { rows } = await db.query('SELECT * FROM business_quotes WHERE id=$1', [req.params.id]);
    if (!rows[0]) return res.status(404).json({ error: 'Quote not found' });
    const quote = rows[0];
    let client = null;
    if (quote.client_id) {
        const { rows: cRows } = await db.query('SELECT * FROM business_clients WHERE id=$1', [quote.client_id]);
        client = cRows[0] || null;
    }
    const profile = await getProfile();
    const buffer = await generateQuotePDF(quote, client, profile);
    const disposition = req.query.download === 'true' ? 'attachment' : 'inline';
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `${disposition}; filename="Quote-${quote.quote_number}.pdf"`);
    res.send(buffer);
}));

// ══════════════════════════════════════════════════════════════════════════
// INVOICES
// ══════════════════════════════════════════════════════════════════════════
router.get('/invoices', asyncHandler(async (req, res) => {
    const { status, client_id } = req.query;
    await db.query(`UPDATE business_invoices SET status='overdue' WHERE status='sent' AND due_date < CURRENT_DATE`);
    let q = `
        SELECT i.*, c.name AS client_name, c.colour AS client_colour, p.name AS project_name
        FROM business_invoices i
        LEFT JOIN business_clients  c ON c.id = i.client_id
        LEFT JOIN business_projects p ON p.id = i.project_id
        WHERE 1=1
    `;
    const params = [];
    let n = 1;
    if (status)    { q += ` AND i.status=$${n++}`;    params.push(status); }
    if (client_id) { q += ` AND i.client_id=$${n++}`; params.push(client_id); }
    q += ' ORDER BY i.issue_date DESC, i.created_at DESC';
    const { rows } = await db.query(q, params);
    res.json(rows);
}));
router.post('/invoices', asyncHandler(async (req, res) => {
    const { client_id, project_id, invoice_number, issue_date, due_date, amount, vat_amount, status, notes, line_items } = req.body;
    if (!invoice_number || amount == null) return res.status(400).json({ error: 'invoice_number and amount required' });
    const { rows } = await db.query(
        `INSERT INTO business_invoices (client_id, project_id, invoice_number, issue_date, due_date, amount, vat_amount, status, notes, line_items)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
        [client_id || null, project_id || null, invoice_number,
         issue_date || new Date().toISOString().split('T')[0],
         due_date || null, amount, vat_amount || 0, status || 'draft',
         clip(notes, 2000), line_items ? JSON.stringify(line_items) : null]
    );
    res.status(201).json(rows[0]);
}));
router.patch('/invoices/:id', asyncHandler(async (req, res) => {
    const fields = ['client_id','project_id','invoice_number','issue_date','due_date','paid_date','amount','vat_amount','status','notes','line_items'];
    const updates = fields.filter(f => req.body[f] !== undefined);
    if (!updates.length) return res.status(400).json({ error: 'No fields to update' });
    const sets = updates.map((f, i) => `${f}=$${i + 1}`).join(',');
    const values = updates.map(f => f === 'line_items' && req.body[f] ? JSON.stringify(req.body[f]) : req.body[f]);
    const { rows } = await db.query(
        `UPDATE business_invoices SET ${sets}, updated_at=NOW() WHERE id=$${updates.length + 1} RETURNING *`,
        [...values, req.params.id]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Invoice not found' });
    res.json(rows[0]);
}));
router.post('/invoices/:id/mark-paid', asyncHandler(async (req, res) => {
    const paidDate = req.body.paid_date || new Date().toISOString().split('T')[0];
    const { rows } = await db.query(
        `UPDATE business_invoices SET status='paid', paid_date=$1, updated_at=NOW() WHERE id=$2 RETURNING *`,
        [paidDate, req.params.id]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Invoice not found' });
    res.json(rows[0]);
}));
router.delete('/invoices/:id', asyncHandler(async (req, res) => {
    await db.query('DELETE FROM business_invoices WHERE id=$1', [req.params.id]);
    res.status(204).end();
}));

router.get('/invoices/next-number', asyncHandler(async (req, res) => {
    const num = await generateDocNumber('INV', 'business_invoices', 'invoice_number');
    res.json({ suggested: num });
}));

// PDF generation for invoices
router.get('/invoices/:id/pdf', asyncHandler(async (req, res) => {
    const { rows } = await db.query('SELECT * FROM business_invoices WHERE id=$1', [req.params.id]);
    if (!rows[0]) return res.status(404).json({ error: 'Invoice not found' });
    const invoice = rows[0];
    let client = null;
    if (invoice.client_id) {
        const { rows: cRows } = await db.query('SELECT * FROM business_clients WHERE id=$1', [invoice.client_id]);
        client = cRows[0] || null;
    }
    const profile = await getProfile();
    const buffer = await generateInvoicePDF(invoice, client, profile);
    const disposition = req.query.download === 'true' ? 'attachment' : 'inline';
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `${disposition}; filename="Invoice-${invoice.invoice_number}.pdf"`);
    res.send(buffer);
}));

// ══════════════════════════════════════════════════════════════════════════
// EXPENSES
// ══════════════════════════════════════════════════════════════════════════
router.get('/expenses', asyncHandler(async (req, res) => {
    const { from, to, category, claimable } = req.query;
    let q = `
        SELECT e.*, c.name AS client_name, p.name AS project_name
        FROM business_expenses e
        LEFT JOIN business_clients  c ON c.id = e.client_id
        LEFT JOIN business_projects p ON p.id = e.project_id
        WHERE 1=1
    `;
    const params = [];
    let i = 1;
    if (from)              { q += ` AND e.date >= $${i++}`;     params.push(from); }
    if (to)                { q += ` AND e.date <= $${i++}`;     params.push(to); }
    if (category)          { q += ` AND e.category = $${i++}`;  params.push(category); }
    if (claimable != null) { q += ` AND e.claimable = $${i++}`; params.push(claimable === 'true'); }
    q += ' ORDER BY e.date DESC';
    const { rows } = await db.query(q, params);
    res.json(rows);
}));
router.post('/expenses', asyncHandler(async (req, res) => {
    const { date, description, category, amount, vat_amount, claimable, client_id, project_id, receipt_url, notes } = req.body;
    if (!description || amount == null) return res.status(400).json({ error: 'description and amount required' });
    const { rows } = await db.query(
        `INSERT INTO business_expenses (date, description, category, amount, vat_amount, claimable, client_id, project_id, receipt_url, notes)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
        [date || new Date().toISOString().split('T')[0],
         clip(description, 500), clip(category), amount, vat_amount || 0,
         claimable !== false, client_id || null, project_id || null,
         clip(receipt_url, 500), clip(notes, 2000)]
    );
    res.status(201).json(rows[0]);
}));
router.patch('/expenses/:id', asyncHandler(async (req, res) => {
    const fields = ['date','description','category','amount','vat_amount','claimable','client_id','project_id','receipt_url','notes'];
    const updates = fields.filter(f => req.body[f] !== undefined);
    if (!updates.length) return res.status(400).json({ error: 'No fields to update' });
    const sets = updates.map((f, i) => `${f}=$${i + 1}`).join(',');
    const { rows } = await db.query(
        `UPDATE business_expenses SET ${sets} WHERE id=$${updates.length + 1} RETURNING *`,
        [...updates.map(f => req.body[f]), req.params.id]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Expense not found' });
    res.json(rows[0]);
}));
router.delete('/expenses/:id', asyncHandler(async (req, res) => {
    await db.query('DELETE FROM business_expenses WHERE id=$1', [req.params.id]);
    res.status(204).end();
}));

module.exports = router;

// Exposed for the daily reminder cron job in index.js
module.exports._sendBusinessEmail = sendBusinessEmail;
module.exports._daysOverdue       = daysOverdue;
