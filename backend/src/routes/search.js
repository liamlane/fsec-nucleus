const express = require('express');
const router = express.Router();
const db = require('../db/pool');

router.get('/', async (req, res) => {
    const { q } = req.query;
    if (!q || q.length < 2) return res.json({ results: [] });

    const term = `%${q}%`;
    const [notes, goals, txns, events, journal] = await Promise.allSettled([
        db.query(`SELECT id, title as text, 'note' as type, updated_at as date FROM notes WHERE title ILIKE $1 OR content ILIKE $1 LIMIT 8`, [term]),
        db.query(`SELECT id, title as text, 'goal' as type, created_at as date FROM goals WHERE title ILIKE $1 OR description ILIKE $1 LIMIT 8`, [term]),
        db.query(`SELECT id, COALESCE(description, merchant) as text, 'transaction' as type, date FROM transactions WHERE description ILIKE $1 OR merchant ILIKE $1 LIMIT 8`, [term]),
        db.query(`SELECT id, title as text, 'event' as type, start_time as date FROM events WHERE title ILIKE $1 LIMIT 8`, [term]),
        db.query(`SELECT id, content as text, 'journal' as type, date FROM journal_entries WHERE content ILIKE $1 LIMIT 8`, [term]),
    ]);

    const results = [
        ...(notes.value?.rows || []),
        ...(goals.value?.rows || []),
        ...(txns.value?.rows || []),
        ...(events.value?.rows || []),
        ...(journal.value?.rows || []),
    ];
    res.json({ results });
});

module.exports = router;