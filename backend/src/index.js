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
const debtsRouter     = require('./routes/debts');
const ticketsRouter   = require('./routes/tickets');
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
app.use('/debts',     requireAuth, debtsRouter);
app.use('/tickets',   requireAuth, ticketsRouter);
app.use('/',          requireAuth, contentRouter);

app.use((err, req, res, next) => {  // eslint-disable-line no-unused-vars
    console.error(`[${new Date().toISOString()}] ${req.method} ${req.path}`, err.stack);
    const status = err.status || err.statusCode || 500;
    const message = process.env.NODE_ENV === 'production' ? 'Internal server error' : (err.message || 'Internal server error');
    res.status(status).json({ error: message });
});

// ══════════════════════════════════════════════════════════════════════════
// Scheduled jobs
// ══════════════════════════════════════════════════════════════════════════
cron.schedule('0 3 * * 0', async () => {
    try {
        const { rowCount } = await db.query(`DELETE FROM app_logs WHERE created_at < NOW() - INTERVAL '30 days'`);
        await logger.info('cron', `Weekly log purge: removed ${rowCount} old log entries`);
    } catch (e) { console.error('[cron] log purge failed:', e.message); }
});

cron.schedule('10 0 * * *', async () => {
    try {
        const { rowCount } = await db.query(`UPDATE business_invoices SET status='overdue' WHERE status='sent' AND due_date < CURRENT_DATE`);
        if (rowCount > 0) await logger.info('cron', `Marked ${rowCount} invoice(s) overdue`);
    } catch (e) { console.error('[cron] overdue check failed:', e.message); }
});

cron.schedule('15 0 * * *', async () => {
    try {
        const { rowCount } = await db.query(`UPDATE business_quotes SET status='expired' WHERE status IN ('draft','sent') AND valid_until IS NOT NULL AND valid_until < CURRENT_DATE`);
        if (rowCount > 0) await logger.info('cron', `Expired ${rowCount} quote(s)`);
    } catch (e) { console.error('[cron] quote expiry failed:', e.message); }
});

// Daily 09:00 — payment reminder cron
cron.schedule('0 9 * * *', async () => {
    try {
        const { rows: overdue } = await db.query(`
            SELECT i.id, i.due_date, i.client_id,
                   i.reminder_1_sent_at, i.reminder_2_sent_at, i.reminder_3_sent_at,
                   c.email AS client_email
            FROM business_invoices i
            LEFT JOIN business_clients c ON c.id = i.client_id
            WHERE i.status = 'overdue' AND c.email IS NOT NULL AND c.email <> ''
        `);
        let sent = 0;
        for (const inv of overdue) {
            const days = businessRouter._daysOverdue(inv.due_date);
            let level = 0;
            if (days >= 30 && !inv.reminder_3_sent_at) level = 3;
            else if (days >= 14 && !inv.reminder_2_sent_at) level = 2;
            else if (days >= 7 && !inv.reminder_1_sent_at) level = 1;
            if (!level) continue;
            try {
                await businessRouter._sendBusinessEmail({ kind: 'invoice', docId: inv.id, templateKey: `reminder_${level}`, overrideDaysOverdue: days });
                await db.query(`UPDATE business_invoices SET reminder_${level}_sent_at = NOW() WHERE id=$1`, [inv.id]);
                await logger.info('cron', `Sent reminder ${level} for invoice ${inv.id} (${days}d overdue)`);
                sent++;
            } catch (e) {
                console.error(`[cron] reminder failed for ${inv.id}:`, e.message);
            }
        }
        if (sent > 0) await logger.info('cron', `Daily reminder run sent ${sent} email(s)`);
    } catch (e) { console.error('[cron] reminder run failed:', e.message); }
});

// Daily 00:20 — warn about overdue debt payment plans
cron.schedule('20 0 * * *', async () => {
    try {
        const { rows } = await db.query(`
            SELECT id, frequency, next_due_date FROM debt_plans
            WHERE is_active = TRUE AND frequency <> 'one_off'
              AND next_due_date IS NOT NULL AND next_due_date < CURRENT_DATE
        `);
        for (const p of rows) {
            await logger.warn('cron', `Debt plan ${p.id} is overdue (next_due ${p.next_due_date})`);
        }
    } catch (e) { console.error('[cron] debt plan check failed:', e.message); }
});

// ══════════════════════════════════════════════════════════════════════════
// Migrations + startup
// ══════════════════════════════════════════════════════════════════════════
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
            singleTransaction: true,
        });
        console.log(`[migrate] Done. Applied ${Array.isArray(applied) ? applied.length : 0} migration(s).`);
    } catch (e) {
        console.error('[migrate] FATAL: migration failed:', e.message);
        process.exit(1);
    }
}

const PORT = process.env.PORT || 3001;
(async () => {
    await runMigrations();
    app.listen(PORT, () => {
        console.log(`Nucleus API running on :${PORT}`);
        logger.info('startup', `Nucleus API started on port ${PORT}`).catch(() => {});
    });
})();
