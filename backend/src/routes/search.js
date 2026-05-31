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
    const [notes, goals, txns, events, journal, habits, payees, substances] = await Promise.allSettled([
        db.query(
            `SELECT id, title AS text, 'note' AS type, updated_at AS date
             FROM notes
             WHERE title ILIKE $1 OR content ILIKE $1
             ORDER BY updated_at DESC LIMIT 8`,
            [term]
        ),
        db.query(
            `SELECT id, title AS text, 'goal' AS type, created_at AS date
             FROM goals
             WHERE title ILIKE $1 OR description ILIKE $1
             ORDER BY created_at DESC LIMIT 8`,
            [term]
        ),
        db.query(
            `SELECT id, COALESCE(description, merchant) AS text, 'transaction' AS type, date
             FROM transactions
             WHERE description ILIKE $1 OR merchant ILIKE $1
             ORDER BY date DESC LIMIT 8`,
            [term]
        ),
        db.query(
            `SELECT id, title AS text, 'event' AS type, start_time AS date
             FROM events
             WHERE title ILIKE $1 OR description ILIKE $1
             ORDER BY start_time DESC LIMIT 8`,
            [term]
        ),
        db.query(
            `SELECT id, LEFT(content, 120) AS text, 'journal' AS type, date
             FROM journal_entries
             WHERE content ILIKE $1
             ORDER BY date DESC LIMIT 8`,
            [term]
        ),
        db.query(
            `SELECT id, name AS text, 'habit' AS type, created_at AS date
             FROM habits
             WHERE (name ILIKE $1 OR description ILIKE $1) AND active = true
             ORDER BY created_at DESC LIMIT 8`,
            [term]
        ),
        db.query(
            `SELECT id, name AS text, 'payee' AS type, created_at AS date
             FROM payees
             WHERE name ILIKE $1 OR notes ILIKE $1
             ORDER BY created_at DESC LIMIT 8`,
            [term]
        ),
        db.query(
            `SELECT id, name AS text, 'substance' AS type, created_at AS date
             FROM substances
             WHERE (name ILIKE $1 OR notes ILIKE $1) AND active = true
             ORDER BY created_at DESC LIMIT 8`,
            [term]
        ),
    ]);

    const results = [
        ...(notes.value?.rows      || []),
        ...(goals.value?.rows      || []),
        ...(txns.value?.rows       || []),
        ...(events.value?.rows     || []),
        ...(journal.value?.rows    || []),
        ...(habits.value?.rows     || []),
        ...(payees.value?.rows     || []),
        ...(substances.value?.rows || []),
    ];
    res.json({ results });
}));

module.exports = router;
