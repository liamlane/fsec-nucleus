const express    = require('express');
const cors       = require('cors');
const helmet     = require('helmet');
const rateLimit  = require('express-rate-limit');

const { router: authRouter, requireAuth } = require('./middleware/auth');
const financeRouter = require('./routes/finance');
const goalsRouter   = require('./routes/goals');
const habitsRouter  = require('./routes/habits');
const contentRouter = require('./routes/content');

const app = express();

// ── Security headers ──────────────────────────────────────────────────────
app.use(helmet({
  contentSecurityPolicy: false, // SPA frontend handles its own CSP via nginx
  crossOriginEmbedderPolicy: false,
}));

// ── CORS ──────────────────────────────────────────────────────────────────
// JWT (Authorization header) is never sent automatically by browsers, so
// wildcard CORS is lower-risk here than with cookie auth — but restrict
// to known origins anyway as a defence-in-depth measure.
// Tailscale IP and LAN IP are the only real consumers.
const ALLOWED = (process.env.ALLOWED_ORIGINS || '')
  .split(',')
  .map(s => s.trim())
  .filter(Boolean);

app.use(cors({
  origin: (origin, cb) => {
    // Allow requests with no origin (curl, Postman, same-origin proxied requests)
    if (!origin) return cb(null, true);
    if (ALLOWED.length === 0) return cb(null, true); // not configured → permissive
    if (ALLOWED.includes(origin)) return cb(null, true);
    cb(new Error(`CORS: origin ${origin} not permitted`));
  },
  methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

// ── Body parsing ──────────────────────────────────────────────────────────
// 2mb ceiling — ample for note content (50KB cap enforced at route level anyway)
app.use(express.json({ limit: '2mb' }));

// ── Rate limiting on auth endpoint ────────────────────────────────────────
// 20 attempts per 15 minutes — stops PIN brute force (10,000 possible PINs)
const authLimiter = rateLimit({
  windowMs:        15 * 60 * 1000,
  max:             20,
  standardHeaders: true,
  legacyHeaders:   false,
  message:         { error: 'Too many login attempts — try again in 15 minutes' },
  skipSuccessfulRequests: true,
});
app.use('/auth', authLimiter); // covers /auth/login + /auth/setup-pin

// ── Health check (no auth required) ──────────────────────────────────────
app.get('/health', (req, res) => res.json({ status: 'ok', ts: new Date() }));

// ── Auth routes (no token required) ──────────────────────────────────────
app.use('/auth', authRouter);

// ── Protected routes ──────────────────────────────────────────────────────
app.use('/finance', requireAuth, financeRouter);
app.use('/goals',   requireAuth, goalsRouter);
app.use('/habits',  requireAuth, habitsRouter);
app.use('/',        requireAuth, contentRouter);

// ── Global error handler ──────────────────────────────────────────────────
// Catches anything thrown inside asyncHandler wrappers across all routes.
// Does NOT leak stack traces to the client in production.
app.use((err, req, res, next) => {  // eslint-disable-line no-unused-vars
  console.error(`[${new Date().toISOString()}] ${req.method} ${req.path}`, err.stack);
  const status = err.status || err.statusCode || 500;
  // Only expose error message in non-production; send generic message otherwise
  const message = process.env.NODE_ENV === 'production'
    ? 'Internal server error'
    : (err.message || 'Internal server error');
  res.status(status).json({ error: message });
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`Nucleus API running on :${PORT}`));
// ... after existing requires
const searchRouter = require('./routes/search');
const settingsRouter = require('./routes/settings');

// ... after other app.use() lines
app.use('/search', requireAuth, searchRouter);
app.use('/settings', requireAuth, settingsRouter);
