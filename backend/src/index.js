const express = require('express');
const cors = require('cors');
const { router: authRouter, requireAuth } = require('./middleware/auth');
const financeRouter = require('./routes/finance');
const goalsRouter = require('./routes/goals');
const habitsRouter = require('./routes/habits');
const contentRouter = require('./routes/content');

const app = express();

app.use(cors({ origin: '*' }));
app.use(express.json({ limit: '10mb' }));

// Health check
app.get('/health', (req, res) => res.json({ status: 'ok', ts: new Date() }));

// Auth (no token required)
app.use('/auth', authRouter);

// Protected routes
app.use('/finance', requireAuth, financeRouter);
app.use('/goals', requireAuth, goalsRouter);
app.use('/habits', requireAuth, habitsRouter);
app.use('/', requireAuth, contentRouter);

// Error handler
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: err.message || 'Internal server error' });
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`Nucleus API running on :${PORT}`));
