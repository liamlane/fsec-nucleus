const jwt    = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { info, warn } = require('../utils/logger');

// ─────────────────────────────────────────────────────────────────────────
// Fail hard if JWT_SECRET is absent or using a known-weak default.
// Better to refuse to start than to issue tokens signed with a guessable key.
// ─────────────────────────────────────────────────────────────────────────
const SECRET = process.env.JWT_SECRET;
if (!SECRET || SECRET === 'dev-secret' || SECRET === 'change_me_run_openssl_rand_hex_32') {
    console.error('[auth] FATAL: JWT_SECRET is missing or using a default value.');
    console.error('[auth] Set a secure random JWT_SECRET in .env and restart.');
    console.error('[auth] Generate with: openssl rand -hex 32');
    process.exit(1);
}

const STORED_HASH = process.env.PIN_HASH;

async function verifyPin(pin) {
    if (!STORED_HASH) return true; // first-run mode — any PIN works
    return bcrypt.compare(String(pin), STORED_HASH);
}

function validatePinFormat(pin) {
    const str = String(pin).trim();
    return /^\d{4,8}$/.test(str);
}

const router = require('express').Router();

// ─────────────────────────────────────────────────────────────────────────
// Middleware
// ─────────────────────────────────────────────────────────────────────────
function requireAuth(req, res, next) {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'No token provided' });
    }
    const token = authHeader.slice(7); // strip "Bearer "
    try {
        req.user = jwt.verify(token, SECRET);
        next();
    } catch (err) {
        // Distinguish expired from invalid so the frontend can react cleanly
        if (err.name === 'TokenExpiredError') {
            return res.status(401).json({ error: 'Session expired', expired: true });
        }
        return res.status(401).json({ error: 'Invalid token' });
    }
}

// ─────────────────────────────────────────────────────────────────────────
// POST /auth/login
// ─────────────────────────────────────────────────────────────────────────
router.post('/login', async (req, res) => {
    const { pin } = req.body;
    if (!pin) return res.status(400).json({ error: 'PIN required' });

    if (!validatePinFormat(pin)) {
        return res.status(400).json({ error: 'PIN must be 4–8 digits' });
    }

    const valid = await verifyPin(pin);
    if (!valid) {
        await warn('auth', `Failed login attempt from ${req.ip}`);
        return res.status(401).json({ error: 'Invalid PIN' });
    }

    // First-run mode: issue a short-lived setup token so the user can
    // immediately call /auth/setup-pin to generate a real hash.
    if (!STORED_HASH) {
        const token = jwt.sign({ id: 'local-user', setup: true }, SECRET, { expiresIn: '1h' });
        await info('auth', `First-run login from ${req.ip} — PIN_HASH not set, setup required`);
        return res.json({ token, setupRequired: true });
    }

    const token = jwt.sign({ id: 'local-user' }, SECRET, { expiresIn: '30d' });
    await info('auth', `Successful login from ${req.ip}`);
    res.json({ token });
});

// ─────────────────────────────────────────────────────────────────────────
// POST /auth/setup-pin
//
// Requires a valid token (either the short-lived first-run setup token,
// or an existing 30-day session token). Previously unauthenticated —
// anyone on the network could rotate the PIN hash.
// ─────────────────────────────────────────────────────────────────────────
router.post('/setup-pin', requireAuth, async (req, res) => {
    const { pin } = req.body;
    if (!pin) return res.status(400).json({ error: 'PIN required' });

    if (!validatePinFormat(pin)) {
        return res.status(400).json({ error: 'PIN must be 4–8 digits' });
    }

    const hash = await bcrypt.hash(String(pin).trim(), 10);
    await info('auth', `PIN hash generated for ${req.ip}`);
    res.json({
        hash,
        note: 'Add PIN_HASH to your .env file and restart the backend container to activate.',
    });
});

module.exports = { router, requireAuth };
