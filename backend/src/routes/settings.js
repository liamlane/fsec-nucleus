const express = require('express');
const router = express.Router();
const db = require('../db/pool');
const bcrypt = require('bcryptjs');
const { info, error } = require('../utils/logger');

// ==================== App Settings ====================
router.get('/preferences', async (req, res) => {
    const { rows } = await db.query(`SELECT key, value FROM app_settings`);
    const prefs = Object.fromEntries(rows.map(r => [r.key, r.value]));
    res.json(prefs);
});

router.patch('/preferences', async (req, res) => {
    for (const [key, value] of Object.entries(req.body)) {
        await db.query(
            `INSERT INTO app_settings (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = $2`,
            [key, value]
        );
    }
    await info('settings', 'App preferences updated', req.body);
    res.json({ ok: true });
});

// ==================== PIN Change ====================
router.post('/change-pin', async (req, res) => {
    const { current_pin, new_pin } = req.body;
    const stored = process.env.PIN_HASH;
    if (stored) {
        const valid = await bcrypt.compare(String(current_pin), stored);
        if (!valid) return res.status(401).json({ error: 'Incorrect current PIN' });
    }
    const hash = await bcrypt.hash(String(new_pin), 10);
    await info('security', 'PIN changed successfully');
    res.json({ hash, instruction: 'Update PIN_HASH in .env then restart nucleus-api' });
});

// ==================== Data Export ====================
router.get('/export', async (req, res) => {
    const tables = [
        'accounts', 'transactions', 'categories', 'budgets', 'financial_goals',
        'goals', 'milestones', 'life_areas', 'habits', 'habit_logs', 'notes', 'notebooks',
        'events', 'journal_entries', 'time_projects', 'time_entries', 'payees',
        'substances', 'substance_logs', 'earl_list', 'sleep_logs', 'media_list', 'contacts_tracker'
    ];
    const out = {};
    for (const tbl of tables) {
        const { rows } = await db.query(`SELECT * FROM ${tbl} ORDER BY created_at ASC NULLS LAST`).catch(() => ({ rows: [] }));
        out[tbl] = rows;
    }
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename=nucleus_export_${new Date().toISOString().split('T')[0]}.json`);
    res.json(out);
});

// ==================== Log Viewer ====================
router.get('/logs', async (req, res) => {
    const { level, module, limit = 200, offset = 0 } = req.query;
    let sql = `SELECT id, level, module, message, meta, created_at FROM app_logs WHERE 1=1`;
    const params = [];
    if (level) {
        sql += ` AND level = $${params.length + 1}`;
        params.push(level);
    }
    if (module) {
        sql += ` AND module = $${params.length + 1}`;
        params.push(module);
    }
    sql += ` ORDER BY created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    params.push(parseInt(limit), parseInt(offset));
    const { rows } = await db.query(sql, params);
    const { rows: countRows } = await db.query(`SELECT COUNT(*) FROM app_logs`);
    res.json({ logs: rows, total: parseInt(countRows[0].count) });
});

// ==================== Reference Data CRUD ====================
// Life Areas
router.get('/life-areas', async (req, res) => {
    const { rows } = await db.query(`SELECT * FROM life_areas WHERE is_deleted = false ORDER BY name`);
    res.json(rows);
});
router.post('/life-areas', async (req, res) => {
    const { name, colour, icon } = req.body;
    if (!name) return res.status(400).json({ error: 'Name required' });
    const { rows } = await db.query(
        `INSERT INTO life_areas (name, colour, icon, user_managed) VALUES ($1, $2, $3, true) RETURNING *`,
        [name, colour || '#6366f1', icon || '📌']
    );
    await info('settings', `Life area created: ${name}`);
    res.status(201).json(rows[0]);
});
router.patch('/life-areas/:id', async (req, res) => {
    const { name, colour, icon } = req.body;
    const { rows } = await db.query(
        `UPDATE life_areas SET name = COALESCE($1, name), colour = COALESCE($2, colour), icon = COALESCE($3, icon) WHERE id = $4 AND user_managed = true RETURNING *`,
        [name, colour, icon, req.params.id]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Not found or not user-managed' });
    res.json(rows[0]);
});
router.delete('/life-areas/:id', async (req, res) => {
    const { rows } = await db.query(`UPDATE life_areas SET is_deleted = true WHERE id = $1 AND user_managed = true RETURNING id`, [req.params.id]);
    if (rows.length === 0) return res.status(404).json({ error: 'Not found or not user-managed' });
    res.status(204).end();
});

// Categories (similar pattern, include `type` for income/expense)
router.get('/categories', async (req, res) => {
    const { rows } = await db.query(`SELECT * FROM categories WHERE is_deleted = false ORDER BY type, name`);
    res.json(rows);
});
router.post('/categories', async (req, res) => {
    const { name, type, colour, icon } = req.body;
    if (!name || !type) return res.status(400).json({ error: 'Name and type required' });
    const { rows } = await db.query(
        `INSERT INTO categories (name, type, colour, icon) VALUES ($1, $2, $3, $4) RETURNING *`,
        [name, type, colour || '#6366f1', icon || '📂']
    );
    await info('settings', `Category created: ${name} (${type})`);
    res.status(201).json(rows[0]);
});
router.patch('/categories/:id', async (req, res) => {
    const { name, colour, icon } = req.body;
    const { rows } = await db.query(
        `UPDATE categories SET name = COALESCE($1, name), colour = COALESCE($2, colour), icon = COALESCE($3, icon) WHERE id = $4 AND is_deleted = false RETURNING *`,
        [name, colour, icon, req.params.id]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Not found' });
    res.json(rows[0]);
});
router.delete('/categories/:id', async (req, res) => {
    await db.query(`UPDATE categories SET is_deleted = true WHERE id = $1`, [req.params.id]);
    res.status(204).end();
});

// Notebooks (same pattern)
router.get('/notebooks', async (req, res) => {
    const { rows } = await db.query(`SELECT * FROM notebooks WHERE is_deleted = false ORDER BY name`);
    res.json(rows);
});
router.post('/notebooks', async (req, res) => {
    const { name, colour, icon } = req.body;
    if (!name) return res.status(400).json({ error: 'Name required' });
    const { rows } = await db.query(
        `INSERT INTO notebooks (name, colour, icon) VALUES ($1, $2, $3) RETURNING *`,
        [name, colour || '#6366f1', icon || '📓']
    );
    await info('settings', `Notebook created: ${name}`);
    res.status(201).json(rows[0]);
});
router.patch('/notebooks/:id', async (req, res) => {
    const { name, colour, icon } = req.body;
    const { rows } = await db.query(
        `UPDATE notebooks SET name = COALESCE($1, name), colour = COALESCE($2, colour), icon = COALESCE($3, icon) WHERE id = $4 AND is_deleted = false RETURNING *`,
        [name, colour, icon, req.params.id]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Not found' });
    res.json(rows[0]);
});
router.delete('/notebooks/:id', async (req, res) => {
    await db.query(`UPDATE notebooks SET is_deleted = true WHERE id = $1`, [req.params.id]);
    res.status(204).end();
});

module.exports = router;