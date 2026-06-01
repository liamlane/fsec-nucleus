const express = require('express');
const router  = express.Router();
const db      = require('../db/pool');

const asyncHandler = fn => (req, res, next) =>
    Promise.resolve(fn(req, res, next)).catch(next);

router.get('/', asyncHandler(async (req, res) => {
    const { q } = req.query;
    if (!q || q.length < 2)   return res.json({ results: [] });
    if (q.length > 100)       return res.status(400).json({ error: 'query too long' });

    const term = `%${q}%`;
    const queries = [
        // Personal
        db.query(`SELECT id, title AS text, 'note' AS type, updated_at AS date FROM notes WHERE title ILIKE $1 OR content ILIKE $1 ORDER BY updated_at DESC LIMIT 5`, [term]),
        db.query(`SELECT id, title AS text, 'goal' AS type, created_at AS date FROM goals WHERE title ILIKE $1 OR description ILIKE $1 ORDER BY created_at DESC LIMIT 5`, [term]),
        db.query(`SELECT id, COALESCE(description, merchant) AS text, 'transaction' AS type, date FROM transactions WHERE description ILIKE $1 OR merchant ILIKE $1 ORDER BY date DESC LIMIT 5`, [term]),
        db.query(`SELECT id, title AS text, 'event' AS type, start_time AS date FROM events WHERE title ILIKE $1 OR description ILIKE $1 ORDER BY start_time DESC LIMIT 5`, [term]),
        db.query(`SELECT id, LEFT(content, 120) AS text, 'journal' AS type, date FROM journal_entries WHERE content ILIKE $1 ORDER BY date DESC LIMIT 5`, [term]),
        db.query(`SELECT id, name AS text, 'habit' AS type, created_at AS date FROM habits WHERE (name ILIKE $1 OR description ILIKE $1) AND active=true ORDER BY created_at DESC LIMIT 5`, [term]),
        db.query(`SELECT id, name AS text, 'payee' AS type, created_at AS date FROM payees WHERE name ILIKE $1 OR notes ILIKE $1 ORDER BY created_at DESC LIMIT 5`, [term]),
        db.query(`SELECT id, name AS text, 'substance' AS type, created_at AS date FROM substances WHERE (name ILIKE $1 OR notes ILIKE $1) AND active=true ORDER BY created_at DESC LIMIT 5`, [term]),
        // Business
        db.query(`SELECT id, COALESCE(company, name) AS text, 'client' AS type, created_at AS date FROM business_clients WHERE (name ILIKE $1 OR company ILIKE $1 OR email ILIKE $1 OR notes ILIKE $1) AND is_deleted=false ORDER BY created_at DESC LIMIT 5`, [term]),
        db.query(`SELECT id, name AS text, 'project' AS type, created_at AS date FROM business_projects WHERE (name ILIKE $1 OR description ILIKE $1) AND is_deleted=false ORDER BY created_at DESC LIMIT 5`, [term]),
        db.query(`SELECT id, invoice_number AS text, 'invoice' AS type, issue_date AS date FROM business_invoices WHERE invoice_number ILIKE $1 OR notes ILIKE $1 ORDER BY issue_date DESC LIMIT 5`, [term]),
        db.query(`SELECT id, quote_number AS text, 'quote' AS type, issue_date AS date FROM business_quotes WHERE quote_number ILIKE $1 OR notes ILIKE $1 ORDER BY issue_date DESC LIMIT 5`, [term]),
        db.query(`SELECT id, description AS text, 'expense' AS type, date FROM business_expenses WHERE description ILIKE $1 OR notes ILIKE $1 ORDER BY date DESC LIMIT 5`, [term]),
        // Marketing
        db.query(`SELECT id, LEFT(content, 100) AS text, 'social_post' AS type, COALESCE(scheduled_for, posted_at, created_at) AS date FROM social_posts WHERE content ILIKE $1 ORDER BY date DESC LIMIT 5`, [term]),
        db.query(`SELECT id, title AS text, 'idea' AS type, created_at AS date FROM content_ideas WHERE title ILIKE $1 OR notes ILIKE $1 ORDER BY created_at DESC LIMIT 5`, [term]),
        db.query(`SELECT id, name AS text, 'campaign' AS type, created_at AS date FROM marketing_campaigns WHERE name ILIKE $1 OR description ILIKE $1 ORDER BY created_at DESC LIMIT 5`, [term]),
        // Trackers
        db.query(`SELECT id, title AS text, 'media' AS type, created_at AS date FROM media_list WHERE title ILIKE $1 OR notes ILIKE $1 ORDER BY created_at DESC LIMIT 5`, [term]),
        db.query(`SELECT id, name AS text, 'contact' AS type, COALESCE(last_contacted::TIMESTAMPTZ, NOW()) AS date FROM contacts_tracker WHERE name ILIKE $1 OR relationship ILIKE $1 ORDER BY name LIMIT 5`, [term]),
    ];

    const results = await Promise.allSettled(queries);
    const flat = results.flatMap(r => r.status === 'fulfilled' ? r.value.rows : []);
    res.json({ results: flat });
}));

module.exports = router;
