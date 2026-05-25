const express    = require('express');
const cors       = require('cors');
const helmet     = require('helmet');
const rateLimit  = require('express-rate-limit');

const { router: authRouter, requireAuth } = require('./middleware/auth');
const financeRouter = require('./routes/finance');
const goalsRouter   = require('./routes/goals');
const habitsRouter  = require('./routes/habits');
const contentRouter = require('./routes/content');
const searchRouter  = require('./routes/search');
const settingsRouter = require('./routes/settings');

const app = express();

// ── Security headers ──────────────────────────────────────────────────────
app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false,
}));

// ── CORS ──────────────────────────────────────────────────────────────────
const ALLOWED = (process.env.ALLOWED_ORIGINS || '')
  .split(',')
  .map(s => s.trim())
  .filter(Boolean);

app.use(cors({
  origin: (origin, cb) => {
    if (!origin) return cb(null, true);
    if (ALLOWED.length === 0) return cb(null, true);
    if (ALLOWED.includes(origin)) return cb(null, true);
    cb(new Error(`CORS: origin ${origin} not permitted`));
  },
  methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

// ── Body parsing ──────────────────────────────────────────────────────────
app.use(express.json({ limit: '2mb' }));

// After app.use(express.json(...))

// Optional request logging (set LOG_REQUESTS=true in .env to enable)
if (process.env.LOG_REQUESTS === 'true') {
    const { info } = require('./utils/logger');
    app.use((req, res, next) => {
        info('http', `${req.method} ${req.path}`, { ip: req.ip, userAgent: req.get('User-Agent') });
        next();
    });
}

// ── Rate limiting on auth endpoint ────────────────────────────────────────
const authLimiter = rateLimit({
  windowMs:        15 * 60 * 1000,
  max:             20,
  standardHeaders: true,
  legacyHeaders:   false,
  message:         { error: 'Too many login attempts — try again in 15 minutes' },
  skipSuccessfulRequests: true,
});
app.use('/auth', authLimiter);

// ── Health check (no auth required) ──────────────────────────────────────
app.get('/health', (req, res) => res.json({ status: 'ok', ts: new Date() }));

// ── Auth routes (no token required) ──────────────────────────────────────
app.use('/auth', authRouter);

// ── Protected routes ──────────────────────────────────────────────────────
app.use('/finance', requireAuth, financeRouter);
app.use('/goals',   requireAuth, goalsRouter);
app.use('/habits',  requireAuth, habitsRouter);
app.use('/',        requireAuth, contentRouter);
app.use('/search',  requireAuth, searchRouter);
app.use('/settings', requireAuth, settingsRouter);

// ── Global error handler ──────────────────────────────────────────────────
app.use((err, req, res, next) => {
  console.error(`[${new Date().toISOString()}] ${req.method} ${req.path}`, err.stack);
  const status = err.status || err.statusCode || 500;
  const message = process.env.NODE_ENV === 'production'
    ? 'Internal server error'
    : (err.message || 'Internal server error');
  res.status(status).json({ error: message });
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`Nucleus API running on :${PORT}`));