const express = require('express');
const router = express.Router();
const db = require('../db/pool');

// ── Accounts ──────────────────────────────────
router.get('/accounts', async (req, res) => {
  const { rows } = await db.query('SELECT * FROM accounts ORDER BY created_at');
  res.json(rows);
});

router.post('/accounts', async (req, res) => {
  const { name, type, balance, currency, colour, icon } = req.body;
  const { rows } = await db.query(
    'INSERT INTO accounts (name,type,balance,currency,colour,icon) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *',
    [name, type, balance || 0, currency || 'GBP', colour || '#6366f1', icon || 'bank']
  );
  res.status(201).json(rows[0]);
});

router.patch('/accounts/:id', async (req, res) => {
  const fields = ['name','type','balance','currency','colour','icon'];
  const updates = fields.filter(f => req.body[f] !== undefined);
  if (!updates.length) return res.status(400).json({ error: 'No fields to update' });
  const sets = updates.map((f, i) => `${f}=$${i + 1}`).join(',');
  const vals = updates.map(f => req.body[f]);
  const { rows } = await db.query(`UPDATE accounts SET ${sets} WHERE id=$${updates.length + 1} RETURNING *`, [...vals, req.params.id]);
  res.json(rows[0]);
});

router.delete('/accounts/:id', async (req, res) => {
  await db.query('DELETE FROM accounts WHERE id=$1', [req.params.id]);
  res.status(204).end();
});

// ── Categories ────────────────────────────────
router.get('/categories', async (req, res) => {
  const { rows } = await db.query('SELECT * FROM categories ORDER BY type, name');
  res.json(rows);
});

router.post('/categories', async (req, res) => {
  const { name, type, colour, icon, parent_id } = req.body;
  const { rows } = await db.query(
    'INSERT INTO categories (name,type,colour,icon,parent_id) VALUES ($1,$2,$3,$4,$5) RETURNING *',
    [name, type, colour || '#6366f1', icon || 'tag', parent_id || null]
  );
  res.status(201).json(rows[0]);
});

// ── Transactions ──────────────────────────────
router.get('/transactions', async (req, res) => {
  const { limit = 100, offset = 0, account_id, category_id, type, from, to, search } = req.query;
  let q = `SELECT t.*, a.name as account_name, c.name as category_name, c.colour as category_colour, c.icon as category_icon
           FROM transactions t
           LEFT JOIN accounts a ON a.id = t.account_id
           LEFT JOIN categories c ON c.id = t.category_id WHERE 1=1`;
  const params = [];
  let p = 1;
  if (account_id) { q += ` AND t.account_id=$${p++}`; params.push(account_id); }
  if (category_id) { q += ` AND t.category_id=$${p++}`; params.push(category_id); }
  if (type) { q += ` AND t.type=$${p++}`; params.push(type); }
  if (from) { q += ` AND t.date>=$${p++}`; params.push(from); }
  if (to) { q += ` AND t.date<=$${p++}`; params.push(to); }
  if (search) { q += ` AND (t.description ILIKE $${p} OR t.merchant ILIKE $${p})`; params.push(`%${search}%`); p++; }
  q += ` ORDER BY t.date DESC, t.created_at DESC LIMIT $${p++} OFFSET $${p++}`;
  params.push(limit, offset);
  const { rows } = await db.query(q, params);
  res.json(rows);
});

router.post('/transactions', async (req, res) => {
  const { account_id, category_id, amount, type, description, merchant, date, recurring, recurring_interval, tags, notes } = req.body;
  const { rows } = await db.query(
    `INSERT INTO transactions (account_id,category_id,amount,type,description,merchant,date,recurring,recurring_interval,tags,notes)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
    [account_id, category_id || null, amount, type, description, merchant, date || new Date().toISOString().split('T')[0],
     recurring || false, recurring_interval || null, tags || [], notes || null]
  );
  // Update account balance
  if (type === 'income') await db.query('UPDATE accounts SET balance = balance + $1 WHERE id=$2', [amount, account_id]);
  if (type === 'expense') await db.query('UPDATE accounts SET balance = balance - $1 WHERE id=$2', [amount, account_id]);
  res.status(201).json(rows[0]);
});

router.delete('/transactions/:id', async (req, res) => {
  await db.query('DELETE FROM transactions WHERE id=$1', [req.params.id]);
  res.status(204).end();
});

// ── Budgets ───────────────────────────────────
router.get('/budgets', async (req, res) => {
  const { rows } = await db.query(
    `SELECT b.*, c.name as category_name, c.colour as category_colour, c.icon as category_icon,
     COALESCE((SELECT SUM(amount) FROM transactions t WHERE t.category_id = b.category_id
      AND date_trunc('month', t.date) = date_trunc('month', NOW()) AND t.type='expense'), 0) as spent
     FROM budgets b LEFT JOIN categories c ON c.id = b.category_id`
  );
  res.json(rows);
});

router.post('/budgets', async (req, res) => {
  const { category_id, amount, period, colour } = req.body;
  const { rows } = await db.query(
    'INSERT INTO budgets (category_id,amount,period,colour) VALUES ($1,$2,$3,$4) RETURNING *',
    [category_id, amount, period || 'monthly', colour || '#6366f1']
  );
  res.status(201).json(rows[0]);
});

router.delete('/budgets/:id', async (req, res) => {
  await db.query('DELETE FROM budgets WHERE id=$1', [req.params.id]);
  res.status(204).end();
});

// ── Financial Goals ───────────────────────────
router.get('/financial-goals', async (req, res) => {
  const { rows } = await db.query('SELECT * FROM financial_goals ORDER BY created_at');
  res.json(rows);
});

router.post('/financial-goals', async (req, res) => {
  const { name, target_amount, current_amount, target_date, account_id, colour, icon } = req.body;
  const { rows } = await db.query(
    'INSERT INTO financial_goals (name,target_amount,current_amount,target_date,account_id,colour,icon) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *',
    [name, target_amount, current_amount || 0, target_date || null, account_id || null, colour || '#10b981', icon || 'target']
  );
  res.status(201).json(rows[0]);
});

router.patch('/financial-goals/:id', async (req, res) => {
  const { current_amount } = req.body;
  const { rows } = await db.query('UPDATE financial_goals SET current_amount=$1 WHERE id=$2 RETURNING *', [current_amount, req.params.id]);
  res.json(rows[0]);
});

router.delete('/financial-goals/:id', async (req, res) => {
  await db.query('DELETE FROM financial_goals WHERE id=$1', [req.params.id]);
  res.status(204).end();
});

// ── Analytics ─────────────────────────────────
router.get('/analytics/summary', async (req, res) => {
  const { from, to } = req.query;
  const start = from || new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0];
  const end = to || new Date().toISOString().split('T')[0];

  const [income, expenses, byCategory, daily] = await Promise.all([
    db.query(`SELECT COALESCE(SUM(amount),0) as total FROM transactions WHERE type='income' AND date BETWEEN $1 AND $2`, [start, end]),
    db.query(`SELECT COALESCE(SUM(amount),0) as total FROM transactions WHERE type='expense' AND date BETWEEN $1 AND $2`, [start, end]),
    db.query(`SELECT c.name, c.colour, c.icon, SUM(t.amount) as total FROM transactions t
              JOIN categories c ON c.id = t.category_id WHERE t.type='expense' AND t.date BETWEEN $1 AND $2
              GROUP BY c.id, c.name, c.colour, c.icon ORDER BY total DESC LIMIT 10`, [start, end]),
    db.query(`SELECT date, SUM(CASE WHEN type='income' THEN amount ELSE 0 END) as income,
              SUM(CASE WHEN type='expense' THEN amount ELSE 0 END) as expense
              FROM transactions WHERE date BETWEEN $1 AND $2 GROUP BY date ORDER BY date`, [start, end]),
  ]);

  res.json({
    income: parseFloat(income.rows[0].total),
    expenses: parseFloat(expenses.rows[0].total),
    net: parseFloat(income.rows[0].total) - parseFloat(expenses.rows[0].total),
    byCategory: byCategory.rows,
    daily: daily.rows,
  });
});

module.exports = router;
