const express = require('express');
const router  = express.Router();
const db      = require('../db/pool');

const asyncHandler = fn => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);

// Defend against DoS-by-huge-payload
const MAX_TEXT  = 50000;
const MAX_SHORT = 500;
const clip = (v, max = MAX_SHORT) => v == null ? v : String(v).slice(0, max);

// ── Notebooks ─────────────────────────────────
router.get('/notebooks', asyncHandler(async (req, res) => {
  const { rows } = await db.query(
    `SELECT * FROM notebooks WHERE is_deleted = false ORDER BY name`
  );
  res.json(rows);
}));

router.post('/notebooks', asyncHandler(async (req, res) => {
  const { name, colour, icon } = req.body;
  if (!name) return res.status(400).json({ error: 'name is required' });
  const { rows } = await db.query(
    'INSERT INTO notebooks (name,colour,icon) VALUES ($1,$2,$3) RETURNING *',
    [clip(name), colour || '#6366f1', icon || 'book']
  );
  res.status(201).json(rows[0]);
}));

// ── Notes ─────────────────────────────────────
router.get('/notes', asyncHandler(async (req, res) => {
  const { notebook_id, search, tag, pinned } = req.query;
  let q = `SELECT n.*, nb.name AS notebook_name
           FROM notes n LEFT JOIN notebooks nb ON nb.id = n.notebook_id
           WHERE 1=1`;
  const params = [];
  let p = 1;
  if (notebook_id) { q += ` AND n.notebook_id=$${p++}`; params.push(notebook_id); }
  if (search)      { q += ` AND (n.title ILIKE $${p} OR n.content ILIKE $${p})`; params.push(`%${search}%`); p++; }
  if (tag)         { q += ` AND $${p++} = ANY(n.tags)`; params.push(tag); }
  if (pinned === 'true') q += ' AND n.pinned = true';
  q += ' ORDER BY n.pinned DESC, n.updated_at DESC';
  const { rows } = await db.query(q, params);
  res.json(rows);
}));

router.get('/notes/:id', asyncHandler(async (req, res) => {
  const { rows } = await db.query('SELECT * FROM notes WHERE id=$1', [req.params.id]);
  if (!rows[0]) return res.status(404).json({ error: 'Not found' });
  res.json(rows[0]);
}));

router.post('/notes', asyncHandler(async (req, res) => {
  const { notebook_id, title, content, tags, pinned, colour } = req.body;
  const { rows } = await db.query(
    'INSERT INTO notes (notebook_id,title,content,tags,pinned,colour) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *',
    [
      notebook_id || null,
      clip(title) || 'Untitled',
      clip(content, MAX_TEXT) || '',
      tags || [],
      pinned || false,
      colour || null,
    ]
  );
  res.status(201).json(rows[0]);
}));

router.patch('/notes/:id', asyncHandler(async (req, res) => {
  const fields = ['notebook_id','title','content','tags','pinned','colour'];
  const updates = fields.filter(f => req.body[f] !== undefined);
  if (!updates.length) return res.status(400).json({ error: 'No fields to update' });
  const sets = updates.map((f, i) => `${f}=$${i + 1}`).join(',');
  const values = updates.map(f => {
    if (f === 'title')   return clip(req.body[f]);
    if (f === 'content') return clip(req.body[f], MAX_TEXT);
    return req.body[f];
  });
  const { rows } = await db.query(
    `UPDATE notes SET ${sets}, updated_at=NOW() WHERE id=$${updates.length + 1} RETURNING *`,
    [...values, req.params.id]
  );
  if (!rows[0]) return res.status(404).json({ error: 'Not found' });
  res.json(rows[0]);
}));

router.delete('/notes/:id', asyncHandler(async (req, res) => {
  await db.query('DELETE FROM notes WHERE id=$1', [req.params.id]);
  res.status(204).end();
}));

// ── Calendar / Events ─────────────────────────
router.get('/events', asyncHandler(async (req, res) => {
  const { from, to } = req.query;
  let q = 'SELECT * FROM events WHERE 1=1';
  const params = [];
  let p = 1;
  if (from) { q += ` AND start_time >= $${p++}`; params.push(from); }
  if (to)   { q += ` AND start_time <= $${p++}`; params.push(to); }
  q += ' ORDER BY start_time ASC';
  const { rows } = await db.query(q, params);
  res.json(rows);
}));

router.post('/events', asyncHandler(async (req, res) => {
  const { title, description, start_time, end_time, all_day, colour, category, location, url, reminder_minutes, goal_id } = req.body;
  if (!title || !start_time) return res.status(400).json({ error: 'title and start_time are required' });
  const { rows } = await db.query(
    `INSERT INTO events (title,description,start_time,end_time,all_day,colour,category,location,url,reminder_minutes,goal_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
    [
      clip(title), clip(description, MAX_TEXT),
      start_time, end_time || null, all_day || false,
      colour || '#6366f1', category || 'personal',
      clip(location), clip(url),
      reminder_minutes || null, goal_id || null,
    ]
  );
  res.status(201).json(rows[0]);
}));

router.patch('/events/:id', asyncHandler(async (req, res) => {
  const fields = ['title','description','start_time','end_time','all_day','colour','category','location','url','reminder_minutes','goal_id'];
  const updates = fields.filter(f => req.body[f] !== undefined);
  if (!updates.length) return res.status(400).json({ error: 'No fields to update' });
  const sets = updates.map((f, i) => `${f}=$${i + 1}`).join(',');
  const { rows } = await db.query(
    `UPDATE events SET ${sets} WHERE id=$${updates.length + 1} RETURNING *`,
    [...updates.map(f => req.body[f]), req.params.id]
  );
  if (!rows[0]) return res.status(404).json({ error: 'Not found' });
  res.json(rows[0]);
}));

router.delete('/events/:id', asyncHandler(async (req, res) => {
  await db.query('DELETE FROM events WHERE id=$1', [req.params.id]);
  res.status(204).end();
}));

// ── Journal ───────────────────────────────────
router.get('/journal', asyncHandler(async (req, res) => {
  const { from, to, limit = 30 } = req.query;
  let q = 'SELECT * FROM journal_entries WHERE 1=1';
  const params = [];
  let p = 1;
  if (from) { q += ` AND date >= $${p++}`; params.push(from); }
  if (to)   { q += ` AND date <= $${p++}`; params.push(to); }
  q += ` ORDER BY date DESC LIMIT $${p++}`;
  params.push(parseInt(limit, 10) || 30);
  const { rows } = await db.query(q, params);
  res.json(rows);
}));

router.get('/journal/:date', asyncHandler(async (req, res) => {
  const { rows } = await db.query('SELECT * FROM journal_entries WHERE date=$1', [req.params.date]);
  res.json(rows[0] || null);
}));

router.post('/journal', asyncHandler(async (req, res) => {
  const { date, content, mood, mood_label, energy, gratitude, tags, weather, is_checkin } = req.body;
  const d = date || new Date().toISOString().split('T')[0];
  // Use ?? not || so a value of 0 doesn't coerce to null
  // is_checkin never unsets a previous check-in (OR with existing)
  const { rows } = await db.query(
    `INSERT INTO journal_entries (date,content,mood,mood_label,energy,gratitude,tags,weather,is_checkin)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
     ON CONFLICT (date) DO UPDATE
       SET content=EXCLUDED.content,
           mood=EXCLUDED.mood,
           mood_label=EXCLUDED.mood_label,
           energy=EXCLUDED.energy,
           gratitude=EXCLUDED.gratitude,
           tags=EXCLUDED.tags,
           weather=EXCLUDED.weather,
           is_checkin = journal_entries.is_checkin OR EXCLUDED.is_checkin
     RETURNING *`,
    [
      d,
      clip(content, MAX_TEXT),
      mood ?? null,
      clip(mood_label),
      energy ?? null,
      gratitude || [],
      tags || [],
      clip(weather),
      is_checkin === true,
    ]
  );
  res.json(rows[0]);
}));

router.get('/journal/stats/mood', asyncHandler(async (req, res) => {
  const { rows } = await db.query(
    'SELECT date, mood, energy FROM journal_entries WHERE mood IS NOT NULL ORDER BY date DESC LIMIT 90'
  );
  res.json(rows);
}));

// ══════════════════════════════════════════════════════════════════════════
// STAGE 3: WELLNESS — Substances
// ══════════════════════════════════════════════════════════════════════════
router.get('/wellness/substances', asyncHandler(async (req, res) => {
  const { rows } = await db.query(`
    SELECT s.*,
      (SELECT date FROM substance_logs sl
       WHERE sl.substance_id = s.id
       ORDER BY sl.date DESC LIMIT 1) AS last_used,
      (SELECT COUNT(*) FROM substance_logs sl WHERE sl.substance_id = s.id) AS total_logs,
      COALESCE(
        (SELECT date FROM substance_logs sl WHERE sl.substance_id = s.id ORDER BY sl.date DESC LIMIT 1),
        s.abstinence_since
      ) AS reference_date
    FROM substances s
    WHERE s.active = true
    ORDER BY s.created_at DESC
  `);
  res.json(rows);
}));

router.post('/wellness/substances', asyncHandler(async (req, res) => {
  const { name, unit, colour, abstinence_mode, abstinence_since, notes } = req.body;
  if (!name) return res.status(400).json({ error: 'name is required' });
  const { rows } = await db.query(
    `INSERT INTO substances (name,unit,colour,abstinence_mode,abstinence_since,notes)
     VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
    [
      clip(name),
      clip(unit),
      colour || '#6366f1',
      abstinence_mode === true,
      abstinence_since || null,
      clip(notes, MAX_TEXT),
    ]
  );
  res.status(201).json(rows[0]);
}));

router.patch('/wellness/substances/:id', asyncHandler(async (req, res) => {
  const fields = ['name','unit','colour','abstinence_mode','abstinence_since','notes','active'];
  const updates = fields.filter(f => req.body[f] !== undefined);
  if (!updates.length) return res.status(400).json({ error: 'No fields to update' });
  const sets = updates.map((f, i) => `${f}=$${i + 1}`).join(',');
  const { rows } = await db.query(
    `UPDATE substances SET ${sets} WHERE id=$${updates.length + 1} RETURNING *`,
    [...updates.map(f => req.body[f]), req.params.id]
  );
  if (!rows[0]) return res.status(404).json({ error: 'Substance not found' });
  res.json(rows[0]);
}));

// Soft delete — keeps logs intact
router.delete('/wellness/substances/:id', asyncHandler(async (req, res) => {
  await db.query('UPDATE substances SET active=false WHERE id=$1', [req.params.id]);
  res.status(204).end();
}));

// ── Substance logs ──────────────────────────────────
router.get('/wellness/logs', asyncHandler(async (req, res) => {
  const { substance_id, from, to, limit = 100 } = req.query;
  let q = 'SELECT * FROM substance_logs WHERE 1=1';
  const params = [];
  let p = 1;
  if (substance_id) { q += ` AND substance_id=$${p++}`; params.push(substance_id); }
  if (from)         { q += ` AND date >= $${p++}`;       params.push(from); }
  if (to)           { q += ` AND date <= $${p++}`;       params.push(to); }
  q += ` ORDER BY date DESC, created_at DESC LIMIT $${p++}`;
  params.push(parseInt(limit, 10) || 100);
  const { rows } = await db.query(q, params);
  res.json(rows);
}));

router.post('/wellness/log', asyncHandler(async (req, res) => {
  const { substance_id, date, quantity, notes } = req.body;
  if (!substance_id) return res.status(400).json({ error: 'substance_id is required' });
  const d = date || new Date().toISOString().split('T')[0];
  const { rows } = await db.query(
    `INSERT INTO substance_logs (substance_id,date,quantity,notes)
     VALUES ($1,$2,$3,$4) RETURNING *`,
    [substance_id, d, quantity ?? null, clip(notes, MAX_TEXT)]
  );
  res.status(201).json(rows[0]);
}));

router.delete('/wellness/log/:id', asyncHandler(async (req, res) => {
  await db.query('DELETE FROM substance_logs WHERE id=$1', [req.params.id]);
  res.status(204).end();
}));

// ── Time Tracking ─────────────────────────────
router.get('/time/projects', asyncHandler(async (req, res) => {
  const { rows } = await db.query(`
    SELECT tp.*, COALESCE(SUM(te.duration_seconds),0) AS total_seconds
    FROM time_projects tp
    LEFT JOIN time_entries te ON te.project_id = tp.id
    GROUP BY tp.id ORDER BY tp.name
  `);
  res.json(rows);
}));

router.post('/time/projects', asyncHandler(async (req, res) => {
  const { name, colour, goal_id } = req.body;
  if (!name) return res.status(400).json({ error: 'name is required' });
  const { rows } = await db.query(
    'INSERT INTO time_projects (name,colour,goal_id) VALUES ($1,$2,$3) RETURNING *',
    [clip(name), colour || '#6366f1', goal_id || null]
  );
  res.status(201).json(rows[0]);
}));

router.get('/time/entries', asyncHandler(async (req, res) => {
  const { from, to, project_id } = req.query;
  const start = from || new Date(Date.now() - 7 * 86400000).toISOString().split('T')[0];
  const end   = to   || new Date().toISOString();
  let q = `SELECT te.*, tp.name AS project_name, tp.colour AS project_colour
           FROM time_entries te LEFT JOIN time_projects tp ON tp.id = te.project_id
           WHERE te.start_time >= $1 AND te.start_time <= $2`;
  const params = [start, end];
  if (project_id) { q += ' AND te.project_id=$3'; params.push(project_id); }
  q += ' ORDER BY te.start_time DESC';
  const { rows } = await db.query(q, params);
  res.json(rows);
}));

// Atomic: stop any running timer + start new one in a single transaction
router.post('/time/start', asyncHandler(async (req, res) => {
  const { project_id, description, tags } = req.body;
  if (!project_id) return res.status(400).json({ error: 'project_id is required' });

  const client = await db.connect();
  try {
    await client.query('BEGIN');
    await client.query(
      `UPDATE time_entries
       SET end_time=NOW(), duration_seconds=EXTRACT(EPOCH FROM (NOW()-start_time))::INT
       WHERE end_time IS NULL`
    );
    const { rows } = await client.query(
      `INSERT INTO time_entries (project_id,description,start_time,tags)
       VALUES ($1,$2,NOW(),$3) RETURNING *`,
      [project_id, clip(description), tags || []]
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

router.post('/time/stop', asyncHandler(async (req, res) => {
  const { rows } = await db.query(
    `UPDATE time_entries
     SET end_time=NOW(), duration_seconds=EXTRACT(EPOCH FROM (NOW()-start_time))::INT
     WHERE end_time IS NULL RETURNING *`
  );
  res.json(rows[0] || null);
}));

router.get('/time/running', asyncHandler(async (req, res) => {
  const { rows } = await db.query(`
    SELECT te.*, tp.name AS project_name, tp.colour AS project_colour
    FROM time_entries te LEFT JOIN time_projects tp ON tp.id = te.project_id
    WHERE te.end_time IS NULL LIMIT 1
  `);
  res.json(rows[0] || null);
}));

module.exports = router;
