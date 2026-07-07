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

// ── Sessions stored in PostgreSQL ────────────────────────────────────────────
app.use(session({
  store: new pgSession({
    pool,
    tableName: 'user_sessions',
    createTableIfMissing: true,
    errorLog: (err) => console.error('[pgSession Error]', err.message),
  }),
  secret:            process.env.SESSION_SECRET || 'thrustvault-change-me-in-production',
  resave:            false,
  saveUninitialized: false,
  cookie: {
    secure:   false,
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
const FRONTEND_DIST = path.join(__dirname, '..', 'frontend', 'dist');
const PUBLIC = path.join(__dirname, '..', 'public');

if (require('fs').existsSync(FRONTEND_DIST)) {
  app.use(express.static(FRONTEND_DIST));

  // Block old HTML app pages (replaced by React SPA) — only allow assets/images/libs
  const BLOCKED_OLD_PAGES = [
    '/user_dashboard.html', '/user_app.js',
    '/motor_explorer.html', '/motor_explorer_app.js',
    '/esc_explorer.html', '/esc_explorer_app.js',
    '/propeller_explorer.html', '/propeller_explorer_app.js',
    '/performance_analytics.html', '/performance_app.js',
    '/motor_finder.html', '/onboarding.js',
    '/documentation.html', '/ai_copilot.js',
    '/page-loader.js',
  ];
  app.use((req, res, next) => {
    if (BLOCKED_OLD_PAGES.includes(req.path)) {
      return res.redirect('/');
    }
    next();
  });

  app.use(express.static(PUBLIC));
  app.use((req, res, next) => {
    if (req.path.startsWith('/api/')) return next();
    res.sendFile(path.join(FRONTEND_DIST, 'index.html'));
  });
} else {
  app.use(express.static(PUBLIC, { index: false }));
  
  const send = (file) => (_req, res) => res.sendFile(path.join(PUBLIC, file));
  const redir = (to) => (_req, res) => res.redirect(to);

  app.get('/',      send('index.html'));
  app.get('/login', send('login.html'));
  app.get('/request_access', send('request_access.html'));
  app.get('/versions', send('version_catalog.html'));
  app.get('/docs', send('documentation.html'));
  app.get('/documentation', redir('/docs'));

  app.get('/dashboard/:motorname?', (req, res) => {
    const role = req.session.role;
    if (role && ['admin', 'user'].includes(role)) {
      return res.sendFile(path.join(PUBLIC, 'user_dashboard.html'));
    }
    res.redirect('/login');
  });

  app.get('/analytics', (req, res) => {
    const role = req.session.role;
    if (role && ['admin', 'user'].includes(role)) {
      return res.sendFile(path.join(PUBLIC, 'performance_analytics.html'));
    }
    res.redirect('/login');
  });

  app.get('/explorer', (req, res) => {
    const role = req.session.role;
    if (role && ['admin', 'user'].includes(role)) {
      return res.sendFile(path.join(PUBLIC, 'motor_explorer.html'));
    }
    res.redirect('/login');
  });

  app.get(['/escs', '/escs/:model', '/esc/:model'], (req, res) => {
    const role = req.session.role;
    if (role && ['admin', 'user'].includes(role)) {
      return res.sendFile(path.join(PUBLIC, 'esc_explorer.html'));
    }
    res.redirect('/login');
  });

  app.get(['/propellers', '/propellers/:model', '/propeller/:model'], (req, res) => {
    const role = req.session.role;
    if (role && ['admin', 'user'].includes(role)) {
      return res.sendFile(path.join(PUBLIC, 'propeller_explorer.html'));
    }
    res.redirect('/login');
  });

  app.get('/finder', (req, res) => {
    const role = req.session.role;
    if (role && ['admin', 'user'].includes(role)) {
      return res.sendFile(path.join(PUBLIC, 'motor_finder.html'));
    }
    res.redirect('/login');
  });

  app.get(['/share/motor/:name', '/share/esc/:name', '/share/propeller/:name'], (req, res) => {
    res.sendFile(path.join(PUBLIC, 'share.html'));
  });

  app.get('/user_app.js',           requireRole('admin', 'user'), send('user_app.js'));
  app.get('/performance_app.js',    requireRole('admin', 'user'), send('performance_app.js'));
  app.get('/motor_explorer_app.js', requireRole('admin', 'user'), send('motor_explorer_app.js'));

  ['/user/dashboard', '/user_dashboard'].forEach(p => app.get(p, redir('/dashboard')));
  ['/user/analytics', '/user_analytics'].forEach(p => app.get(p, redir('/analytics')));
  ['/user/explorer',  '/user_explorer'].forEach(p  => app.get(p, redir('/explorer')));
  ['/user/login',     '/guest/login'].forEach(p    => app.get(p, redir('/login')));
}

// ── Mount APIs ───────────────────────────────────────────────────────────────
app.use('/api/auth', require('./routes/authRoutes'));
app.use('/api', require('./routes/apiRoutes'));

// 404 handler
app.use((_req, res) => res.status(404).json({ error: 'Not found' }));

module.exports = app;
