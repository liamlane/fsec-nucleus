const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const express = require('express');
const router = express.Router();

const SECRET = process.env.JWT_SECRET || 'dev-secret';

// Middleware
const requireAuth = (req, res, next) => {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Bearer ')) return res.status(401).json({ error: 'Unauthorized' });
  try {
    req.user = jwt.verify(auth.split(' ')[1], SECRET);
    next();
  } catch {
    res.status(401).json({ error: 'Invalid token' });
  }
};

// PIN login
router.post('/login', async (req, res) => {
  const { pin } = req.body;
  if (!pin) return res.status(400).json({ error: 'PIN required' });

  const stored = process.env.PIN_HASH;

  // If no PIN set, any PIN works (first-run setup)
  if (!stored) {
    const token = jwt.sign({ id: 'local-user' }, SECRET, { expiresIn: '30d' });
    return res.json({ token, setupRequired: true });
  }

  const valid = await bcrypt.compare(String(pin), stored);
  if (!valid) return res.status(401).json({ error: 'Incorrect PIN' });

  const token = jwt.sign({ id: 'local-user' }, SECRET, { expiresIn: '30d' });
  res.json({ token });
});

// Hash a new PIN (utility endpoint — disable in production or guard it)
router.post('/setup-pin', async (req, res) => {
  const { pin } = req.body;
  if (!pin || String(pin).length < 4) return res.status(400).json({ error: 'PIN must be at least 4 digits' });
  const hash = await bcrypt.hash(String(pin), 10);
  res.json({ hash, note: 'Set PIN_HASH env var to this value and restart' });
});

module.exports = { router, requireAuth };
