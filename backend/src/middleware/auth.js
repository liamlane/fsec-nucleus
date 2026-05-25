const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { info, warn } = require('../utils/logger');

// In-memory store for the hash (in production, read from .env)
const STORED_HASH = process.env.PIN_HASH;

async function verifyPin(pin) {
    if (!STORED_HASH) return true; // first run – any PIN works
    return bcrypt.compare(String(pin), STORED_HASH);
}

const router = require('express').Router();

// POST /auth/login
router.post('/login', async (req, res) => {
    const { pin } = req.body;
    const valid = await verifyPin(pin);
    if (valid) {
        const token = jwt.sign({ id: 'local-user' }, process.env.JWT_SECRET, { expiresIn: '30d' });
        info('auth', `Successful login from ${req.ip}`);
        res.json({ token });
    } else {
        warn('auth', `Failed login attempt from ${req.ip}`);
        res.status(401).json({ error: 'Invalid PIN' });
    }
});

// POST /auth/setup-pin (optional, for generating hash)
router.post('/setup-pin', async (req, res) => {
    const { pin } = req.body;
    if (!pin) return res.status(400).json({ error: 'PIN required' });
    const hash = await bcrypt.hash(String(pin), 10);
    res.json({ hash });
});

// Middleware to require authentication
function requireAuth(req, res, next) {
    const authHeader = req.headers.authorization;
    if (!authHeader) return res.status(401).json({ error: 'No token provided' });
    const token = authHeader.split(' ')[1];
    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        req.user = decoded;
        next();
    } catch (err) {
        res.status(401).json({ error: 'Invalid token' });
    }
}

module.exports = { router, requireAuth };