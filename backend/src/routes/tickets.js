const express = require('express');
const router  = express.Router();
const db      = require('../db/pool');

const asyncHandler = fn => (req, res, next) =>
    Promise.resolve(fn(req, res, next)).catch(next);

const clip = (v, max = 500) => v == null ? v : String(v).slice(0, max);

// ── Ticket number generator (same pattern as invoices: TKT-YYMMDD-RR) ──
async function generateTicketNumber() {
    const now = new Date();
    const yy = String(now.getFullYear()).slice(2);
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const dd = String(now.getDate()).padStart(2, '0');
    const dateBlock = `${yy}${mm}${dd}`;

    for (let attempt = 0; attempt < 10; attempt++) {
        const rand = Math.floor(Math.random() * 90) + 10;
        const candidate = `TKT-${dateBlock}-${rand}`;
        const { rows } = await db.query(
            `SELECT 1 FROM tickets WHERE ticket_number = $1 LIMIT 1`, [candidate]
        );
        if (rows.length === 0) return candidate;
    }
    const sec = String(now.getSeconds()).padStart(2, '0');
    return `TKT-${dateBlock}-${sec}`;
}

// ── Enrich a ticket with computed fields ────────────────────────────────
async function enrichTicket(t) {
    const { rows: timeRows } = await db.query(
        `SELECT COALESCE(SUM(time_minutes), 0)::INT AS total_mins, COUNT(*) AS update_count
         FROM ticket_updates WHERE ticket_id = $1`, [t.id]
    );
    const totalMins = timeRows[0].total_mins;
    const now = new Date();
    const rate = parseFloat(t.hourly_rate || 0);

    return {
        ...t,
        total_time_minutes: totalMins,
        total_billable_amount: t.billable && rate > 0 ? parseFloat(((totalMins / 60) * rate).toFixed(2)) : null,
        update_count: parseInt(timeRows[0].update_count, 10),
        sla_response_breached: !!(t.response_due_at && !t.responded_at && new Date(t.response_due_at) < now),
        sla_resolution_breached: !!(t.resolution_due_at && !t.resolved_at && new Date(t.resolution_due_at) < now),
    };
}

// ══════════════════════════════════════════════════════════════════════════
// DASHBOARD
// ══════════════════════════════════════════════════════════════════════════
router.get('/dashboard', asyncHandler(async (req, res) => {
    const [openByPriority, openByStatus, openByCategory, slaBreach, recentUpdates, totals] = await Promise.all([
        db.query(`SELECT priority, COUNT(*)::INT AS count FROM tickets
                  WHERE status NOT IN ('closed','cancelled') GROUP BY priority`),
        db.query(`SELECT status, COUNT(*)::INT AS count FROM tickets
                  WHERE status NOT IN ('closed','cancelled') GROUP BY status`),
        db.query(`SELECT COALESCE(category, 'uncategorised') AS category, COUNT(*)::INT AS count FROM tickets
                  WHERE status NOT IN ('closed','cancelled') GROUP BY category ORDER BY count DESC LIMIT 10`),
        db.query(`SELECT t.id, t.ticket_number, t.title, t.priority, t.response_due_at, t.resolution_due_at,
                         c.name AS client_name
                  FROM tickets t
                  LEFT JOIN business_clients c ON c.id = t.client_id
                  WHERE t.status NOT IN ('closed','cancelled')
                    AND ((t.response_due_at IS NOT NULL AND t.responded_at IS NULL AND t.response_due_at < NOW())
                      OR (t.resolution_due_at IS NOT NULL AND t.resolved_at IS NULL AND t.resolution_due_at < NOW()))
                  ORDER BY LEAST(COALESCE(t.response_due_at, 'infinity'), COALESCE(t.resolution_due_at, 'infinity'))
                  LIMIT 10`),
        db.query(`SELECT u.ticket_id, u.type, u.content, u.time_minutes, u.created_at,
                         t.ticket_number, t.title
                  FROM ticket_updates u
                  JOIN tickets t ON t.id = u.ticket_id
                  ORDER BY u.created_at DESC LIMIT 15`),
        db.query(`SELECT
                    COUNT(*) FILTER (WHERE status NOT IN ('closed','cancelled'))::INT AS open,
                    COUNT(*) FILTER (WHERE status IN ('closed','cancelled'))::INT AS closed,
                    COUNT(*) FILTER (WHERE created_at >= CURRENT_DATE - INTERVAL '7 days')::INT AS created_7d,
                    COUNT(*) FILTER (WHERE status IN ('resolved','closed') AND resolved_at >= CURRENT_DATE - INTERVAL '7 days')::INT AS resolved_7d,
                    COALESCE(SUM(total_time_minutes) FILTER (WHERE status NOT IN ('closed','cancelled')), 0)::INT AS open_time_mins
                  FROM tickets`),
    ]);

    res.json({
        open_by_priority: openByPriority.rows.reduce((a, r) => ({ ...a, [r.priority]: r.count }), {}),
        open_by_status:   openByStatus.rows.reduce((a, r) => ({ ...a, [r.status]: r.count }), {}),
        open_by_category: openByCategory.rows,
        sla_breaches:     slaBreach.rows,
        recent_updates:   recentUpdates.rows,
        totals:           totals.rows[0],
    });
}));

// ══════════════════════════════════════════════════════════════════════════
// TICKETS — CRUD
// ══════════════════════════════════════════════════════════════════════════
router.get('/', asyncHandler(async (req, res) => {
    const { status, priority, category, ticket_type, client_id, billable, q } = req.query;
    let sql = `
        SELECT t.*, c.name AS client_name, c.colour AS client_colour,
               p.name AS project_name
        FROM tickets t
        LEFT JOIN business_clients  c ON c.id = t.client_id
        LEFT JOIN business_projects p ON p.id = t.project_id
        WHERE 1=1
    `;
    const params = [];
    let i = 1;
    // Default: hide closed/cancelled unless status explicitly requested
    if (status)    { sql += ` AND t.status = $${i++}`;    params.push(status); }
    else           { sql += ` AND t.status NOT IN ('closed','cancelled')`; }
    if (priority)    { sql += ` AND t.priority = $${i++}`;    params.push(priority); }
    if (category)    { sql += ` AND t.category = $${i++}`;    params.push(category); }
    if (ticket_type) { sql += ` AND t.ticket_type = $${i++}`; params.push(ticket_type); }
    if (client_id)   { sql += ` AND t.client_id = $${i++}`;   params.push(client_id); }
    if (billable === 'true')  sql += ` AND t.billable = TRUE`;
    if (billable === 'false') sql += ` AND t.billable = FALSE`;
    if (q) { sql += ` AND (t.title ILIKE $${i} OR t.ticket_number ILIKE $${i} OR t.description ILIKE $${i})`; params.push(`%${q}%`); i++; }

    sql += ` ORDER BY
        CASE t.priority WHEN 'critical' THEN 1 WHEN 'high' THEN 2 WHEN 'medium' THEN 3 ELSE 4 END,
        t.created_at DESC`;

    const { rows } = await db.query(sql, params);
    // Light enrichment for list view (avoid N+1 for full enrichment)
    const now = new Date();
    const enriched = rows.map(t => ({
        ...t,
        sla_response_breached: !!(t.response_due_at && !t.responded_at && new Date(t.response_due_at) < now),
        sla_resolution_breached: !!(t.resolution_due_at && !t.resolved_at && new Date(t.resolution_due_at) < now),
    }));
    res.json(enriched);
}));

router.get('/next-number', asyncHandler(async (req, res) => {
    const num = await generateTicketNumber();
    res.json({ suggested: num });
}));

router.get('/:id', asyncHandler(async (req, res) => {
    const { rows } = await db.query(`
        SELECT t.*, c.name AS client_name, c.colour AS client_colour, c.email AS client_email,
               p.name AS project_name
        FROM tickets t
        LEFT JOIN business_clients  c ON c.id = t.client_id
        LEFT JOIN business_projects p ON p.id = t.project_id
        WHERE t.id = $1
    `, [req.params.id]);
    if (!rows[0]) return res.status(404).json({ error: 'Ticket not found' });
    const enriched = await enrichTicket(rows[0]);
    res.json(enriched);
}));

const TICKET_FIELDS = [
    'client_id','project_id','title','description','status','priority',
    'category','ticket_type','reported_by','reported_email','reported_phone',
    'billable','hourly_rate','response_due_at','resolution_due_at',
    'responded_at','resolved_at','closed_at','notes','metadata','billed_to_invoice_id',
];

router.post('/', asyncHandler(async (req, res) => {
    const b = req.body || {};
    if (!b.title) return res.status(400).json({ error: 'title required' });

    const ticketNumber = b.ticket_number || await generateTicketNumber();

    // If client_id provided, pull default hourly_rate from client if not specified
    let hourlyRate = b.hourly_rate || null;
    if (b.client_id && !hourlyRate) {
        const { rows: cRows } = await db.query(
            `SELECT hourly_rate FROM business_clients WHERE id = $1`, [b.client_id]
        );
        if (cRows[0]?.hourly_rate) hourlyRate = cRows[0].hourly_rate;
    }

    const { rows } = await db.query(
        `INSERT INTO tickets (
            ticket_number, client_id, project_id,
            title, description, status, priority, category, ticket_type,
            reported_by, reported_email, reported_phone,
            billable, hourly_rate,
            response_due_at, resolution_due_at,
            notes, metadata
         ) VALUES (
            $1,$2,$3, $4,$5,$6,$7,$8,$9, $10,$11,$12, $13,$14, $15,$16, $17,$18::jsonb
         ) RETURNING *`,
        [
            ticketNumber, b.client_id || null, b.project_id || null,
            clip(b.title, 500), clip(b.description, 5000),
            b.status || 'new', b.priority || 'medium',
            b.category || null, b.ticket_type || 'incident',
            clip(b.reported_by), clip(b.reported_email), clip(b.reported_phone),
            b.billable !== false, hourlyRate,
            b.response_due_at || null, b.resolution_due_at || null,
            clip(b.notes, 5000), JSON.stringify(b.metadata || {}),
        ]
    );

    // Auto-log creation
    await db.query(
        `INSERT INTO ticket_updates (ticket_id, type, content)
         VALUES ($1, 'note', 'Ticket created')`,
        [rows[0].id]
    );

    const enriched = await enrichTicket(rows[0]);
    res.status(201).json(enriched);
}));

router.patch('/:id', asyncHandler(async (req, res) => {
    // Detect status change for auto-logging
    let oldStatus = null;
    if (req.body.status) {
        const { rows: cur } = await db.query(`SELECT status FROM tickets WHERE id=$1`, [req.params.id]);
        if (cur[0]) oldStatus = cur[0].status;
    }

    const updates = TICKET_FIELDS.filter(f => req.body[f] !== undefined);
    if (!updates.length) return res.status(400).json({ error: 'No fields to update' });

    const values = updates.map(f => {
        const v = req.body[f];
        if (f === 'metadata') return JSON.stringify(v || {});
        if (typeof v === 'string') return clip(v, 5000);
        return v;
    });
    const sets = updates.map((f, i) =>
        f === 'metadata' ? `${f}=$${i+1}::jsonb` : `${f}=$${i+1}`
    ).join(',');

    // Auto-set lifecycle timestamps
    let extra = '';
    if (req.body.status === 'resolved' && !req.body.resolved_at) extra += `, resolved_at = NOW()`;
    if (req.body.status === 'closed'   && !req.body.closed_at)   extra += `, closed_at = NOW()`;
    if (req.body.status === 'in_progress' && oldStatus === 'new' && !req.body.responded_at) extra += `, responded_at = NOW()`;
    if (req.body.status === 'triaged' && !req.body.responded_at) extra += `, responded_at = NOW()`;

    const { rows } = await db.query(
        `UPDATE tickets SET ${sets}${extra} WHERE id=$${updates.length+1} RETURNING *`,
        [...values, req.params.id]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Ticket not found' });

    // Log status change
    if (req.body.status && oldStatus && req.body.status !== oldStatus) {
        await db.query(
            `INSERT INTO ticket_updates (ticket_id, type, content, old_status, new_status)
             VALUES ($1, 'status_change', $2, $3, $4)`,
            [req.params.id, `Status changed from ${oldStatus} to ${req.body.status}`,
             oldStatus, req.body.status]
        );
    }

    const enriched = await enrichTicket(rows[0]);
    res.json(enriched);
}));

router.delete('/:id', asyncHandler(async (req, res) => {
    const { rowCount } = await db.query('DELETE FROM tickets WHERE id=$1', [req.params.id]);
    if (rowCount === 0) return res.status(404).json({ error: 'Ticket not found' });
    res.status(204).end();
}));

// ══════════════════════════════════════════════════════════════════════════
// TICKET UPDATES (activity log)
// ══════════════════════════════════════════════════════════════════════════
router.get('/:id/updates', asyncHandler(async (req, res) => {
    const { rows } = await db.query(
        `SELECT * FROM ticket_updates WHERE ticket_id=$1 ORDER BY created_at DESC`,
        [req.params.id]
    );
    res.json(rows);
}));

router.post('/:id/updates', asyncHandler(async (req, res) => {
    const b = req.body || {};
    if (!b.type || !b.content) return res.status(400).json({ error: 'type and content required' });

    const { rows } = await db.query(
        `INSERT INTO ticket_updates (ticket_id, type, content, time_minutes, is_internal, old_status, new_status)
         VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
        [req.params.id, b.type, clip(b.content, 5000),
         b.time_minutes || null, b.is_internal !== false,
         b.old_status || null, b.new_status || null]
    );

    // If it's a time entry, update the cached total on the ticket
    if (b.type === 'time_entry' && b.time_minutes) {
        await db.query(
            `UPDATE tickets SET total_time_minutes = (
                SELECT COALESCE(SUM(time_minutes), 0) FROM ticket_updates
                WHERE ticket_id = $1 AND type = 'time_entry'
             ) WHERE id = $1`,
            [req.params.id]
        );
    }

    res.status(201).json(rows[0]);
}));

router.delete('/:id/updates/:updateId', asyncHandler(async (req, res) => {
    const { rows } = await db.query(
        `DELETE FROM ticket_updates WHERE id=$1 AND ticket_id=$2 RETURNING type, time_minutes`,
        [req.params.updateId, req.params.id]
    );
    // Re-sync cached time if we deleted a time entry
    if (rows[0]?.type === 'time_entry') {
        await db.query(
            `UPDATE tickets SET total_time_minutes = (
                SELECT COALESCE(SUM(time_minutes), 0) FROM ticket_updates
                WHERE ticket_id = $1 AND type = 'time_entry'
             ) WHERE id = $1`,
            [req.params.id]
        );
    }
    res.status(204).end();
}));

// ══════════════════════════════════════════════════════════════════════════
// GENERATE INVOICE FROM TICKET
// ══════════════════════════════════════════════════════════════════════════
router.post('/:id/generate-invoice', asyncHandler(async (req, res) => {
    const { rows: tRows } = await db.query(`SELECT * FROM tickets WHERE id=$1`, [req.params.id]);
    const ticket = tRows[0];
    if (!ticket) return res.status(404).json({ error: 'Ticket not found' });
    if (ticket.billed_to_invoice_id) {
        return res.status(409).json({ error: 'Already billed', invoice_id: ticket.billed_to_invoice_id });
    }
    if (!ticket.client_id) {
        return res.status(400).json({ error: 'Ticket has no linked client — cannot generate invoice' });
    }

    // Sum billable time entries
    const { rows: timeRows } = await db.query(
        `SELECT COALESCE(SUM(time_minutes), 0)::INT AS total_mins
         FROM ticket_updates WHERE ticket_id = $1 AND type = 'time_entry'`,
        [ticket.id]
    );
    const totalMins = timeRows[0].total_mins;
    const hours = totalMins / 60;
    const rate = parseFloat(ticket.hourly_rate || req.body.hourly_rate || 0);

    if (rate <= 0) {
        return res.status(400).json({ error: 'No hourly rate set on ticket or provided in request body' });
    }

    const amount = parseFloat((hours * rate).toFixed(2));

    // Generate invoice number using the same pattern
    const { _generateDocNumber } = require('./business');
    let invoiceNumber;
    // Fallback if business.js doesn't export it — generate inline
    const now = new Date();
    const yy = String(now.getFullYear()).slice(2);
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const dd = String(now.getDate()).padStart(2, '0');
    for (let att = 0; att < 10; att++) {
        const rand = Math.floor(Math.random() * 90) + 10;
        const candidate = `INV-${yy}${mm}${dd}-${rand}`;
        const { rows: existing } = await db.query(
            `SELECT 1 FROM business_invoices WHERE invoice_number = $1 LIMIT 1`, [candidate]
        );
        if (existing.length === 0) { invoiceNumber = candidate; break; }
    }
    if (!invoiceNumber) invoiceNumber = `INV-${yy}${mm}${dd}-${now.getSeconds()}`;

    const issueDate = now.toISOString().split('T')[0];
    const dueDays = parseInt(req.body.due_days, 10) || 30;
    const dueDate = new Date(Date.now() + dueDays * 86400000).toISOString().split('T')[0];

    const lineItems = [{
        description: `${ticket.title} (${ticket.ticket_number}) — ${hours.toFixed(1)} hours @ ${rate}/hr`,
        quantity: parseFloat(hours.toFixed(2)),
        rate: rate,
        amount: amount,
    }];

    const { rows: invRows } = await db.query(
        `INSERT INTO business_invoices (client_id, project_id, invoice_number, issue_date, due_date, amount, vat_amount, status, notes, line_items)
         VALUES ($1,$2,$3,$4,$5,$6,0,'draft',$7,$8) RETURNING *`,
        [ticket.client_id, ticket.project_id, invoiceNumber, issueDate, dueDate,
         amount, `Generated from ticket ${ticket.ticket_number}`,
         JSON.stringify(lineItems)]
    );

    // Mark ticket as billed
    await db.query(
        `UPDATE tickets SET billed_to_invoice_id = $1 WHERE id = $2`,
        [invRows[0].id, ticket.id]
    );

    // Log it
    await db.query(
        `INSERT INTO ticket_updates (ticket_id, type, content)
         VALUES ($1, 'note', $2)`,
        [ticket.id, `Invoice ${invoiceNumber} generated: ${amount.toFixed(2)} for ${hours.toFixed(1)} hours`]
    );

    res.status(201).json({ invoice: invRows[0], ticket_number: ticket.ticket_number });
}));

module.exports = router;
