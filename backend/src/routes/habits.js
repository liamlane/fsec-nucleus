const express = require('express');
const router  = express.Router();
const db      = require('../db/pool');

const asyncHandler = fn => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);

// FIX: limit is now parameterised — was SQL-interpolated previously
router.get('/', asyncHandler(async (req, res) => {
  const { limit } = req.query;
  const params = [];
  let q = `
    SELECT h.*,
      (SELECT COUNT(*) FROM habit_logs hl
       WHERE hl.habit_id = h.id AND hl.completed = true) AS total_completions,
      (SELECT date FROM habit_logs hl
       WHERE hl.habit_id = h.id AND hl.completed = true
       ORDER BY date DESC LIMIT 1) AS last_completed
    FROM habits h
    WHERE h.active = true
    ORDER BY h.created_at
  `;
  if (limit) {
    q += ' LIMIT $1';
    params.push(parseInt(limit, 10) || 50);
  }
  const { rows } = await db.query(q, params);
  res.json(rows);
}));

router.post('/', asyncHandler(async (req, res) => {
  const { name, description, frequency, frequency_days, colour, icon, goal_id, target_streak } = req.body;
  if (!name) return res.status(400).json({ error: 'name is required' });
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
}));

router.patch('/:id', asyncHandler(async (req, res) => {
  const fields = ['name','description','frequency','frequency_days','colour','icon','goal_id','target_streak','active'];
  const updates = fields.filter(f => req.body[f] !== undefined);
  if (!updates.length) return res.status(400).json({ error: 'No fields to update' });
  const sets = updates.map((f, i) => `${f}=$${i + 1}`).join(',');
  const { rows } = await db.query(
    `UPDATE habits SET ${sets} WHERE id=$${updates.length + 1} RETURNING *`,
    [...updates.map(f => req.body[f]), req.params.id]
  );
  if (!rows[0]) return res.status(404).json({ error: 'Habit not found' });
  res.json(rows[0]);
}));

// Soft delete — sets active=false
router.delete('/:id', asyncHandler(async (req, res) => {
  await db.query('UPDATE habits SET active=false WHERE id=$1', [req.params.id]);
  res.status(204).end();
}));

// ── Logs ──────────────────────────────────────────────────────────────────
router.get('/logs', asyncHandler(async (req, res) => {
  const { from, to, habit_id } = req.query;
  const start = from || new Date(Date.now() - 30 * 86400000).toISOString().split('T')[0];
  const end   = to   || new Date().toISOString().split('T')[0];
  let q = 'SELECT * FROM habit_logs WHERE date BETWEEN $1 AND $2';
  const params = [start, end];
  if (habit_id) { q += ' AND habit_id=$3'; params.push(habit_id); }
  q += ' ORDER BY date DESC';
  const { rows } = await db.query(q, params);
  res.json(rows);
}));

router.post('/log', asyncHandler(async (req, res) => {
  const { habit_id, date, completed, notes } = req.body;
  if (!habit_id) return res.status(400).json({ error: 'habit_id is required' });
  const d = date || new Date().toISOString().split('T')[0];
  const { rows } = await db.query(
    `INSERT INTO habit_logs (habit_id,date,completed,notes)
     VALUES ($1,$2,$3,$4)
     ON CONFLICT (habit_id,date) DO UPDATE SET completed=$3, notes=$4
     RETURNING *`,
    [habit_id, d, completed !== false, notes || null]
  );
  res.json(rows[0]);
}));

// ── Streak calculation ────────────────────────────────────────────────────
// FIX: now respects frequency_days — a weekdays-only habit no longer breaks streak on weekends
router.get('/:id/streak', asyncHandler(async (req, res) => {
  const habitRes = await db.query(
    'SELECT frequency_days FROM habits WHERE id=$1',
    [req.params.id]
  );
  if (!habitRes.rows[0]) return res.status(404).json({ error: 'Habit not found' });
  const freqDays = habitRes.rows[0].frequency_days || [1,2,3,4,5,6,7];

  const { rows } = await db.query(
    'SELECT date FROM habit_logs WHERE habit_id=$1 AND completed=true ORDER BY date DESC',
    [req.params.id]
  );

  // Set of completed dates for O(1) lookup
  const completed = new Set(
    rows.map(r => (typeof r.date === 'string' ? r.date.split('T')[0]
                                              : r.date.toISOString().split('T')[0]))
  );

  let streak = 0;
  const cursor = new Date();
  cursor.setHours(0, 0, 0, 0);
  let firstScheduled = true;

  for (let i = 0; i < 365; i++) {
    const dow    = cursor.getDay();
    const mapped = dow === 0 ? 7 : dow;
    const isScheduled = freqDays.includes(mapped);

    if (isScheduled) {
      const key = cursor.toISOString().split('T')[0];
      if (completed.has(key)) {
        streak++;
      } else if (firstScheduled) {
        // Today scheduled but not done — don't break streak, just don't count it
        firstScheduled = false;
      } else {
        break;
      }
      firstScheduled = false;
    }
    cursor.setDate(cursor.getDate() - 1);
  }

  res.json({ streak });
}));

module.exports = router;
