const express = require('express');
const router = express.Router();
const db = require('../db/pool');
const cron = require('node-cron');

// ── Utility ───────────────────────────────────────────────────────────────
const asyncHandler = fn => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);

function advanceDate(dateStr, interval) {
  const d = new Date(dateStr);
  switch (interval) {
    case 'daily':   d.setDate(d.getDate() + 1);       break;
    case 'weekly':  d.setDate(d.getDate() + 7);        break;
    case 'yearly':  d.setFullYear(d.getFullYear() + 1); break;
    default:        d.setMonth(d.getMonth() + 1);       break; // monthly
  }
  return d.toISOString().split('T')[0];
}

// ── Recurring processor ───────────────────────────────────────────────────
async function processRecurring() {
  const today = new Date().toISOString().split('T')[0];
  let due;
  try {
    const result = await db.query(
      `SELECT * FROM transactions
       WHERE recurring = true AND next_due IS NOT NULL AND next_due <= $1`,
      [today]
    );
    due = result.rows;
  } catch (e) {
    console.error('processRecurring: failed to fetch due transactions:', e.message);
    return;
  }

  if (!due.length) return;

  for (const txn of due) {
    const client = await db.connect();
    try {
      await client.query('BEGIN');

      await client.query(
        `INSERT INTO transactions
           (account_id, category_id, payee_id, amount, type, description,
            merchant, date, tags, notes)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
        [
          txn.account_id, txn.category_id, txn.payee_id, txn.amount,
          txn.type, txn.description, txn.merchant, today,
          txn.tags, txn.notes,
        ]
      );

      if (txn.type === 'income')
        await client.query(
          'UPDATE accounts SET balance = balance + $1 WHERE id=$2',
          [txn.amount, txn.account_id]
        );
      if (txn.type === 'expense')
        await client.query(
          'UPDATE accounts SET balance = balance - $1 WHERE id=$2',
          [txn.amount, txn.account_id]
        );

      const nextDue = advanceDate(txn.next_due, txn.recurring_interval);
      await client.query(
        'UPDATE transactions SET next_due=$1 WHERE id=$2',
        [nextDue, txn.id]
      );

      await client.query('COMMIT');
    } catch (e) {
      await client.query('ROLLBACK');
      console.error(`processRecurring: rollback on txn ${txn.id}:`, e.message);
    } finally {
      client.release();
    }
  }

  console.log(`processRecurring: processed ${due.length} transaction(s) for ${today}`);
}

// Run on startup and daily at 00:05
processRecurring();
cron.schedule('5 0 * * *', processRecurring);

// ── Payees ────────────────────────────────────────────────────────────────
router.get('/payees', asyncHandler(async (req, res) => {
  const { rows } = await db.query(`
    SELECT p.*,
      COALESCE((
        SELECT SUM(t.amount) FROM transactions t
        WHERE t.payee_id = p.id AND t.type = 'expense'
      ), 0) AS total_spent,
      (SELECT COUNT(*) FROM transactions t WHERE t.payee_id = p.id) AS transaction_count
    FROM payees p
    ORDER BY p.name
  `);
  res.json(rows);
}));

router.post('/payees', asyncHandler(async (req, res) => {
  const { name, type, notes, colour } = req.body;
  if (!name) return res.status(400).json({ error: 'name is required' });
  const { rows } = await db.query(
    'INSERT INTO payees (name,type,notes,colour) VALUES ($1,$2,$3,$4) RETURNING *',
    [name, type || 'person', notes || null, colour || '#6366f1']
  );
  res.status(201).json(rows[0]);
}));

router.patch('/payees/:id', asyncHandler(async (req, res) => {
  const fields = ['name', 'type', 'notes', 'colour'];
  const updates = fields.filter(f => req.body[f] !== undefined);
  if (!updates.length) return res.status(400).json({ error: 'No fields to update' });
  const sets = updates.map((f, i) => `${f}=$${i + 1}`).join(',');
  const { rows } = await db.query(
    `UPDATE payees SET ${sets} WHERE id=$${updates.length + 1} RETURNING *`,
    [...updates.map(f => req.body[f]), req.params.id]
  );
  if (!rows[0]) return res.status(404).json({ error: 'Payee not found' });
  res.json(rows[0]);
}));

router.delete('/payees/:id', asyncHandler(async (req, res) => {
  await db.query('DELETE FROM payees WHERE id=$1', [req.params.id]);
  res.status(204).end();
}));

// ── Accounts ──────────────────────────────────────────────────────────────
router.get('/accounts', asyncHandler(async (req, res) => {
  const { rows } = await db.query('SELECT * FROM accounts ORDER BY created_at');
  res.json(rows);
}));

router.post('/accounts', asyncHandler(async (req, res) => {
  const { name, type, balance, currency, colour, icon } = req.body;
  if (!name || !type) return res.status(400).json({ error: 'name and type are required' });
  const { rows } = await db.query(
    'INSERT INTO accounts (name,type,balance,currency,colour,icon) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *',
    [name, type, balance || 0, currency || 'GBP', colour || '#6366f1', icon || 'bank']
  );
  res.status(201).json(rows[0]);
}));

router.patch('/accounts/:id', asyncHandler(async (req, res) => {
  const fields = ['name', 'type', 'balance', 'currency', 'colour', 'icon'];
  const updates = fields.filter(f => req.body[f] !== undefined);
  if (!updates.length) return res.status(400).json({ error: 'No fields to update' });
  const sets = updates.map((f, i) => `${f}=$${i + 1}`).join(',');
  const { rows } = await db.query(
    `UPDATE accounts SET ${sets} WHERE id=$${updates.length + 1} RETURNING *`,
    [...updates.map(f => req.body[f]), req.params.id]
  );
  if (!rows[0]) return res.status(404).json({ error: 'Account not found' });
  res.json(rows[0]);
}));

router.delete('/accounts/:id', asyncHandler(async (req, res) => {
  const { rows } = await db.query(
    'SELECT COUNT(*) FROM transactions WHERE account_id=$1',
    [req.params.id]
  );
  if (parseInt(rows[0].count) > 0)
    return res.status(409).json({ error: 'Account has transactions — reassign or delete them first' });
  await db.query('DELETE FROM accounts WHERE id=$1', [req.params.id]);
  res.status(204).end();
}));

// ── Categories ────────────────────────────────────────────────────────────
router.get('/categories', asyncHandler(async (req, res) => {
  const { rows } = await db.query('SELECT * FROM categories ORDER BY type, name');
  res.json(rows);
}));

router.post('/categories', asyncHandler(async (req, res) => {
  const { name, type, colour, icon, parent_id } = req.body;
  if (!name || !type) return res.status(400).json({ error: 'name and type are required' });
  const { rows } = await db.query(
    'INSERT INTO categories (name,type,colour,icon,parent_id) VALUES ($1,$2,$3,$4,$5) RETURNING *',
    [name, type, colour || '#6366f1', icon || 'tag', parent_id || null]
  );
  res.status(201).json(rows[0]);
}));

router.patch('/categories/:id', asyncHandler(async (req, res) => {
  const fields = ['name', 'type', 'colour', 'icon', 'parent_id'];
  const updates = fields.filter(f => req.body[f] !== undefined);
  if (!updates.length) return res.status(400).json({ error: 'No fields to update' });
  const sets = updates.map((f, i) => `${f}=$${i + 1}`).join(',');
  const { rows } = await db.query(
    `UPDATE categories SET ${sets} WHERE id=$${updates.length + 1} RETURNING *`,
    [...updates.map(f => req.body[f]), req.params.id]
  );
  if (!rows[0]) return res.status(404).json({ error: 'Category not found' });
  res.json(rows[0]);
}));

router.delete('/categories/:id', asyncHandler(async (req, res) => {
  await db.query('DELETE FROM categories WHERE id=$1', [req.params.id]);
  res.status(204).end();
}));

// ── Transactions ──────────────────────────────────────────────────────────
router.get('/transactions', asyncHandler(async (req, res) => {
  const {
    limit = 100, offset = 0,
    account_id, category_id, payee_id, type, from, to, search,
  } = req.query;

  let q = `
    SELECT t.*,
           a.name  AS account_name,
           c.name  AS category_name,
           c.colour AS category_colour,
           c.icon  AS category_icon,
           p.name  AS payee_name,
           p.colour AS payee_colour
    FROM transactions t
    LEFT JOIN accounts   a ON a.id = t.account_id
    LEFT JOIN categories c ON c.id = t.category_id
    LEFT JOIN payees     p ON p.id = t.payee_id
    WHERE 1=1
  `;
  const params = [];
  let i = 1;
  if (account_id)  { q += ` AND t.account_id=$${i++}`;   params.push(account_id); }
  if (category_id) { q += ` AND t.category_id=$${i++}`;  params.push(category_id); }
  if (payee_id)    { q += ` AND t.payee_id=$${i++}`;     params.push(payee_id); }
  if (type)        { q += ` AND t.type=$${i++}`;          params.push(type); }
  if (from)        { q += ` AND t.date>=$${i++}`;         params.push(from); }
  if (to)          { q += ` AND t.date<=$${i++}`;         params.push(to); }
  if (search) {
    q += ` AND (t.description ILIKE $${i} OR t.merchant ILIKE $${i})`;
    params.push(`%${search}%`);
    i++;
  }
  q += ` ORDER BY t.date DESC, t.created_at DESC LIMIT $${i++} OFFSET $${i++}`;
  params.push(parseInt(limit, 10), parseInt(offset, 10));

  const { rows } = await db.query(q, params);
  res.json(rows);
}));

router.post('/transactions', asyncHandler(async (req, res) => {
  const {
    account_id, category_id, payee_id, amount, type, description,
    merchant, date, recurring, recurring_interval, next_due, tags, notes,
  } = req.body;

  if (!account_id || !amount || !type)
    return res.status(400).json({ error: 'account_id, amount, and type are required' });
  if (!['income', 'expense', 'transfer'].includes(type))
    return res.status(400).json({ error: 'type must be income, expense, or transfer' });
  if (parseFloat(amount) <= 0)
    return res.status(400).json({ error: 'amount must be positive' });

  const txnDate = date || new Date().toISOString().split('T')[0];

  const client = await db.connect();
  try {
    await client.query('BEGIN');

    const { rows } = await client.query(
      `INSERT INTO transactions
         (account_id, category_id, payee_id, amount, type, description,
          merchant, date, recurring, recurring_interval, next_due, tags, notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING *`,
      [
        account_id, category_id || null, payee_id || null,
        amount, type, description, merchant,
        txnDate,
        recurring || false, recurring_interval || null,
        next_due || null,
        tags || [], notes || null,
      ]
    );

    if (type === 'income')
      await client.query(
        'UPDATE accounts SET balance = balance + $1 WHERE id=$2',
        [amount, account_id]
      );
    if (type === 'expense')
      await client.query(
        'UPDATE accounts SET balance = balance - $1 WHERE id=$2',
        [amount, account_id]
      );

    await client.query('COMMIT');
    res.status(201).json(rows[0]);
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}));

router.patch('/transactions/:id', asyncHandler(async (req, res) => {
  const fields = [
    'category_id', 'payee_id', 'description', 'merchant', 'date',
    'recurring', 'recurring_interval', 'next_due', 'tags', 'notes',
  ];
  const updates = fields.filter(f => req.body[f] !== undefined);
  if (!updates.length) return res.status(400).json({ error: 'No fields to update' });
  const sets = updates.map((f, idx) => `${f}=$${idx + 1}`).join(',');
  const { rows } = await db.query(
    `UPDATE transactions SET ${sets} WHERE id=$${updates.length + 1} RETURNING *`,
    [...updates.map(f => req.body[f]), req.params.id]
  );
  if (!rows[0]) return res.status(404).json({ error: 'Transaction not found' });
  res.json(rows[0]);
}));

router.delete('/transactions/:id', asyncHandler(async (req, res) => {
  const { rows: txRows } = await db.query(
    'SELECT * FROM transactions WHERE id=$1',
    [req.params.id]
  );
  if (!txRows[0]) return res.status(404).json({ error: 'Transaction not found' });
  const txn = txRows[0];

  const client = await db.connect();
  try {
    await client.query('BEGIN');
    await client.query('DELETE FROM transactions WHERE id=$1', [req.params.id]);
    if (txn.type === 'income')
      await client.query(
        'UPDATE accounts SET balance = balance - $1 WHERE id=$2',
        [txn.amount, txn.account_id]
      );
    if (txn.type === 'expense')
      await client.query(
        'UPDATE accounts SET balance = balance + $1 WHERE id=$2',
        [txn.amount, txn.account_id]
      );
    await client.query('COMMIT');
    res.status(204).end();
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}));

// ── Recurring ─────────────────────────────────────────────────────────────
// Returns all template transactions (the source rows, not generated copies)
router.get('/recurring', asyncHandler(async (req, res) => {
  const { rows } = await db.query(`
    SELECT t.*,
           a.name  AS account_name,
           c.name  AS category_name,
           c.colour AS category_colour,
           c.icon  AS category_icon,
           p.name  AS payee_name
    FROM transactions t
    LEFT JOIN accounts   a ON a.id = t.account_id
    LEFT JOIN categories c ON c.id = t.category_id
    LEFT JOIN payees     p ON p.id = t.payee_id
    WHERE t.recurring = true
    ORDER BY t.next_due ASC NULLS LAST, t.created_at DESC
  `);
  res.json(rows);
}));

// Pause (set recurring=false) or resume (set recurring=true)
router.patch('/recurring/:id/pause', asyncHandler(async (req, res) => {
  const { rows } = await db.query(
    'UPDATE transactions SET recurring=false WHERE id=$1 RETURNING *',
    [req.params.id]
  );
  if (!rows[0]) return res.status(404).json({ error: 'Transaction not found' });
  res.json(rows[0]);
}));

router.patch('/recurring/:id/resume', asyncHandler(async (req, res) => {
  const { rows } = await db.query(
    'UPDATE transactions SET recurring=true WHERE id=$1 RETURNING *',
    [req.params.id]
  );
  if (!rows[0]) return res.status(404).json({ error: 'Transaction not found' });
  res.json(rows[0]);
}));

// Manual trigger (useful during development)
router.post('/recurring/process', asyncHandler(async (req, res) => {
  await processRecurring();
  res.json({ ok: true });
}));

// ── Budgets ───────────────────────────────────────────────────────────────
router.get('/budgets', asyncHandler(async (req, res) => {
  const { rows } = await db.query(`
    SELECT b.*,
           c.name  AS category_name,
           c.colour AS category_colour,
           c.icon  AS category_icon,
    COALESCE((
      SELECT SUM(t.amount)
      FROM transactions t
      WHERE t.category_id = b.category_id
        AND t.type = 'expense'
        AND CASE
          WHEN b.period = 'weekly' THEN t.date >= date_trunc('week',  NOW()::date)
          WHEN b.period = 'yearly' THEN t.date >= date_trunc('year',  NOW()::date)
          ELSE                          t.date >= date_trunc('month', NOW()::date)
        END
    ), 0) AS spent
    FROM budgets b
    LEFT JOIN categories c ON c.id = b.category_id
  `);
  res.json(rows);
}));

router.post('/budgets', asyncHandler(async (req, res) => {
  const { category_id, amount, period, colour } = req.body;
  if (!category_id || !amount)
    return res.status(400).json({ error: 'category_id and amount are required' });
  const { rows } = await db.query(
    'INSERT INTO budgets (category_id,amount,period,colour) VALUES ($1,$2,$3,$4) RETURNING *',
    [category_id, amount, period || 'monthly', colour || '#6366f1']
  );
  res.status(201).json(rows[0]);
}));

router.delete('/budgets/:id', asyncHandler(async (req, res) => {
  await db.query('DELETE FROM budgets WHERE id=$1', [req.params.id]);
  res.status(204).end();
}));

// ── Financial Goals ───────────────────────────────────────────────────────
router.get('/financial-goals', asyncHandler(async (req, res) => {
  const { rows } = await db.query('SELECT * FROM financial_goals ORDER BY created_at');
  res.json(rows);
}));

router.post('/financial-goals', asyncHandler(async (req, res) => {
  const { name, target_amount, current_amount, target_date, account_id, colour, icon } = req.body;
  if (!name || !target_amount)
    return res.status(400).json({ error: 'name and target_amount are required' });
  const { rows } = await db.query(
    `INSERT INTO financial_goals
       (name,target_amount,current_amount,target_date,account_id,colour,icon)
     VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
    [
      name, target_amount, current_amount || 0,
      target_date || null, account_id || null,
      colour || '#10d98f', icon || 'target',
    ]
  );
  res.status(201).json(rows[0]);
}));

router.patch('/financial-goals/:id', asyncHandler(async (req, res) => {
  const fields = ['name', 'target_amount', 'current_amount', 'target_date', 'account_id', 'colour', 'icon'];
  const updates = fields.filter(f => req.body[f] !== undefined);
  if (!updates.length) return res.status(400).json({ error: 'No fields to update' });
  const sets = updates.map((f, i) => `${f}=$${i + 1}`).join(',');
  const { rows } = await db.query(
    `UPDATE financial_goals SET ${sets} WHERE id=$${updates.length + 1} RETURNING *`,
    [...updates.map(f => req.body[f]), req.params.id]
  );
  if (!rows[0]) return res.status(404).json({ error: 'Goal not found' });
  res.json(rows[0]);
}));

router.delete('/financial-goals/:id', asyncHandler(async (req, res) => {
  await db.query('DELETE FROM financial_goals WHERE id=$1', [req.params.id]);
  res.status(204).end();
}));

// ── Analytics ─────────────────────────────────────────────────────────────
router.get('/analytics/summary', asyncHandler(async (req, res) => {
  const { from, to } = req.query;
  const start = from || new Date(new Date().getFullYear(), new Date().getMonth(), 1)
    .toISOString().split('T')[0];
  const end = to || new Date().toISOString().split('T')[0];

  const [income, expenses, byCategory, byPayee, daily] = await Promise.all([
    db.query(
      `SELECT COALESCE(SUM(amount),0) AS total
       FROM transactions WHERE type='income' AND date BETWEEN $1 AND $2`,
      [start, end]
    ),
    db.query(
      `SELECT COALESCE(SUM(amount),0) AS total
       FROM transactions WHERE type='expense' AND date BETWEEN $1 AND $2`,
      [start, end]
    ),
    db.query(
      `SELECT c.name, c.colour, c.icon, SUM(t.amount) AS total
       FROM transactions t
       JOIN categories c ON c.id = t.category_id
       WHERE t.type='expense' AND t.date BETWEEN $1 AND $2
       GROUP BY c.id, c.name, c.colour, c.icon
       ORDER BY total DESC LIMIT 10`,
      [start, end]
    ),
    db.query(
      `SELECT p.name, p.colour, SUM(t.amount) AS total, COUNT(*) AS count
       FROM transactions t
       JOIN payees p ON p.id = t.payee_id
       WHERE t.type='expense' AND t.date BETWEEN $1 AND $2
       GROUP BY p.id, p.name, p.colour
       ORDER BY total DESC LIMIT 10`,
      [start, end]
    ),
    db.query(
      `SELECT date,
         SUM(CASE WHEN type='income'  THEN amount ELSE 0 END) AS income,
         SUM(CASE WHEN type='expense' THEN amount ELSE 0 END) AS expense
       FROM transactions
       WHERE date BETWEEN $1 AND $2
       GROUP BY date ORDER BY date`,
      [start, end]
    ),
  ]);

  res.json({
    income:     parseFloat(income.rows[0].total),
    expenses:   parseFloat(expenses.rows[0].total),
    net:        parseFloat(income.rows[0].total) - parseFloat(expenses.rows[0].total),
    byCategory: byCategory.rows,
    byPayee:    byPayee.rows,
    daily:      daily.rows,
  });
}));

module.exports = router;
