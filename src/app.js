'use strict';
const express   = require('express');
const session   = require('express-session');
const pgSession = require('connect-pg-simple')(session);
const path      = require('path');
const pool      = require('./config/db');
const apiRouter = require('./routes');
const { requireRole } = require('./middlewares/auth');

const app = express();

app.set('trust proxy', 1);
app.use(express.json({ limit: '5mb' }));
app.use(express.urlencoded({ extended: true }));

// ── Sessions stored in RDS ──────────────────────────────────────────────────
app.use(session({
  store: new pgSession({
    pool,
    tableName: 'user_sessions',
    createTableIfMissing: true,
  }),
  secret:            process.env.SESSION_SECRET || 'thrustvault-change-me-in-production',
  resave:            false,
  saveUninitialized: false,
  cookie: {
    secure:   process.env.NODE_ENV === 'production',
    httpOnly: true,
    maxAge:   86_400_000, // 24 hours
    sameSite: 'lax',
  },
}));

// ── Static Files ─────────────────────────────────────────────────────────────
const PUBLIC = path.join(__dirname, '..', 'public');
app.use(express.static(PUBLIC, { index: false }));

// ── Page routes ──────────────────────────────────────────────────────────────
const send = (file) => (_req, res) => res.sendFile(path.join(PUBLIC, file));

app.get('/',      send('index.html'));
app.get('/login', send('login.html'));

app.get('/dashboard', (req, res) => {
  const role = req.session.role;
  if (role && ['admin', 'user'].includes(role)) {
    return res.sendFile(path.join(PUBLIC, 'user_dashboard.html'));
  }
  res.sendFile(path.join(PUBLIC, 'guest_dashboard.html'));
});

app.get('/analytics', send('performance_analytics.html'));
app.get('/explorer',  send('motor_explorer.html'));

// Protected JS files
app.get('/user_app.js',           requireRole('admin', 'user'), send('user_app.js'));
app.get('/guest_app.js',                                        send('guest_app.js'));
app.get('/performance_app.js',                                  send('performance_app.js'));
app.get('/motor_explorer_app.js',                               send('motor_explorer_app.js'));

// Legacy redirects
const redir = (to) => (_req, res) => res.redirect(to);
['/intern/dashboard', '/intern_dashboard', '/user/dashboard', '/user_dashboard',
 '/guest/dashboard', '/guest_dashboard'].forEach(p => app.get(p, redir('/dashboard')));
['/intern/analytics', '/intern_analytics', '/user/analytics', '/user_analytics',
 '/guest/analytics', '/guest_analytics'].forEach(p => app.get(p, redir('/analytics')));
['/intern/explorer', '/intern_explorer', '/user/explorer', '/user_explorer',
 '/guest/explorer', '/guest_explorer', '/motor_explorer'].forEach(p => app.get(p, redir('/explorer')));
['/intern/login', '/user/login', '/guest/login'].forEach(p => app.get(p, redir('/login')));

// ── API Router ───────────────────────────────────────────────────────────────
app.use('/api', apiRouter);

// 404 handler
app.use((_req, res) => res.status(404).json({ error: 'Not found' }));

module.exports = app;
