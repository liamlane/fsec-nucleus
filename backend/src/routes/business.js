const express = require('express');
const router  = express.Router();
const db      = require('../db/pool');

const asyncHandler = fn => (req, res, next) =>
    Promise.resolve(fn(req, res, next)).catch(next);

const clip = (v, max = 500) => v == null ? v : String(v).slice(0, max);

// ══════════════════════════════════════════════════════════════════════════
// DASHBOARD
// ══════════════════════════════════════════════════════════════════════════
router.get('/dashboard', asyncHandler(async (req, res) => {
    const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0];

    const [outstanding, mtdIncome, mtdExpenses, activeProjects, overdueCount, clientCounts, openQuotes] = await Promise.all([
        db.query(`SELECT COALESCE(SUM(amount + COALESCE(vat_amount, 0)), 0) AS total
                  FROM business_invoices WHERE status IN ('sent','overdue')`),
        db.query(`SELECT COALESCE(SUM(amount), 0) AS total
                  FROM business_invoices WHERE status = 'paid' AND paid_date >= $1`, [monthStart]),
        db.query(`SELECT COALESCE(SUM(amount), 0) AS total
                  FROM business_expenses WHERE date >= $1 AND claimable = true`, [monthStart]),
        db.query(`SELECT COUNT(*) AS count FROM business_projects WHERE status='active' AND is_deleted=false`),
        db.query(`SELECT COUNT(*) AS count FROM business_invoices
                  WHERE status='sent' AND due_date < CURRENT_DATE`),
        db.query(`SELECT status, COUNT(*) AS count FROM business_clients
                  WHERE is_deleted=false GROUP BY status`),
        db.query(`SELECT COALESCE(SUM(amount + COALESCE(vat_amount, 0)), 0) AS total, COUNT(*) AS count
                  FROM business_quotes WHERE status IN ('draft','sent')`),
    ]);

    res.json({
        outstanding_invoiced: parseFloat(outstanding.rows[0].total),
        mtd_income:           parseFloat(mtdIncome.rows[0].total),
        mtd_expenses:         parseFloat(mtdExpenses.rows[0].total),
        mtd_net:              parseFloat(mtdIncome.rows[0].total) - parseFloat(mtdExpenses.rows[0].total),
        active_projects:      parseInt(activeProjects.rows[0].count),
        overdue_invoices:     parseInt(overdueCount.rows[0].count),
        client_counts:        clientCounts.rows.reduce((a, r) => ({ ...a, [r.status]: parseInt(r.count) }), {}),
        open_quotes_count:    parseInt(openQuotes.rows[0].count),
        open_quotes_value:    parseFloat(openQuotes.rows[0].total),
    });
}));

// ══════════════════════════════════════════════════════════════════════════
// CLIENTS
// ══════════════════════════════════════════════════════════════════════════
router.get('/clients', asyncHandler(async (req, res) => {
    const { status } = req.query;
    let q = `
        SELECT c.*,
            (SELECT COUNT(*) FROM business_projects p WHERE p.client_id=c.id AND p.is_deleted=false) AS project_count,
            (SELECT COALESCE(SUM(amount),0) FROM business_invoices i WHERE i.client_id=c.id AND i.status='paid') AS total_invoiced,
            (SELECT COALESCE(SUM(amount),0) FROM business_invoices i WHERE i.client_id=c.id AND i.status IN ('sent','overdue')) AS outstanding
        FROM business_clients c
        WHERE c.is_deleted=false
    `;
    const params = [];
    if (status) { q += ' AND c.status=$1'; params.push(status); }
    q += ' ORDER BY c.name';
    const { rows } = await db.query(q, params);
    res.json(rows);
}));

router.post('/clients', asyncHandler(async (req, res) => {
    const { name, company, email, phone, address, website, status, hourly_rate, notes, tags, colour } = req.body;
    if (!name) return res.status(400).json({ error: 'name is required' });
    const { rows } = await db.query(
        `INSERT INTO business_clients (name, company, email, phone, address, website, status, hourly_rate, notes, tags, colour)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
        [clip(name), clip(company), clip(email), clip(phone), clip(address, 1000), clip(website),
         status || 'lead', hourly_rate || null, clip(notes, 5000), tags || [], colour || '#6366f1']
    );
    res.status(201).json(rows[0]);
}));

router.patch('/clients/:id', asyncHandler(async (req, res) => {
    const fields = ['name','company','email','phone','address','website','status','hourly_rate','notes','tags','colour'];
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

    // Auto-expire quotes past their valid_until date
    await db.query(`
        UPDATE business_quotes SET status='expired'
        WHERE status IN ('draft','sent') AND valid_until IS NOT NULL AND valid_until < CURRENT_DATE
    `);

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
    if (!quote_number || !amount) return res.status(400).json({ error: 'quote_number and amount required' });
    const { rows } = await db.query(
        `INSERT INTO business_quotes (client_id, project_id, quote_number, issue_date, valid_until, amount, vat_amount, status, notes, line_items)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
        [client_id || null, project_id || null, quote_number,
         issue_date || new Date().toISOString().split('T')[0],
         valid_until || null, amount, vat_amount || 0, status || 'draft',
         clip(notes, 2000), line_items || null]
    );
    res.status(201).json(rows[0]);
}));

router.patch('/quotes/:id', asyncHandler(async (req, res) => {
    const fields = ['client_id','project_id','quote_number','issue_date','valid_until','amount','vat_amount','status','notes','line_items'];
    const updates = fields.filter(f => req.body[f] !== undefined);
    if (!updates.length) return res.status(400).json({ error: 'No fields to update' });
    const sets = updates.map((f, i) => `${f}=$${i + 1}`).join(',');
    const { rows } = await db.query(
        `UPDATE business_quotes SET ${sets}, updated_at=NOW() WHERE id=$${updates.length + 1} RETURNING *`,
        [...updates.map(f => req.body[f]), req.params.id]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Quote not found' });
    res.json(rows[0]);
}));

router.delete('/quotes/:id', asyncHandler(async (req, res) => {
    await db.query('DELETE FROM business_quotes WHERE id=$1', [req.params.id]);
    res.status(204).end();
}));

// Convert accepted quote to invoice — atomic
router.post('/quotes/:id/convert-to-invoice', asyncHandler(async (req, res) => {
    const client = await db.connect();
    try {
        await client.query('BEGIN');

        const { rows: qRows } = await client.query(
            'SELECT * FROM business_quotes WHERE id=$1', [req.params.id]
        );
        if (!qRows[0]) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'Quote not found' }); }
        if (qRows[0].converted_to_invoice_id) {
            await client.query('ROLLBACK');
            return res.status(409).json({ error: 'Quote already converted', invoice_id: qRows[0].converted_to_invoice_id });
        }
        const quote = qRows[0];

        // Suggest invoice number for current year
        const year = new Date().getFullYear();
        const prefix = `${year}-`;
        const { rows: lastInv } = await client.query(
            `SELECT invoice_number FROM business_invoices WHERE invoice_number LIKE $1 ORDER BY invoice_number DESC LIMIT 1`,
            [`${prefix}%`]
        );
        let next = 1;
        if (lastInv[0]) next = (parseInt(lastInv[0].invoice_number.split('-').pop()) || 0) + 1;
        const newInvoiceNumber = `${prefix}${String(next).padStart(4, '0')}`;

        const dueDays = req.body.due_days != null ? parseInt(req.body.due_days) : 30;
        const issueDate = new Date().toISOString().split('T')[0];
        const dueDate = new Date(Date.now() + dueDays * 86400000).toISOString().split('T')[0];

        const { rows: invRows } = await client.query(
            `INSERT INTO business_invoices (client_id, project_id, invoice_number, issue_date, due_date, amount, vat_amount, status, notes, line_items)
             VALUES ($1,$2,$3,$4,$5,$6,$7,'draft',$8,$9) RETURNING *`,
            [quote.client_id, quote.project_id, newInvoiceNumber, issueDate, dueDate,
             quote.amount, quote.vat_amount, quote.notes, quote.line_items]
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
    const year = new Date().getFullYear();
    const prefix = `Q${year}-`;
    const { rows } = await db.query(
        `SELECT quote_number FROM business_quotes WHERE quote_number LIKE $1 ORDER BY quote_number DESC LIMIT 1`,
        [`${prefix}%`]
    );
    let next = 1;
    if (rows[0]) next = (parseInt(rows[0].quote_number.split('-').pop()) || 0) + 1;
    res.json({ suggested: `${prefix}${String(next).padStart(4, '0')}` });
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
    if (!invoice_number || !amount) return res.status(400).json({ error: 'invoice_number and amount required' });
    const { rows } = await db.query(
        `INSERT INTO business_invoices (client_id, project_id, invoice_number, issue_date, due_date, amount, vat_amount, status, notes, line_items)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
        [client_id || null, project_id || null, invoice_number,
         issue_date || new Date().toISOString().split('T')[0],
         due_date || null, amount, vat_amount || 0, status || 'draft',
         clip(notes, 2000), line_items || null]
    );
    res.status(201).json(rows[0]);
}));

router.patch('/invoices/:id', asyncHandler(async (req, res) => {
    const fields = ['client_id','project_id','invoice_number','issue_date','due_date','paid_date','amount','vat_amount','status','notes','line_items'];
    const updates = fields.filter(f => req.body[f] !== undefined);
    if (!updates.length) return res.status(400).json({ error: 'No fields to update' });
    const sets = updates.map((f, i) => `${f}=$${i + 1}`).join(',');
    const { rows } = await db.query(
        `UPDATE business_invoices SET ${sets}, updated_at=NOW() WHERE id=$${updates.length + 1} RETURNING *`,
        [...updates.map(f => req.body[f]), req.params.id]
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
    const year = new Date().getFullYear();
    const prefix = `${year}-`;
    const { rows } = await db.query(
        `SELECT invoice_number FROM business_invoices WHERE invoice_number LIKE $1 ORDER BY invoice_number DESC LIMIT 1`,
        [`${prefix}%`]
    );
    let next = 1;
    if (rows[0]) next = (parseInt(rows[0].invoice_number.split('-').pop()) || 0) + 1;
    res.json({ suggested: `${prefix}${String(next).padStart(4, '0')}` });
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
    if (!description || !amount) return res.status(400).json({ error: 'description and amount required' });
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
