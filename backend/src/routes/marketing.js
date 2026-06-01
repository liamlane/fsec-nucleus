const express = require('express');
const router  = express.Router();
const db      = require('../db/pool');

const asyncHandler = fn => (req, res, next) =>
    Promise.resolve(fn(req, res, next)).catch(next);

const clip = (v, max = 500) => v == null ? v : String(v).slice(0, max);

// ══════════════════════════════════════════════════════════════════════════
// CAMPAIGNS
// ══════════════════════════════════════════════════════════════════════════
router.get('/campaigns', asyncHandler(async (req, res) => {
    const { rows } = await db.query(`
        SELECT c.*,
            (SELECT COUNT(*) FROM social_posts p WHERE p.campaign_id = c.id) AS post_count,
            (SELECT COUNT(*) FROM social_posts p WHERE p.campaign_id = c.id AND p.status = 'posted') AS posted_count
        FROM marketing_campaigns c
        ORDER BY c.created_at DESC
    `);
    res.json(rows);
}));

router.post('/campaigns', asyncHandler(async (req, res) => {
    const { name, description, goal, start_date, end_date, status, colour } = req.body;
    if (!name) return res.status(400).json({ error: 'name required' });
    const { rows } = await db.query(
        `INSERT INTO marketing_campaigns (name, description, goal, start_date, end_date, status, colour)
         VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
        [clip(name), clip(description, 2000), clip(goal, 500),
         start_date || null, end_date || null, status || 'planning', colour || '#6366f1']
    );
    res.status(201).json(rows[0]);
}));

router.patch('/campaigns/:id', asyncHandler(async (req, res) => {
    const fields = ['name','description','goal','start_date','end_date','status','colour'];
    const updates = fields.filter(f => req.body[f] !== undefined);
    if (!updates.length) return res.status(400).json({ error: 'No fields to update' });
    const sets = updates.map((f, i) => `${f}=$${i + 1}`).join(',');
    const { rows } = await db.query(
        `UPDATE marketing_campaigns SET ${sets} WHERE id=$${updates.length + 1} RETURNING *`,
        [...updates.map(f => req.body[f]), req.params.id]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Campaign not found' });
    res.json(rows[0]);
}));

router.delete('/campaigns/:id', asyncHandler(async (req, res) => {
    await db.query('DELETE FROM marketing_campaigns WHERE id=$1', [req.params.id]);
    res.status(204).end();
}));

// ══════════════════════════════════════════════════════════════════════════
// POSTS
// ══════════════════════════════════════════════════════════════════════════
router.get('/posts', asyncHandler(async (req, res) => {
    const { status, platform, campaign_id, from, to } = req.query;
    let q = `
        SELECT p.*, c.name AS campaign_name, c.colour AS campaign_colour
        FROM social_posts p
        LEFT JOIN marketing_campaigns c ON c.id = p.campaign_id
        WHERE 1=1
    `;
    const params = [];
    let i = 1;
    if (status)      { q += ` AND p.status=$${i++}`;        params.push(status); }
    if (platform)    { q += ` AND p.platform=$${i++}`;      params.push(platform); }
    if (campaign_id) { q += ` AND p.campaign_id=$${i++}`;   params.push(campaign_id); }
    if (from)        { q += ` AND COALESCE(p.scheduled_for, p.posted_at, p.created_at) >= $${i++}`; params.push(from); }
    if (to)          { q += ` AND COALESCE(p.scheduled_for, p.posted_at, p.created_at) <= $${i++}`; params.push(to); }
    q += ` ORDER BY
        CASE p.status
            WHEN 'scheduled' THEN 1
            WHEN 'drafted'   THEN 2
            WHEN 'idea'      THEN 3
            WHEN 'posted'    THEN 4
            ELSE 5
        END,
        COALESCE(p.scheduled_for, p.created_at) DESC`;
    const { rows } = await db.query(q, params);
    res.json(rows);
}));

router.post('/posts', asyncHandler(async (req, res) => {
    const { campaign_id, platform, content, hashtags, status, scheduled_for, post_url, notes } = req.body;
    if (!platform || !content) return res.status(400).json({ error: 'platform and content required' });
    const { rows } = await db.query(
        `INSERT INTO social_posts (campaign_id, platform, content, hashtags, status, scheduled_for, post_url, notes)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
        [campaign_id || null, platform, clip(content, 10000), hashtags || [],
         status || 'idea', scheduled_for || null, clip(post_url, 500), clip(notes, 2000)]
    );
    res.status(201).json(rows[0]);
}));

router.patch('/posts/:id', asyncHandler(async (req, res) => {
    const fields = ['campaign_id','platform','content','hashtags','status','scheduled_for','posted_at','post_url','engagement_likes','engagement_comments','engagement_shares','notes'];
    const updates = fields.filter(f => req.body[f] !== undefined);
    if (!updates.length) return res.status(400).json({ error: 'No fields to update' });

    // Auto-stamp posted_at when transitioning to 'posted' if not provided
    if (req.body.status === 'posted' && !req.body.posted_at) {
        if (!updates.includes('posted_at')) updates.push('posted_at');
        req.body.posted_at = new Date().toISOString();
    }

    const sets = updates.map((f, i) => `${f}=$${i + 1}`).join(',');
    const { rows } = await db.query(
        `UPDATE social_posts SET ${sets}, updated_at=NOW() WHERE id=$${updates.length + 1} RETURNING *`,
        [...updates.map(f => req.body[f]), req.params.id]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Post not found' });
    res.json(rows[0]);
}));

router.delete('/posts/:id', asyncHandler(async (req, res) => {
    await db.query('DELETE FROM social_posts WHERE id=$1', [req.params.id]);
    res.status(204).end();
}));

// Calendar/timeline of scheduled + posted in a date range
router.get('/posts/calendar', asyncHandler(async (req, res) => {
    const { from, to } = req.query;
    const start = from || new Date().toISOString().split('T')[0];
    const end   = to || new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0];
    const { rows } = await db.query(`
        SELECT p.*, c.name AS campaign_name, c.colour AS campaign_colour
        FROM social_posts p
        LEFT JOIN marketing_campaigns c ON c.id = p.campaign_id
        WHERE (p.status='scheduled' AND p.scheduled_for BETWEEN $1 AND $2)
           OR (p.status='posted'    AND p.posted_at    BETWEEN $1 AND $2)
        ORDER BY COALESCE(p.scheduled_for, p.posted_at)
    `, [start, end]);
    res.json(rows);
}));

// ══════════════════════════════════════════════════════════════════════════
// TEMPLATES
// ══════════════════════════════════════════════════════════════════════════
router.get('/templates', asyncHandler(async (req, res) => {
    const { rows } = await db.query(`SELECT * FROM post_templates ORDER BY category, name`);
    res.json(rows);
}));

router.post('/templates', asyncHandler(async (req, res) => {
    const { name, category, template, platforms, notes } = req.body;
    if (!name || !template) return res.status(400).json({ error: 'name and template required' });
    const { rows } = await db.query(
        `INSERT INTO post_templates (name, category, template, platforms, notes)
         VALUES ($1,$2,$3,$4,$5) RETURNING *`,
        [clip(name), clip(category), clip(template, 10000), platforms || [], clip(notes, 2000)]
    );
    res.status(201).json(rows[0]);
}));

router.patch('/templates/:id', asyncHandler(async (req, res) => {
    const fields = ['name','category','template','platforms','notes'];
    const updates = fields.filter(f => req.body[f] !== undefined);
    if (!updates.length) return res.status(400).json({ error: 'No fields to update' });
    const sets = updates.map((f, i) => `${f}=$${i + 1}`).join(',');
    const { rows } = await db.query(
        `UPDATE post_templates SET ${sets} WHERE id=$${updates.length + 1} RETURNING *`,
        [...updates.map(f => req.body[f]), req.params.id]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Template not found' });
    res.json(rows[0]);
}));

router.delete('/templates/:id', asyncHandler(async (req, res) => {
    await db.query('DELETE FROM post_templates WHERE id=$1', [req.params.id]);
    res.status(204).end();
}));

// Generator endpoint — server-side variable substitution.
// The frontend can also do this client-side; this exists for API consumers.
router.post('/generate', asyncHandler(async (req, res) => {
    const { template_id, variables } = req.body;
    if (!template_id) return res.status(400).json({ error: 'template_id required' });
    const { rows } = await db.query('SELECT * FROM post_templates WHERE id=$1', [template_id]);
    if (!rows[0]) return res.status(404).json({ error: 'Template not found' });

    let output = rows[0].template;
    for (const [key, value] of Object.entries(variables || {})) {
        output = output.split(`{${key}}`).join(value);
    }
    // Find any unfilled placeholders
    const unfilled = [...output.matchAll(/\{(\w+)\}/g)].map(m => m[1]);
    res.json({ content: output, template: rows[0], unfilled });
}));

// ══════════════════════════════════════════════════════════════════════════
// IDEAS
// ══════════════════════════════════════════════════════════════════════════
router.get('/ideas', asyncHandler(async (req, res) => {
    const { used } = req.query;
    let q = 'SELECT * FROM content_ideas WHERE 1=1';
    const params = [];
    if (used != null) { q += ' AND used = $1'; params.push(used === 'true'); }
    q += ` ORDER BY used ASC,
        CASE priority WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END,
        created_at DESC`;
    const { rows } = await db.query(q, params);
    res.json(rows);
}));

router.post('/ideas', asyncHandler(async (req, res) => {
    const { title, notes, tags, priority } = req.body;
    if (!title) return res.status(400).json({ error: 'title required' });
    const { rows } = await db.query(
        `INSERT INTO content_ideas (title, notes, tags, priority)
         VALUES ($1,$2,$3,$4) RETURNING *`,
        [clip(title), clip(notes, 2000), tags || [], priority || 'medium']
    );
    res.status(201).json(rows[0]);
}));

router.patch('/ideas/:id', asyncHandler(async (req, res) => {
    const fields = ['title','notes','tags','priority','used'];
    const updates = fields.filter(f => req.body[f] !== undefined);
    if (!updates.length) return res.status(400).json({ error: 'No fields to update' });
    const sets = updates.map((f, i) => `${f}=$${i + 1}`).join(',');
    const { rows } = await db.query(
        `UPDATE content_ideas SET ${sets} WHERE id=$${updates.length + 1} RETURNING *`,
        [...updates.map(f => req.body[f]), req.params.id]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Idea not found' });
    res.json(rows[0]);
}));

router.delete('/ideas/:id', asyncHandler(async (req, res) => {
    await db.query('DELETE FROM content_ideas WHERE id=$1', [req.params.id]);
    res.status(204).end();
}));

// ══════════════════════════════════════════════════════════════════════════
// DASHBOARD
// ══════════════════════════════════════════════════════════════════════════
router.get('/dashboard', asyncHandler(async (req, res) => {
    const [counts, upcoming, recent, platforms] = await Promise.all([
        db.query(`SELECT status, COUNT(*) AS count FROM social_posts GROUP BY status`),
        db.query(`SELECT * FROM social_posts WHERE status='scheduled' AND scheduled_for >= NOW()
                  ORDER BY scheduled_for ASC LIMIT 5`),
        db.query(`SELECT * FROM social_posts WHERE status='posted' ORDER BY posted_at DESC LIMIT 5`),
        db.query(`SELECT platform, COUNT(*) AS count FROM social_posts WHERE status='posted' GROUP BY platform`),
    ]);
    res.json({
        status_counts:   counts.rows.reduce((a, r) => ({ ...a, [r.status]: parseInt(r.count) }), {}),
        platform_counts: platforms.rows.reduce((a, r) => ({ ...a, [r.platform]: parseInt(r.count) }), {}),
        upcoming:        upcoming.rows,
        recent:          recent.rows,
    });
}));

module.exports = router;
