const express = require('express');
const router = express.Router();
const db = require('../db/pool');

// ── Notebooks ─────────────────────────────────
router.get('/notebooks', async (req, res) => {
  const { rows } = await db.query('SELECT n.*, (SELECT COUNT(*) FROM notes nt WHERE nt.notebook_id = n.id) as note_count FROM notebooks n ORDER BY n.name');
  res.json(rows);
});

router.post('/notebooks', async (req, res) => {
  const { name, colour, icon } = req.body;
  const { rows } = await db.query('INSERT INTO notebooks (name,colour,icon) VALUES ($1,$2,$3) RETURNING *', [name, colour || '#6366f1', icon || 'book']);
  res.status(201).json(rows[0]);
});

// ── Notes ─────────────────────────────────────
router.get('/notes', async (req, res) => {
  const { notebook_id, search, tag, pinned } = req.query;
  let q = 'SELECT n.*, nb.name as notebook_name FROM notes n LEFT JOIN notebooks nb ON nb.id = n.notebook_id WHERE 1=1';
  const params = [];
  let p = 1;
  if (notebook_id) { q += ` AND n.notebook_id=$${p++}`; params.push(notebook_id); }
  if (search) { q += ` AND (n.title ILIKE $${p} OR n.content ILIKE $${p})`; params.push(`%${search}%`); p++; }
  if (tag) { q += ` AND $${p++} = ANY(n.tags)`; params.push(tag); }
  if (pinned === 'true') q += ' AND n.pinned = true';
  q += ' ORDER BY n.pinned DESC, n.updated_at DESC';
  const { rows } = await db.query(q, params);
  res.json(rows);
});

router.get('/notes/:id', async (req, res) => {
  const { rows } = await db.query('SELECT * FROM notes WHERE id=$1', [req.params.id]);
  if (!rows[0]) return res.status(404).json({ error: 'Not found' });
  res.json(rows[0]);
});

router.post('/notes', async (req, res) => {
  const { notebook_id, title, content, tags, pinned, colour } = req.body;
  const { rows } = await db.query(
    'INSERT INTO notes (notebook_id,title,content,tags,pinned,colour) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *',
    [notebook_id || null, title || 'Untitled', content || '', tags || [], pinned || false, colour || null]
  );
  res.status(201).json(rows[0]);
});

router.patch('/notes/:id', async (req, res) => {
  const fields = ['notebook_id','title','content','tags','pinned','colour'];
  const updates = fields.filter(f => req.body[f] !== undefined);
  if (!updates.length) return res.status(400).json({ error: 'No fields' });
  const sets = updates.map((f, i) => `${f}=$${i + 1}`).join(',');
  const { rows } = await db.query(
    `UPDATE notes SET ${sets}, updated_at=NOW() WHERE id=$${updates.length + 1} RETURNING *`,
    [...updates.map(f => req.body[f]), req.params.id]
  );
  res.json(rows[0]);
});

router.delete('/notes/:id', async (req, res) => {
  await db.query('DELETE FROM notes WHERE id=$1', [req.params.id]);
  res.status(204).end();
});

// ── Calendar / Events ─────────────────────────
router.get('/events', async (req, res) => {
  const { from, to } = req.query;
  let q = 'SELECT * FROM events WHERE 1=1';
  const params = [];
  let p = 1;
  if (from) { q += ` AND start_time >= $${p++}`; params.push(from); }
  if (to) { q += ` AND start_time <= $${p++}`; params.push(to); }
  q += ' ORDER BY start_time ASC';
  const { rows } = await db.query(q, params);
  res.json(rows);
});

router.post('/events', async (req, res) => {
  const { title, description, start_time, end_time, all_day, colour, category, location, url, reminder_minutes, goal_id } = req.body;
  const { rows } = await db.query(
    `INSERT INTO events (title,description,start_time,end_time,all_day,colour,category,location,url,reminder_minutes,goal_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
    [title, description || null, start_time, end_time || null, all_day || false,
     colour || '#6366f1', category || 'personal', location || null, url || null, reminder_minutes || null, goal_id || null]
  );
  res.status(201).json(rows[0]);
});

router.patch('/events/:id', async (req, res) => {
  const fields = ['title','description','start_time','end_time','all_day','colour','category','location'];
  const updates = fields.filter(f => req.body[f] !== undefined);
  const sets = updates.map((f, i) => `${f}=$${i + 1}`).join(',');
  const { rows } = await db.query(`UPDATE events SET ${sets} WHERE id=$${updates.length + 1} RETURNING *`, [...updates.map(f => req.body[f]), req.params.id]);
  res.json(rows[0]);
});

router.delete('/events/:id', async (req, res) => {
  await db.query('DELETE FROM events WHERE id=$1', [req.params.id]);
  res.status(204).end();
});

// ── Journal ───────────────────────────────────
router.get('/journal', async (req, res) => {
  const { from, to, limit = 30 } = req.query;
  let q = 'SELECT * FROM journal_entries WHERE 1=1';
  const params = [];
  let p = 1;
  if (from) { q += ` AND date >= $${p++}`; params.push(from); }
  if (to) { q += ` AND date <= $${p++}`; params.push(to); }
  q += ` ORDER BY date DESC LIMIT $${p++}`;
  params.push(limit);
  const { rows } = await db.query(q, params);
  res.json(rows);
});

router.get('/journal/:date', async (req, res) => {
  const { rows } = await db.query('SELECT * FROM journal_entries WHERE date=$1', [req.params.date]);
  res.json(rows[0] || null);
});

router.post('/journal', async (req, res) => {
  const { date, content, mood, mood_label, energy, gratitude, tags, weather } = req.body;
  const d = date || new Date().toISOString().split('T')[0];
  const { rows } = await db.query(
    `INSERT INTO journal_entries (date,content,mood,mood_label,energy,gratitude,tags,weather)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
     ON CONFLICT (date) DO UPDATE SET content=$2,mood=$3,mood_label=$4,energy=$5,gratitude=$6,tags=$7,weather=$8 RETURNING *`,
    [d, content || null, mood || null, mood_label || null, energy || null, gratitude || [], tags || [], weather || null]
  );
  res.json(rows[0]);
});

router.get('/journal/stats/mood', async (req, res) => {
  const { rows } = await db.query('SELECT date, mood, energy FROM journal_entries WHERE mood IS NOT NULL ORDER BY date DESC LIMIT 90');
  res.json(rows);
});

// ── Time Tracking ─────────────────────────────
router.get('/time/projects', async (req, res) => {
  const { rows } = await db.query(`
    SELECT tp.*, COALESCE(SUM(te.duration_seconds),0) as total_seconds
    FROM time_projects tp
    LEFT JOIN time_entries te ON te.project_id = tp.id
    GROUP BY tp.id ORDER BY tp.name
  `);
  res.json(rows);
});

router.post('/time/projects', async (req, res) => {
  const { name, colour, goal_id } = req.body;
  const { rows } = await db.query('INSERT INTO time_projects (name,colour,goal_id) VALUES ($1,$2,$3) RETURNING *', [name, colour || '#6366f1', goal_id || null]);
  res.status(201).json(rows[0]);
});

router.get('/time/entries', async (req, res) => {
  const { from, to, project_id } = req.query;
  const start = from || new Date(Date.now() - 7 * 86400000).toISOString().split('T')[0];
  const end = to || new Date().toISOString();
  let q = `SELECT te.*, tp.name as project_name, tp.colour as project_colour
           FROM time_entries te LEFT JOIN time_projects tp ON tp.id = te.project_id
           WHERE te.start_time >= $1 AND te.start_time <= $2`;
  const params = [start, end];
  if (project_id) { q += ' AND te.project_id=$3'; params.push(project_id); }
  q += ' ORDER BY te.start_time DESC';
  const { rows } = await db.query(q, params);
  res.json(rows);
});

router.post('/time/start', async (req, res) => {
  const { project_id, description, tags } = req.body;
  // Stop any running timer first
  await db.query(`UPDATE time_entries SET end_time=NOW(), duration_seconds=EXTRACT(EPOCH FROM (NOW()-start_time))::INT WHERE end_time IS NULL`);
  const { rows } = await db.query(
    'INSERT INTO time_entries (project_id,description,start_time,tags) VALUES ($1,$2,NOW(),$3) RETURNING *',
    [project_id, description || null, tags || []]
  );
  res.status(201).json(rows[0]);
});

router.post('/time/stop', async (req, res) => {
  const { rows } = await db.query(
    `UPDATE time_entries SET end_time=NOW(), duration_seconds=EXTRACT(EPOCH FROM (NOW()-start_time))::INT
     WHERE end_time IS NULL RETURNING *`
  );
  res.json(rows[0] || null);
});

router.get('/time/running', async (req, res) => {
  const { rows } = await db.query(`SELECT te.*, tp.name as project_name, tp.colour as project_colour
    FROM time_entries te LEFT JOIN time_projects tp ON tp.id = te.project_id WHERE te.end_time IS NULL LIMIT 1`);
  res.json(rows[0] || null);
});

module.exports = router;
