const express    = require('express');
const cors       = require('cors');
const helmet     = require('helmet');
const rateLimit  = require('express-rate-limit');
const cron       = require('node-cron');
const path       = require('path');
const migrate    = require('node-pg-migrate').default;

const { router: authRouter, requireAuth } = require('./middleware/auth');
const financeRouter   = require('./routes/finance');
const goalsRouter     = require('./routes/goals');
const habitsRouter    = require('./routes/habits');
const contentRouter   = require('./routes/content');
const searchRouter    = require('./routes/search');
const settingsRouter  = require('./routes/settings');
const businessRouter  = require('./routes/business');
const trackersRouter  = require('./routes/trackers');
const marketingRouter = require('./routes/marketing');
const logger         = require('./utils/logger');
const db             = require('./db/pool');

const app = express();

app.use(helmet({ contentSecurityPolicy: false, crossOriginEmbedderPolicy: false }));

const ALLOWED = (process.env.ALLOWED_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean);
app.use(cors({
    origin: (origin, cb) => {
        if (!origin) return cb(null, true);
        if (ALLOWED.length === 0) return cb(null, true);
        if (ALLOWED.includes(origin)) return cb(null, true);
        cb(new Error(`CORS: origin ${origin} not permitted`));
    },
    methods: ['GET','POST','PATCH','DELETE','OPTIONS'],
    allowedHeaders: ['Content-Type','Authorization'],
}));

app.use(express.json({ limit: '2mb' }));

if (process.env.LOG_REQUESTS === 'true') {
    app.use((req, res, next) => { logger.info('http', `${req.method} ${req.path}`, { ip: req.ip }); next(); });
}

const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, max: 20,
    standardHeaders: true, legacyHeaders: false,
    message: { error: 'Too many attempts — try again in 15 minutes' },
    skipSuccessfulRequests: true,
});
app.use('/auth', authLimiter);

app.get('/health', (req, res) => res.json({ status: 'ok', ts: new Date() }));

app.use('/auth', authRouter);

app.use('/finance',   requireAuth, financeRouter);
app.use('/goals',     requireAuth, goalsRouter);
app.use('/habits',    requireAuth, habitsRouter);
app.use('/search',    requireAuth, searchRouter);
app.use('/settings',  requireAuth, settingsRouter);
app.use('/business',  requireAuth, businessRouter);
app.use('/trackers',  requireAuth, trackersRouter);
app.use('/marketing', requireAuth, marketingRouter);
app.use('/',          requireAuth, contentRouter);

app.use((err, req, res, next) => {  // eslint-disable-line no-unused-vars
    console.error(`[${new Date().toISOString()}] ${req.method} ${req.path}`, err.stack);
    const status = err.status || err.statusCode || 500;
    const message = process.env.NODE_ENV === 'production' ? 'Internal server error' : (err.message || 'Internal server error');
    res.status(status).json({ error: message });
});

// ── Scheduled jobs ────────────────────────────────────────────────────────
// Weekly log purge (Sun 03:00) — drops logs older than 30 days.
cron.schedule('0 3 * * 0', async () => {
    try {
        const { rowCount } = await db.query(`DELETE FROM app_logs WHERE created_at < NOW() - INTERVAL '30 days'`);
        await logger.info('cron', `Weekly log purge: removed ${rowCount} old log entries`);
    } catch (e) { console.error('[cron] log purge failed:', e.message); }
});

// Daily 00:10 — promote 'sent' invoices to 'overdue' if past due date.
cron.schedule('10 0 * * *', async () => {
    try {
        const { rowCount } = await db.query(`UPDATE business_invoices SET status='overdue' WHERE status='sent' AND due_date < CURRENT_DATE`);
        if (rowCount > 0) await logger.info('cron', `Marked ${rowCount} invoice(s) overdue`);
    } catch (e) { console.error('[cron] overdue check failed:', e.message); }
});

// Daily 00:15 — expire quotes past their valid_until date.
cron.schedule('15 0 * * *', async () => {
    try {
        const { rowCount } = await db.query(`UPDATE business_quotes SET status='expired' WHERE status IN ('draft','sent') AND valid_until IS NOT NULL AND valid_until < CURRENT_DATE`);
        if (rowCount > 0) await logger.info('cron', `Expired ${rowCount} quote(s)`);
    } catch (e) { console.error('[cron] quote expiry failed:', e.message); }
});

// ── Migration runner ──────────────────────────────────────────────────────
// Runs at startup before the HTTP server binds. Idempotent — if nothing is
// pending, this is a sub-second no-op.
async function runMigrations() {
    console.log('[migrate] Checking for pending migrations...');
    try {
        const applied = await migrate({
            databaseUrl: {
                host:     process.env.POSTGRES_HOST || 'postgres',
                port:     parseInt(process.env.POSTGRES_PORT || '5432', 10),
                database: process.env.POSTGRES_DB,
                user:     process.env.POSTGRES_USER,
                password: process.env.POSTGRES_PASSWORD,
            },
            dir:             path.join(__dirname, '..', 'migrations'),
            direction:       'up',
            migrationsTable: 'pgmigrations',
            log:             (msg) => console.log(`[migrate] ${msg}`),
            // Skip JS files — we standardise on SQL migrations
            singleTransaction: true,
        });
        console.log(`[migrate] Done. Applied ${Array.isArray(applied) ? applied.length : 0} migration(s).`);
    } catch (e) {
        console.error('[migrate] FATAL: migration failed:', e.message);
        console.error('[migrate] Backend will not start. Inspect the DB and pgmigrations table before retrying.');
        process.exit(1);
    }
}

// ── Startup ───────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3001;

(async () => {
    await runMigrations();
    app.listen(PORT, () => {
        console.log(`Nucleus API running on :${PORT}`);
        logger.info('startup', `Nucleus API started on port ${PORT}`).catch(() => {});
    });
})();
