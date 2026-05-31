const db = require('../db/pool');

// Writes to console (for Docker logs) AND to the app_logs table (for in-app viewer).
// DB write is fire-and-forget so a DB outage never breaks logging.
async function log(level, module, message, meta = null) {
    const ts = new Date().toISOString();
    const out = `[${ts}] [${level.toUpperCase()}] [${module}] ${message}`;
    const fn  = level === 'error' ? console.error
              : level === 'warn'  ? console.warn
              : console.log;
    fn(out, meta ? JSON.stringify(meta) : '');

    try {
        await db.query(
            `INSERT INTO app_logs (level, module, message, meta) VALUES ($1, $2, $3, $4)`,
            [level, module, message, meta ? JSON.stringify(meta) : null]
        );
    } catch (err) {
        console.error('[logger] DB write failed:', err.message);
    }
}

const info  = (module, message, meta) => log('info',  module, message, meta);
const warn  = (module, message, meta) => log('warn',  module, message, meta);
const error = (module, message, meta) => log('error', module, message, meta);
const debug = (module, message, meta) => log('debug', module, message, meta);

module.exports = { log, info, warn, error, debug };
