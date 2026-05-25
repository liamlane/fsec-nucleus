const db = require('../db/pool');

async function log(level, module, message, meta = null) {
    try {
        await db.query(
            `INSERT INTO app_logs (level, module, message, meta) VALUES ($1, $2, $3, $4)`,
            [level, module, message, meta ? JSON.stringify(meta) : null]
        );
    } catch (err) {
        console.error('Failed to write log to DB:', err.message);
    }
}

// Convenience methods
const info = (module, message, meta) => log('info', module, message, meta);
const warn = (module, message, meta) => log('warn', module, message, meta);
const error = (module, message, meta) => log('error', module, message, meta);

module.exports = { log, info, warn, error };