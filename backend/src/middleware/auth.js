const jwt     = require('jsonwebtoken');
const bcrypt  = require('bcryptjs');
const express = require('express');
const router  = express.Router();

// ── Fail hard if JWT_SECRET is absent or still at default ─────────────────
// A missing or default secret means any attacker can forge valid tokens.
const SECRET = process.env.JWT_SECRET;
if (!SECRET || SECRET === 'dev-secret') {
  console.error('[auth] FATAL: JWT_SECRET is not set or is using the default value.');
  console.error('[auth] Set a secure random JWT_SECRET in .env and restart.');
  process.exit(1);
}

// ── requireAuth middleware ────────────────────────────────────────────────
const requireAuth = (req, res, next) => {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  try {
    req.user = jwt.verify(auth.split(' ')[1], SECRET);
    next();
  } catch (err) {
    // Distinguish expired from malformed — useful for frontend to decide
    // whether to show "session expired" vs generic error
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Session expired', expired: true });
    }
    res.status(401).json({ error: 'Invalid token' });
  }
};

// ── PIN login ─────────────────────────────────────────────────────────────
router.post('/login', async (req, res) => {
  const { pin } = req.body;
  if (!pin) return res.status(400).json({ error: 'PIN required' });

  // Validate format before hitting bcrypt
  const pinStr = String(pin).trim();
  if (!/^\d{4,8}$/.test(pinStr)) {
    return res.status(400).json({ error: 'PIN must be 4–8 digits' });
  }

  const stored = process.env.PIN_HASH;

  // First-run mode — no PIN configured yet
  // Returns setupRequired so the frontend can redirect to PIN setup screen
  if (!stored) {
    const token = jwt.sign({ id: 'local-user', setup: true }, SECRET, { expiresIn: '1h' });
    return res.json({ token, setupRequired: true });
  }

  const valid = await bcrypt.compare(pinStr, stored);
  if (!valid) return res.status(401).json({ error: 'Incorrect PIN' });

  const token = jwt.sign({ id: 'local-user' }, SECRET, { expiresIn: '30d' });
  res.json({ token });
});

// ── Setup / change PIN ────────────────────────────────────────────────────
// REQUIRES a valid token — either the 1h setup token from first-run
// or a normal 30d session token.
// Returns the hash to put in .env — does NOT auto-apply it,
// so a restart is always required to activate a new PIN.
router.post('/setup-pin', requireAuth, async (req, res) => {
  const { pin } = req.body;
  if (!pin) return res.status(400).json({ error: 'PIN required' });

  const pinStr = String(pin).trim();
  if (!/^\d{4,8}$/.test(pinStr)) {
    return res.status(400).json({ error: 'PIN must be 4–8 digits' });
  }

  const hash = await bcrypt.hash(pinStr, 10);
  res.json({
    hash,
    note: 'Add PIN_HASH to your .env file and restart the backend container to activate.',
  });
});

module.exports = { router, requireAuth };
