'use strict';
const express   = require('express');
const session   = require('express-session');
const pgSession = require('connect-pg-simple')(session);
const path      = require('path');
const pool      = require('./config/db');
const { requireRole } = require('./middlewares/auth');

const app = express();

app.set('trust proxy', 1);
app.use(express.json({ limit: '5mb' }));
app.use(express.urlencoded({ extended: true }));

// ── Sessions stored in RDS Postgres ──────────────────────────────────────────
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

// ── Demo Route Static Rewrite ────────────────────────────────────────────────
app.use((req, res, next) => {
  if (req.url.startsWith('/demo/') && /\.(css|js|png|jpg|jpeg|gif|svg|ico|woff|woff2|ttf|eot|xls|xlsx|csv|html)$/i.test(req.path)) {
    req.url = req.url.replace('/demo/', '/');
  }
  next();
});

// ── Static Files ─────────────────────────────────────────────────────────────
const PUBLIC = path.join(__dirname, '..', 'public');
app.use(express.static(PUBLIC, { index: false }));

// ── Page routes ──────────────────────────────────────────────────────────────
const send = (file) => (_req, res) => res.sendFile(path.join(PUBLIC, file));
const redir = (to) => (_req, res) => res.redirect(to);

app.get('/',      send('index.html'));
app.get('/login', send('login.html'));
app.get('/request_access', send('request_access.html'));
app.get('/versions', send('version_catalog.html'));

app.get('/dashboard', (req, res) => {
  const role = req.session.role;
  if (role && ['admin', 'user'].includes(role)) {
    return res.sendFile(path.join(PUBLIC, 'user_dashboard.html'));
  }
  res.redirect('/demo/dashboard');
});

app.get('/analytics', (req, res) => {
  const role = req.session.role;
  if (role && ['admin', 'user'].includes(role)) {
    return res.sendFile(path.join(PUBLIC, 'performance_analytics.html'));
  }
  res.redirect('/demo/analytics');
});

app.get('/explorer', (req, res) => {
  const role = req.session.role;
  if (role && ['admin', 'user'].includes(role)) {
    return res.sendFile(path.join(PUBLIC, 'motor_explorer.html'));
  }
  res.redirect('/demo/dashboard');
});

// Demo Page routes
app.get('/demo/dashboard', (req, res) => {
  res.sendFile(path.join(PUBLIC, 'guest_dashboard.html'));
});
app.get('/demo/analytics', send('performance_analytics.html'));
app.get('/demo',           redir('/demo/dashboard'));
app.get('/demo/',          redir('/demo/dashboard'));

// Protected client-side scripts
app.get('/user_app.js',           requireRole('admin', 'user'), send('user_app.js'));
app.get('/guest_app.js',                                        send('guest_app.js'));
app.get('/performance_app.js',                                  send('performance_app.js'));
app.get('/motor_explorer_app.js',                               send('motor_explorer_app.js'));

// Legacy redirects
['/user/dashboard', '/user_dashboard'].forEach(p => app.get(p, redir('/dashboard')));
['/guest/dashboard', '/guest_dashboard', '/guest'].forEach(p => app.get(p, redir('/demo/dashboard')));
['/user/analytics', '/user_analytics'].forEach(p => app.get(p, redir('/analytics')));
['/guest/analytics', '/guest_analytics'].forEach(p => app.get(p, redir('/demo/analytics')));
['/user/explorer', '/user_explorer'].forEach(p => app.get(p, redir('/explorer')));
['/guest/explorer', '/guest_explorer', '/motor_explorer'].forEach(p => app.get(p, redir('/demo/dashboard')));
['/user/login', '/guest/login'].forEach(p => app.get(p, redir('/login')));

// ── Mount APIs ───────────────────────────────────────────────────────────────
app.use('/api/auth', require('./routes/authRoutes'));
app.use('/api/guest', require('./routes/guestRoutes'));
app.use('/api', require('./routes/apiRoutes'));

// 404 handler
app.use((_req, res) => res.status(404).json({ error: 'Not found' }));

module.exports = app;
