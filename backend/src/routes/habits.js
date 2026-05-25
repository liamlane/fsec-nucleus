const express = require('express');
const router = express.Router();
const db = require('../db/pool');

// FIX: GET / now respects the optional ?limit= query param
router.get('/', async (req, res) => {
  const { limit } = req.query;
  const limitClause = limit ? `LIMIT ${parseInt(limit, 10)}` : '';
  const { rows } = await db.query(`
    SELECT h.*,
      (SELECT COUNT(*) FROM habit_logs hl
       WHERE hl.habit_id = h.id AND hl.completed = true) as total_completions,
      (SELECT date FROM habit_logs hl
       WHERE hl.habit_id = h.id AND hl.completed = true
       ORDER BY date DESC LIMIT 1) as last_completed
    FROM habits h
    WHERE h.active = true
    ORDER BY h.created_at
    ${limitClause}
  `);
  res.json(rows);
});

router.post('/', async (req, res) => {
  const { name, description, frequency, frequency_days, colour, icon, goal_id, target_streak } = req.body;
  const { rows } = await db.query(
    `INSERT INTO habits (name,description,frequency,frequency_days,colour,icon,goal_id,target_streak)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
    [
      name,
      description     || null,
      frequency       || 'daily',
      frequency_days  || [1,2,3,4,5,6,7],
      colour          || '#f59e0b',
      icon            || 'zap',
      goal_id         || null,
      target_streak   || 0,
    ]
  );
  res.status(201).json(rows[0]);
});

router.patch('/:id', async (req, res) => {
  const fields = ['name','description','frequency','frequency_days','colour','icon','target_streak','active'];
  const updates = fields.filter(f => req.body[f] !== undefined);
  if (!updates.length) return res.status(400).json({ error: 'No fields to update' });
  const sets = updates.map((f, i) => `${f}=$${i + 1}`).join(',');
  const { rows } = await db.query(
    `UPDATE habits SET ${sets} WHERE id=$${updates.length + 1} RETURNING *`,
    [...updates.map(f => req.body[f]), req.params.id]
  );
  res.json(rows[0]);
});

// Soft delete — sets active=false
router.delete('/:id', async (req, res) => {
  await db.query('UPDATE habits SET active=false WHERE id=$1', [req.params.id]);
  res.status(204).end();
});

// ── Logs ──────────────────────────────────────────────────────────────────
router.get('/logs', async (req, res) => {
  const { from, to, habit_id } = req.query;
  const start = from || new Date(Date.now() - 30 * 86400000).toISOString().split('T')[0];
  const end   = to   || new Date().toISOString().split('T')[0];
  let q = 'SELECT * FROM habit_logs WHERE date BETWEEN $1 AND $2';
  const params = [start, end];
  if (habit_id) { q += ' AND habit_id=$3'; params.push(habit_id); }
  q += ' ORDER BY date DESC';
  const { rows } = await db.query(q, params);
  res.json(rows);
});

router.post('/log', async (req, res) => {
  const { habit_id, date, completed, notes } = req.body;
  const d = date || new Date().toISOString().split('T')[0];
  const { rows } = await db.query(
    `INSERT INTO habit_logs (habit_id,date,completed,notes)
     VALUES ($1,$2,$3,$4)
     ON CONFLICT (habit_id,date) DO UPDATE SET completed=$3, notes=$4
     RETURNING *`,
    [habit_id, d, completed !== false, notes || null]
  );
  res.json(rows[0]);
});

// ── Streak calculation ────────────────────────────────────────────────────
router.get('/:id/streak', async (req, res) => {
  const { rows } = await db.query(
    'SELECT date FROM habit_logs WHERE habit_id=$1 AND completed=true ORDER BY date DESC',
    [req.params.id]
  );
  let streak = 0;
  let check = new Date();
  check.setHours(0, 0, 0, 0);

  for (const row of rows) {
    const d = new Date(row.date);
    d.setHours(0, 0, 0, 0);
    const diff = Math.round((check - d) / 86400000);
    if (diff === 0 || diff === 1) {
      streak++;
      check = d;
    } else {
      break;
    }
  }
  res.json({ streak });
});

module.exports = router;
