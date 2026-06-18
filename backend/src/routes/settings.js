const express = require('express');
const router  = express.Router();
const db      = require('../db/pool');
const bcrypt  = require('bcryptjs');
const logger  = require('../utils/logger');

const asyncHandler = fn => (req, res, next) =>
    Promise.resolve(fn(req, res, next)).catch(next);

// ══════════════════════════════════════════════════════════════════════════
// App Preferences
// ══════════════════════════════════════════════════════════════════════════
router.get('/preferences', asyncHandler(async (req, res) => {
    const { rows } = await db.query(`SELECT key, value FROM app_settings`);
    const prefs = Object.fromEntries(rows.map(r => [r.key, r.value]));
    res.json(prefs);
}));

router.patch('/preferences', asyncHandler(async (req, res) => {
    if (!req.body || typeof req.body !== 'object')
        return res.status(400).json({ error: 'body must be an object of key/value pairs' });

    const client = await db.connect();
    try {
        await client.query('BEGIN');
        for (const [key, value] of Object.entries(req.body)) {
            await client.query(
                `INSERT INTO app_settings (key, value) VALUES ($1, $2)
                 ON CONFLICT (key) DO UPDATE SET value = $2`,
                [key, value]
            );
        }
        await client.query('COMMIT');
        res.json({ ok: true, updated: Object.keys(req.body) });
    } catch (e) {
        await client.query('ROLLBACK');
        throw e;
    } finally {
        client.release();
    }
}));

// ══════════════════════════════════════════════════════════════════════════
// Security
// ══════════════════════════════════════════════════════════════════════════
router.post('/change-pin', asyncHandler(async (req, res) => {
    const { current_pin, new_pin } = req.body;
    if (!new_pin) return res.status(400).json({ error: 'new_pin is required' });

    // PIN format validation
    const newStr = String(new_pin).trim();
    if (!/^\d{4,8}$/.test(newStr))
        return res.status(400).json({ error: 'PIN must be 4–8 digits' });

    const stored = process.env.PIN_HASH;
    if (stored) {
        if (!current_pin) return res.status(400).json({ error: 'current_pin is required' });
        const valid = await bcrypt.compare(String(current_pin), stored);
        if (!valid) {
            await logger.warn('settings', 'Failed PIN change attempt', null);
            return res.status(401).json({ error: 'Incorrect current PIN' });
        }
    }

    const hash = await bcrypt.hash(newStr, 10);
    await logger.info('settings', 'PIN change requested — new hash generated');
    res.json({ hash, instruction: 'Update PIN_HASH in .env then restart nucleus-api' });
}));

// ══════════════════════════════════════════════════════════════════════════
// Data Export
// ══════════════════════════════════════════════════════════════════════════
router.get('/export', asyncHandler(async (req, res) => {
    const tables = [
        'accounts', 'transactions', 'categories', 'budgets', 'financial_goals',
        'goals', 'milestones', 'life_areas', 'habits', 'habit_logs',
        'notes', 'notebooks', 'events', 'journal_entries',
        'time_projects', 'time_entries', 'payees', 'substances', 'substance_logs',
        'earl_list', 'sleep_logs', 'media_list', 'contacts_tracker', 'app_settings',
    ];
    const out = { exported_at: new Date().toISOString(), version: '4.0' };
    for (const tbl of tables) {
        try {
            const { rows } = await db.query(`SELECT * FROM ${tbl}`);
            out[tbl] = rows;
        } catch (e) {
            out[tbl] = { error: e.message };
        }
    }
    await logger.info('settings', 'Data export generated', { tables: tables.length });
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename=nucleus_export_${new Date().toISOString().split('T')[0]}.json`);
    res.json(out);
}));

// ══════════════════════════════════════════════════════════════════════════
// Life Areas CRUD
// ══════════════════════════════════════════════════════════════════════════
router.get('/life-areas', asyncHandler(async (req, res) => {
    const { rows } = await db.query(`SELECT * FROM life_areas WHERE is_deleted = false ORDER BY name`);
    res.json(rows);
}));

router.post('/life-areas', asyncHandler(async (req, res) => {
    const { name, colour, icon } = req.body;
    if (!name) return res.status(400).json({ error: 'Name required' });
    const { rows } = await db.query(
        `INSERT INTO life_areas (name, colour, icon, user_managed) VALUES ($1, $2, $3, true) RETURNING *`,
        [name, colour || '#6366f1', icon || '📌']
    );
    res.status(201).json(rows[0]);
}));

router.patch('/life-areas/:id', asyncHandler(async (req, res) => {
    const { name, colour, icon } = req.body;
    const { rows } = await db.query(
        `UPDATE life_areas SET
           name   = COALESCE($1, name),
           colour = COALESCE($2, colour),
           icon   = COALESCE($3, icon)
         WHERE id = $4 AND user_managed = true RETURNING *`,
        [name, colour, icon, req.params.id]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Not found or not user-managed' });
    res.json(rows[0]);
}));

router.delete('/life-areas/:id', asyncHandler(async (req, res) => {
    await db.query(`UPDATE life_areas SET is_deleted = true WHERE id = $1 AND user_managed = true`, [req.params.id]);
    res.status(204).end();
}));

// ══════════════════════════════════════════════════════════════════════════
// Categories CRUD
// ══════════════════════════════════════════════════════════════════════════
router.get('/categories', asyncHandler(async (req, res) => {
    const { rows } = await db.query(`SELECT * FROM categories WHERE is_deleted = false ORDER BY type, name`);
    res.json(rows);
}));

router.post('/categories', asyncHandler(async (req, res) => {
    const { name, type, colour, icon } = req.body;
    if (!name || !type) return res.status(400).json({ error: 'Name and type (income/expense) required' });
    const { rows } = await db.query(
        `INSERT INTO categories (name, type, colour, icon) VALUES ($1, $2, $3, $4) RETURNING *`,
        [name, type, colour || '#6366f1', icon || '📂']
    );
    res.status(201).json(rows[0]);
}));

router.patch('/categories/:id', asyncHandler(async (req, res) => {
    const { name, colour, icon } = req.body;
    const { rows } = await db.query(
        `UPDATE categories SET
           name   = COALESCE($1, name),
           colour = COALESCE($2, colour),
           icon   = COALESCE($3, icon)
         WHERE id = $4 AND is_deleted = false RETURNING *`,
        [name, colour, icon, req.params.id]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Not found' });
    res.json(rows[0]);
}));

router.delete('/categories/:id', asyncHandler(async (req, res) => {
    await db.query(`UPDATE categories SET is_deleted = true WHERE id = $1`, [req.params.id]);
    res.status(204).end();
}));

// ══════════════════════════════════════════════════════════════════════════
// Notebooks CRUD
// ══════════════════════════════════════════════════════════════════════════
router.get('/notebooks', asyncHandler(async (req, res) => {
    const { rows } = await db.query(`SELECT * FROM notebooks WHERE is_deleted = false ORDER BY name`);
    res.json(rows);
}));

router.post('/notebooks', asyncHandler(async (req, res) => {
    const { name, colour, icon } = req.body;
    if (!name) return res.status(400).json({ error: 'Name required' });
    const { rows } = await db.query(
        `INSERT INTO notebooks (name, colour, icon) VALUES ($1, $2, $3) RETURNING *`,
        [name, colour || '#6366f1', icon || '📓']
    );
    res.status(201).json(rows[0]);
}));

router.patch('/notebooks/:id', asyncHandler(async (req, res) => {
    const { name, colour, icon } = req.body;
    const { rows } = await db.query(
        `UPDATE notebooks SET
           name   = COALESCE($1, name),
           colour = COALESCE($2, colour),
           icon   = COALESCE($3, icon)
         WHERE id = $4 AND is_deleted = false RETURNING *`,
        [name, colour, icon, req.params.id]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Not found' });
    res.json(rows[0]);
}));

router.delete('/notebooks/:id', asyncHandler(async (req, res) => {
    await db.query(`UPDATE notebooks SET is_deleted = true WHERE id = $1`, [req.params.id]);
    res.status(204).end();
}));

// ══════════════════════════════════════════════════════════════════════════
// Logs Viewer
// ══════════════════════════════════════════════════════════════════════════
router.get('/logs', asyncHandler(async (req, res) => {
    const { level, module, limit = 200, offset = 0 } = req.query;
    let sql = `SELECT id, level, module, message, meta, created_at FROM app_logs WHERE 1=1`;
    const params = [];
    if (level)  { sql += ` AND level = $${params.length + 1}`;  params.push(level); }
    if (module) { sql += ` AND module = $${params.length + 1}`; params.push(module); }
    sql += ` ORDER BY created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    params.push(Math.min(parseInt(limit, 10) || 200, 1000), parseInt(offset, 10) || 0);
    const { rows } = await db.query(sql, params);
    const { rows: countRows } = await db.query(`SELECT COUNT(*) FROM app_logs`);
    res.json({ logs: rows, total: parseInt(countRows[0].count) });
}));

// Purge logs older than N days (default 30)
router.delete('/logs', asyncHandler(async (req, res) => {
    const days = parseInt(req.query.older_than_days, 10) || 30;
    const { rowCount } = await db.query(
        `DELETE FROM app_logs WHERE created_at < NOW() - ($1 || ' days')::INTERVAL`,
        [days]
    );
    await logger.info('settings', `Purged ${rowCount} logs older than ${days} days`);
    res.json({ deleted: rowCount });
}));

module.exports = router;
