const express = require('express');
const router  = express.Router();
const db      = require('../db/pool');

const asyncHandler = fn => (req, res, next) =>
    Promise.resolve(fn(req, res, next)).catch(next);

const clip = (v, max = 500) => v == null ? v : String(v).slice(0, max);

// ══════════════════════════════════════════════════════════════════════════
// SLEEP LOGS
// ══════════════════════════════════════════════════════════════════════════
router.get('/sleep', asyncHandler(async (req, res) => {
    const { from, to, limit = 60 } = req.query;
    let q = 'SELECT * FROM sleep_logs WHERE 1=1';
    const params = [];
    let i = 1;
    if (from) { q += ` AND date >= $${i++}`; params.push(from); }
    if (to)   { q += ` AND date <= $${i++}`; params.push(to); }
    q += ` ORDER BY date DESC LIMIT $${i++}`;
    params.push(parseInt(limit, 10) || 60);
    const { rows } = await db.query(q, params);
    res.json(rows);
}));

router.get('/sleep/stats', asyncHandler(async (req, res) => {
    const { rows } = await db.query(`
        SELECT
            COALESCE(AVG(duration_minutes), 0)::INT AS avg_minutes,
            COALESCE(AVG(quality), 0)::NUMERIC(3,1) AS avg_quality,
            COUNT(*) AS total_nights
        FROM sleep_logs
        WHERE date >= CURRENT_DATE - INTERVAL '30 days'
    `);
    res.json(rows[0]);
}));

router.post('/sleep', asyncHandler(async (req, res) => {
    const { date, bed_time, wake_time, quality, notes } = req.body;
    const d = date || new Date().toISOString().split('T')[0];

    // Compute duration_minutes if both times provided
    let duration_minutes = null;
    if (bed_time && wake_time) {
        duration_minutes = Math.round((new Date(wake_time) - new Date(bed_time)) / 60000);
        if (duration_minutes < 0) duration_minutes += 24 * 60; // crossed midnight
    }

    // Upsert by date — sleep_logs has UNIQUE(date)
    const { rows } = await db.query(
        `INSERT INTO sleep_logs (date, bed_time, wake_time, duration_minutes, quality, notes)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (date) DO UPDATE SET
           bed_time         = EXCLUDED.bed_time,
           wake_time        = EXCLUDED.wake_time,
           duration_minutes = EXCLUDED.duration_minutes,
           quality          = EXCLUDED.quality,
           notes            = EXCLUDED.notes
         RETURNING *`,
        [d, bed_time || null, wake_time || null, duration_minutes,
         quality || null, clip(notes, 1000)]
    );
    res.json(rows[0]);
}));

router.delete('/sleep/:id', asyncHandler(async (req, res) => {
    await db.query('DELETE FROM sleep_logs WHERE id=$1', [req.params.id]);
    res.status(204).end();
}));

// ══════════════════════════════════════════════════════════════════════════
// EARL LIST  ("My Name Is Earl" — wrongs to right)
// ══════════════════════════════════════════════════════════════════════════
router.get('/earl', asyncHandler(async (req, res) => {
    const { resolved } = req.query;
    let q = 'SELECT * FROM earl_list WHERE 1=1';
    const params = [];
    if (resolved != null) {
        q += ' AND resolved = $1';
        params.push(resolved === 'true');
    }
    q += ' ORDER BY resolved ASC, created_at DESC';
    const { rows } = await db.query(q, params);
    res.json(rows);
}));

router.post('/earl', asyncHandler(async (req, res) => {
    const { person, situation } = req.body;
    if (!person || !situation) return res.status(400).json({ error: 'person and situation required' });
    const { rows } = await db.query(
        `INSERT INTO earl_list (person, situation) VALUES ($1, $2) RETURNING *`,
        [clip(person), clip(situation, 2000)]
    );
    res.status(201).json(rows[0]);
}));

router.patch('/earl/:id', asyncHandler(async (req, res) => {
    const { resolved, person, situation } = req.body;
    const updates = [];
    const values  = [];
    let p = 1;
    if (resolved !== undefined) {
        updates.push(`resolved = $${p++}`);
        values.push(resolved);
        updates.push(`resolved_at = $${p++}`);
        values.push(resolved ? new Date() : null);
    }
    if (person !== undefined)    { updates.push(`person=$${p++}`);    values.push(person); }
    if (situation !== undefined) { updates.push(`situation=$${p++}`); values.push(situation); }
    if (!updates.length) return res.status(400).json({ error: 'No fields to update' });
    const { rows } = await db.query(
        `UPDATE earl_list SET ${updates.join(',')} WHERE id=$${p} RETURNING *`,
        [...values, req.params.id]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Not found' });
    res.json(rows[0]);
}));

router.delete('/earl/:id', asyncHandler(async (req, res) => {
    await db.query('DELETE FROM earl_list WHERE id=$1', [req.params.id]);
    res.status(204).end();
}));

// ══════════════════════════════════════════════════════════════════════════
// MEDIA LIST  (books, films, series, podcasts, games)
// ══════════════════════════════════════════════════════════════════════════
router.get('/media', asyncHandler(async (req, res) => {
    const { type, status } = req.query;
    let q = 'SELECT * FROM media_list WHERE 1=1';
    const params = [];
    let i = 1;
    if (type)   { q += ` AND type = $${i++}`;   params.push(type); }
    if (status) { q += ` AND status = $${i++}`; params.push(status); }
    q += ' ORDER BY status, created_at DESC';
    const { rows } = await db.query(q, params);
    res.json(rows);
}));

router.post('/media', asyncHandler(async (req, res) => {
    const { title, type, status, rating, notes } = req.body;
    if (!title) return res.status(400).json({ error: 'title required' });
    const { rows } = await db.query(
        `INSERT INTO media_list (title, type, status, rating, notes)
         VALUES ($1,$2,$3,$4,$5) RETURNING *`,
        [clip(title), type || null, status || 'want', rating || null, clip(notes, 2000)]
    );
    res.status(201).json(rows[0]);
}));

router.patch('/media/:id', asyncHandler(async (req, res) => {
    const fields = ['title','type','status','rating','notes'];
    const updates = fields.filter(f => req.body[f] !== undefined);
    if (!updates.length) return res.status(400).json({ error: 'No fields to update' });
    const sets = updates.map((f, i) => `${f}=$${i + 1}`).join(',');
    const { rows } = await db.query(
        `UPDATE media_list SET ${sets} WHERE id=$${updates.length + 1} RETURNING *`,
        [...updates.map(f => req.body[f]), req.params.id]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Not found' });
    res.json(rows[0]);
}));

router.delete('/media/:id', asyncHandler(async (req, res) => {
    await db.query('DELETE FROM media_list WHERE id=$1', [req.params.id]);
    res.status(204).end();
}));

// ══════════════════════════════════════════════════════════════════════════
// CONTACTS TRACKER (keep-in-touch reminders)
//
// Faithful to the live trackers.js behaviour, plus:
//   - computed days_since_contact + due_for_contact in the GET response
//   - POST /:id/touch convenience endpoint
// ══════════════════════════════════════════════════════════════════════════
router.get('/contacts', asyncHandler(async (req, res) => {
    const { rows } = await db.query(`
        SELECT *,
            CASE
                WHEN last_contacted IS NULL THEN NULL
                ELSE (CURRENT_DATE - last_contacted)
            END AS days_since_contact,
            CASE
                WHEN last_contacted IS NULL THEN true
                WHEN (CURRENT_DATE - last_contacted) >= contact_frequency_days THEN true
                ELSE false
            END AS due_for_contact
        FROM contacts_tracker
        ORDER BY due_for_contact DESC, days_since_contact DESC NULLS FIRST, name ASC
    `);
    res.json(rows);
}));

router.get('/contacts/:id', asyncHandler(async (req, res) => {
    const { rows } = await db.query('SELECT * FROM contacts_tracker WHERE id=$1', [req.params.id]);
    if (!rows[0]) return res.status(404).json({ error: 'Contact not found' });
    res.json(rows[0]);
}));

router.post('/contacts', asyncHandler(async (req, res) => {
    const { name, relationship, last_contacted, contact_frequency_days, notes } = req.body;
    if (!name) return res.status(400).json({ error: 'name is required' });
    const { rows } = await db.query(
        `INSERT INTO contacts_tracker (name, relationship, last_contacted, contact_frequency_days, notes)
         VALUES ($1,$2,$3,$4,$5) RETURNING *`,
        [clip(name), clip(relationship), last_contacted || null,
         contact_frequency_days || 30, clip(notes, 2000)]
    );
    res.status(201).json(rows[0]);
}));

router.patch('/contacts/:id', asyncHandler(async (req, res) => {
    const fields = ['name','relationship','last_contacted','contact_frequency_days','notes'];
    const updates = fields.filter(f => req.body[f] !== undefined);
    if (!updates.length) return res.status(400).json({ error: 'No fields to update' });
    const sets = updates.map((f, i) => `${f}=$${i + 1}`).join(',');
    const { rows } = await db.query(
        `UPDATE contacts_tracker SET ${sets} WHERE id=$${updates.length + 1} RETURNING *`,
        [...updates.map(f => req.body[f]), req.params.id]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Contact not found' });
    res.json(rows[0]);
}));

// Convenience: bump last_contacted to today
router.post('/contacts/:id/touch', asyncHandler(async (req, res) => {
    const { rows } = await db.query(
        `UPDATE contacts_tracker SET last_contacted = CURRENT_DATE WHERE id = $1 RETURNING *`,
        [req.params.id]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Contact not found' });
    res.json(rows[0]);
}));

router.delete('/contacts/:id', asyncHandler(async (req, res) => {
    await db.query('DELETE FROM contacts_tracker WHERE id=$1', [req.params.id]);
    res.status(204).end();
}));

module.exports = router;
