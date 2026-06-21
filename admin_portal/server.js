'use strict';
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const express = require('express');
const session = require('express-session');
const pgSession = require('connect-pg-simple')(session);
const path = require('path');
const crypto = require('crypto');
const os = require('os');

// Reuse parent database connections and query builder
const pool = require('../src/config/db');
const { queryTable } = require('../src/utils/queryBuilder');

// Reuse Cognito config helpers
const { cognito, cognitoSecretHash } = require('../src/config/cognito');
const { normaliseRole } = require('../src/utils/roleHelper');

const app = express();
const PORT = parseInt(process.env.ADMIN_PORT || '8001', 10);

app.set('trust proxy', 1);
app.use(express.json({ limit: '5mb' }));
app.use(express.urlencoded({ extended: true }));

// Sessions stored in RDS Postgres (reuse user_sessions table)
app.use(session({
  store: new pgSession({
    pool,
    tableName: 'user_sessions',
    createTableIfMissing: true,
  }),
  secret: process.env.SESSION_SECRET || 'thrustvault-change-me-in-production',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    maxAge: 86400000, // 24 hours
    sameSite: 'lax',
  },
}));

// Endpoint Table name mapper to query public schema
const tableMap = {
  'users': 'user_profiles',
  'user_profiles': 'user_profiles',
  'custom_specs': 'custom_specs_schema',
  'custom-specs': 'custom_specs_schema',
  'custom_specs_schema': 'custom_specs_schema',
  'categories': 'categories',
  'motors': 'motors',
  'access_requests': 'access_requests',
  'access-requests': 'access_requests',
  'motor_test_runs': 'motor_test_runs',
  'motor-test-runs': 'motor_test_runs',
  'motor_test_data_points': 'motor_test_data_points',
  'motor-test-data-points': 'motor_test_data_points',
  'draft_test_runs': 'draft_test_runs',
  'draft-test-runs': 'draft_test_runs',
  'user_onboarding': 'user_onboarding',
  'user-onboarding': 'user_onboarding',
  'system_settings': 'system_settings',
  'system-settings': 'system_settings'
};

// Route security middleware checking for active session + 'admin' role
app.use((req, res, next) => {
  const publicPaths = [
    '/login',
    '/login.html',
    '/login.js',
    '/page-loader.js',
    '/favicon_dark.png',
    '/favicon_light.png',
    '/logo_dark.png',
    '/logo_light.png',
    '/style.css'
  ];

  const isPublicFile = publicPaths.includes(req.path) || 
                       req.path.startsWith('/libs/') || 
                       req.path.startsWith('/api/auth/');

  if (isPublicFile) {
    return next();
  }

  const role = req.session.role;
  const ts = req.session.timestamp || 0;

  if (!role || role !== 'admin' || (Date.now() - ts > 86400000)) {
    if (req.path.startsWith('/api/')) {
      return res.status(401).json({ error: 'Unauthorized: Admin access required.' });
    }
    return res.redirect('/login');
  }

  next();
});

// Serve static assets from public/ folder
app.use(express.static(path.join(__dirname, 'public')));
app.use('/admin', express.static(path.join(__dirname, 'public')));

// HTML Page Routes Redirections
app.get('/', (req, res) => res.redirect('/admin/dashboard'));
app.get('/login', (req, res) => res.sendFile(path.join(__dirname, 'public', 'login.html')));

app.get('/admin/dashboard', (req, res) => res.sendFile(path.join(__dirname, 'public', 'admin_dashboard.html')));
app.get('/admin/users', (req, res) => res.sendFile(path.join(__dirname, 'public', 'admin_users.html')));
app.get('/admin/access-requests', (req, res) => res.sendFile(path.join(__dirname, 'public', 'admin_access_requests.html')));
app.get('/admin/schema-customizer', (req, res) => res.sendFile(path.join(__dirname, 'public', 'admin_schema_customizer.html')));
app.get('/admin/audit-logs', (req, res) => res.sendFile(path.join(__dirname, 'public', 'admin_audit_logs.html')));
app.get('/admin/exports', (req, res) => res.sendFile(path.join(__dirname, 'public', 'admin_exports.html')));
app.get('/admin/imports', (req, res) => res.sendFile(path.join(__dirname, 'public', 'admin_imports.html')));
app.get('/admin/analytics', (req, res) => res.sendFile(path.join(__dirname, 'public', 'performance_analytics.html')));
app.get('/admin/explorer', (req, res) => res.sendFile(path.join(__dirname, 'public', 'motor_explorer.html')));

// ── Authentication APIs ──────────────────────────────────────────────────────────

app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) return res.status(400).json({ error: 'Missing email or password' });

  try {
    const CLIENT_ID = process.env.COGNITO_CLIENT_ID;
    let accessToken = null;
    let uid = null;
    let role = null;

    if (CLIENT_ID) {
      const authParams = { USERNAME: email, PASSWORD: password };
      const sh = cognitoSecretHash(email);
      if (sh) authParams.SECRET_HASH = sh;

      try {
        const { InitiateAuthCommand, GetUserCommand } = require('@aws-sdk/client-cognito-identity-provider');
        const authRes = await cognito.send(new InitiateAuthCommand({
          ClientId: CLIENT_ID,
          AuthFlow: 'USER_PASSWORD_AUTH',
          AuthParameters: authParams,
        }));
        accessToken = authRes.AuthenticationResult.AccessToken;

        const userRes = await cognito.send(new GetUserCommand({ AccessToken: accessToken }));
        uid = userRes.UserAttributes.find(a => a.Name === 'sub')?.Value;
      } catch (cognitoErr) {
        console.warn('Cognito auth failed, trying database fallback...', cognitoErr.message);
        throw cognitoErr;
      }
    } else {
      throw new Error('Cognito not configured');
    }

    if (!uid) throw new Error('Cognito sub not found');

    const profileRes = await pool.query('SELECT id, role FROM user_profiles WHERE email = $1', [email]);
    const profile = profileRes.rows[0];
    if (!profile) return res.status(403).json({ error: 'Profile not found in database' });

    role = normaliseRole(profile.role);
    if (role !== 'admin') {
      return res.status(403).json({ error: 'Access denied: Admin role required for the admin portal.' });
    }

    // Sync profile ID if needed
    if (profile.id !== uid) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        // 1. Ensure foreign key references satisfy auth.users(id) constraint
        await client.query(
          `INSERT INTO auth.users (id, email) VALUES ($1, $2) ON CONFLICT (id) DO NOTHING`,
          [uid, email]
        );
        // 2. Perform the user profile mapping sync
        await client.query(
          `UPDATE public.user_profiles SET id = $1 WHERE email = $2`,
          [uid, email]
        );
        await client.query('COMMIT');
      } catch (syncErr) {
        await client.query('ROLLBACK');
        console.error('[Sync Profile Error]', syncErr.message);
      } finally {
        client.release();
      }
    }

    req.session.email        = email;
    req.session.role         = role;
    req.session.uid          = uid;
    req.session.access_token = accessToken;
    req.session.timestamp    = Date.now();

    return res.json({ email, role: 'admin', uid, timestamp: req.session.timestamp });

  } catch (err) {
    const msg = err.message || '';
    console.error('[Login Error]', msg);
    return res.status(400).json({ error: msg });
  }
});

app.post('/api/auth/logout', (req, res) => {
  req.session.destroy(() => res.json({ success: true }));
});

app.get('/api/auth/session', (req, res) => {
  const role = req.session.role;
  const ts = req.session.timestamp || 0;
  if (!role || role !== 'admin' || Date.now() - ts > 86400000) {
    return res.json({ logged_in: false });
  }
  res.json({ logged_in: true, email: req.session.email, role: 'admin', uid: req.session.uid });
});

app.post('/api/auth/forgot-password', async (req, res) => {
  const { email } = req.body || {};
  if (!email) return res.status(400).json({ error: 'Email is required' });
  try {
    const { ForgotPasswordCommand } = require('@aws-sdk/client-cognito-identity-provider');
    const args = { ClientId: process.env.COGNITO_CLIENT_ID, Username: email };
    const sh = cognitoSecretHash(email);
    if (sh) args.SecretHash = sh;
    await cognito.send(new ForgotPasswordCommand(args));
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/auth/verify-otp', (req, res) => {
  const { email, token } = req.body || {};
  if (!email || !token) return res.status(400).json({ error: 'Email and token required' });
  req.session.reset_email = email;
  req.session.reset_code  = token;
  req.session.reset_ts    = Date.now();
  res.json({ success: true });
});

app.post('/api/auth/reset-password', async (req, res) => {
  const { reset_email, reset_code, reset_ts } = req.session;
  if (!reset_email || !reset_code || Date.now() - (reset_ts || 0) > 600000) {
    return res.status(400).json({ error: 'Password reset session expired. Please start again.' });
  }
  const { password } = req.body || {};
  if (!password || password.length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 characters' });
  }
  try {
    const { ConfirmForgotPasswordCommand } = require('@aws-sdk/client-cognito-identity-provider');
    const args = {
      ClientId: process.env.COGNITO_CLIENT_ID, Username: reset_email,
      ConfirmationCode: reset_code, Password: password,
    };
    const sh = cognitoSecretHash(reset_email);
    if (sh) args.SecretHash = sh;
    await cognito.send(new ConfirmForgotPasswordCommand(args));
    req.session.destroy(() => {});
    res.json({ success: true });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// ── Admin-Only System Actions APIs ──────────────────────────────────────────────

// Dynamic settings (Auto-Approve configuration)
app.get('/api/admin/settings', async (req, res) => {
  try {
    const settingsRes = await pool.query("SELECT value FROM public.system_settings WHERE key = 'auto_approve'");
    const autoApproveVal = settingsRes.rows[0]?.value;
    res.json({ auto_approve: autoApproveVal === true || autoApproveVal === 'true' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/admin/settings', async (req, res) => {
  const { key, value } = req.body || {};
  if (key !== 'auto_approve') return res.status(400).json({ error: 'Invalid setting key' });
  try {
    await pool.query(
      `INSERT INTO public.system_settings (key, value) 
       VALUES ($1, $2::jsonb) 
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
      [key, JSON.stringify(value)]
    );
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// RPC wrapper to create a new vault user securely (directly in the database)
app.post('/api/admin/rpc/create_vault_user', async (req, res) => {
  const { email_val, password_val, role_val } = req.body || {};
  if (!email_val || !password_val || !role_val) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const newUid = crypto.randomUUID();

    // 1. Insert into auth.users (Supabase system structure)
    await client.query(`
      INSERT INTO auth.users (
        instance_id, id, aud, role, email, encrypted_password, 
        email_confirmed_at, recovery_sent_at, last_sign_in_at, 
        raw_app_meta_data, raw_user_meta_data, created_at, updated_at, 
        confirmation_token, email_change, email_change_token_new, recovery_token
      )
      VALUES (
        '00000000-0000-0000-0000-000000000000',
        $1, 'authenticated', 'authenticated', $2, crypt($3, gen_salt('bf')),
        now(), now(), now(),
        '{"provider":"email","providers":["email"]}'::jsonb,
        json_build_object('role', $4)::jsonb,
        now(), now(), '', '', '', ''
      )
    `, [newUid, email_val, password_val, role_val]);

    // 2. Insert into public.user_profiles
    await client.query(`
      INSERT INTO public.user_profiles (id, email, role)
      VALUES ($1, $2, $3)
      ON CONFLICT (id) DO UPDATE SET email = EXCLUDED.email, role = EXCLUDED.role
    `, [newUid, email_val, role_val]);

    await client.query('COMMIT');
    res.json(newUid);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[create_vault_user RPC] error:', err.message);
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

// RPC wrapper to delete/ban a vault user securely (directly in the database)
app.post('/api/admin/rpc/delete_vault_user', async (req, res) => {
  const { user_id } = req.body || {};
  if (!user_id) return res.status(400).json({ error: 'user_id is required' });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 1. Delete user onboarding data
    await client.query('DELETE FROM public.user_onboarding WHERE user_id = $1', [user_id]);

    // 2. Delete public profile records
    await client.query('DELETE FROM public.user_profiles WHERE id = $1', [user_id]);

    // 3. Delete from auth.users (cascades other auth entries)
    await client.query('DELETE FROM auth.users WHERE id = $1', [user_id]);

    await client.query('COMMIT');
    res.json({ success: true });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[delete_vault_user RPC] error:', err.message);
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

// Recovery Action Link Generator Mock Endpoint
app.post('/api/admin/auth/generate-link', (req, res) => {
  const { email } = req.body || {};
  if (!email) return res.status(400).json({ error: 'Email is required' });
  const origin = `${req.protocol}://${req.get('host')}`;
  const actionLink = `${origin}/login?reset_email=${encodeURIComponent(email)}`;
  res.json({
    properties: {
      action_link: actionLink
    }
  });
});

// Audit Logs fetch endpoint
app.get('/api/audit-logs', async (req, res) => {
  try {
    const logsRes = await pool.query('SELECT * FROM public.audit_logs ORDER BY timestamp DESC LIMIT 500');
    res.json(logsRes.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// System Activity Log submission
app.post('/api/log-activity', async (req, res) => {
  const { email, role, action, details } = req.body || {};
  try {
    await pool.query(
      `INSERT INTO public.audit_logs (email, role, route, method, status, ip_address, user_agent, risk_level, details)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       ON CONFLICT DO NOTHING`,
      [
        email || req.session.email || 'Anonymous',
        role || req.session.role || 'Anonymous',
        action || 'API-Activity',
        req.method || 'POST',
        200,
        req.ip || req.headers['x-forwarded-for'] || '127.0.0.1',
        req.headers['user-agent'] || 'Node Client',
        'info',
        details || ''
      ]
    );
    res.json({ success: true });
  } catch (e) {
    console.warn('[log-activity] Warning:', e.message);
    res.json({ success: false });
  }
});

// Email dispatch API route (uses Resend API via Node native fetch)
app.post('/api/send-email', async (req, res) => {
  const { type, to, full_name, temp_password, reset_link, requested_role } = req.body || {};
  const apiKey = process.env.RESEND_API_KEY;

  if (!apiKey || apiKey === 're_placeholder_key') {
    console.warn('EMAIL SYSTEM WARNING: RESEND_API_KEY is not configured. Email dispatch skipped.');
    return res.json({ success: true, warning: 'Email dispatch skipped: API key unconfigured' });
  }

  let subject = '';
  let html = '';

  if (type === 'received') {
    subject = 'ThrustVault Access Request Received';
    html = `
      <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 25px; border: 1px solid #e2e8f0; border-radius: 12px; background-color: #ffffff;">
          <div style="text-align: center; border-bottom: 2px solid #2563eb; padding-bottom: 15px; margin-bottom: 20px;">
              <h2 style="color: #2563eb; margin: 0; font-family: sans-serif;">ThrustVault Access Request</h2>
          </div>
          <p>Hello ${full_name || 'Applicant'},</p>
          <p>Thank you for requesting access to the <strong>ThrustVault UAV Motor Database Console</strong>. We have received your request.</p>
          <p>Our administrators are currently reviewing your application. You will receive an email notification once a decision has been made.</p>
          <p style="margin-top: 30px; font-size: 0.82rem; color: #64748b; border-top: 1px solid #e2e8f0; padding-top: 15px;">
              This is an automated notification from ThrustVault. Please do not reply directly to this email.
          </p>
      </div>
    `;
  } else if (type === 'approved' || type === 'created') {
    const roleName = (requested_role || 'user').toUpperCase();
    subject = type === 'approved' ? 'ThrustVault Access Approved' : 'ThrustVault Account Created';

    let credentialsTable = `
      <table style="background-color: #f8fafc; padding: 15px; border-radius: 8px; width: 100%; border: 1px solid #e2e8f0; font-family: monospace; margin: 15px 0;">
          <tr><td style="padding: 5px;"><strong>Email:</strong></td><td style="padding: 5px;">${to}</td></tr>
          <tr><td style="padding: 5px;"><strong>Role:</strong></td><td style="padding: 5px;">${roleName}</td></tr>
    `;

    if (temp_password) {
      credentialsTable += `<tr><td style="padding: 5px;"><strong>Default Password:</strong></td><td style="padding: 5px;"><code>${temp_password}</code></td></tr>`;
    }
    credentialsTable += `</table>`;

    let linkSection = '';
    if (reset_link) {
      linkSection = `
        <p>You can use the recovery link below to set your password:</p>
        <p><a href="${reset_link}" style="display: inline-block; padding: 10px 20px; background-color: #2563eb; color: #ffffff; text-decoration: none; border-radius: 8px; font-weight: bold;">Set Your Password</a></p>
      `;
    }

    html = `
      <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 25px; border: 1px solid #e2e8f0; border-radius: 12px; background-color: #ffffff;">
          <div style="text-align: center; border-bottom: 2px solid #059669; padding-bottom: 15px; margin-bottom: 20px;">
              <h2 style="color: #059669; margin: 0; font-family: sans-serif;">ThrustVault Access Granted</h2>
          </div>
          <p>Hello ${full_name || 'User'},</p>
          <p>Your account access to the <strong>ThrustVault UAV Motor Database Console</strong> has been configured.</p>
          ${credentialsTable}
          ${linkSection}
          <p style="margin-top: 30px; font-size: 0.82rem; color: #64748b; border-top: 1px solid #e2e8f0; padding-top: 15px;">
              This is an automated notification from ThrustVault. Please do not reply directly to this email.
          </p>
      </div>
    `;
  } else if (type === 'rejected') {
    subject = 'ThrustVault Access Request Update';
    html = `
      <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 25px; border: 1px solid #e2e8f0; border-radius: 12px; background-color: #ffffff;">
          <div style="text-align: center; border-bottom: 2px solid #e11d48; padding-bottom: 15px; margin-bottom: 20px;">
              <h2 style="color: #e11d48; margin: 0; font-family: sans-serif;">Access Request Declined</h2>
          </div>
          <p>Hello ${full_name || 'Applicant'},</p>
          <p>Thank you for your interest in the <strong>ThrustVault UAV Motor Database Console</strong>.</p>
          <p>We regret to inform you that your request for credentials has been declined at this time by our administrators.</p>
          <p style="margin-top: 30px; font-size: 0.82rem; color: #64748b; border-top: 1px solid #e2e8f0; padding-top: 15px;">
              This is an automated notification from ThrustVault. Please do not reply directly to this email.
          </p>
      </div>
    `;
  } else {
    return res.status(400).json({ error: 'Invalid email notification type' });
  }

  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from: 'ThrustVault <onboarding@resend.dev>',
        to: [to],
        subject,
        html
      })
    });

    if (response.ok) {
      res.json({ success: true });
    } else {
      const errBody = await response.text();
      console.error(`Resend API returned error status ${response.status}: ${errBody}`);
      res.status(500).json({ error: `Resend API returned status ${response.status}` });
    }
  } catch (err) {
    console.error('Failed to send email via Resend:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// System performance and database stats endpoint
app.get('/api/admin/statistics', async (req, res) => {
  try {
    const [motorsCount, categoriesCount, requestsCount, usersCount] = await Promise.all([
      pool.query('SELECT COUNT(*)::int AS count FROM public.motors'),
      pool.query('SELECT COUNT(*)::int AS count FROM public.categories'),
      pool.query("SELECT COUNT(*)::int AS count FROM public.access_requests WHERE status = 'pending'"),
      pool.query('SELECT COUNT(*)::int AS count FROM public.user_profiles')
    ]);

    const cpuLoad = os.loadavg();
    const cpuCores = os.cpus().length;
    const cpuPercent = Math.min(100, (cpuLoad[0] / cpuCores) * 100);

    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    const usedMem = totalMem - freeMem;
    const ramPercent = (usedMem / totalMem) * 100;

    res.json({
      cpu_load: cpuLoad,
      cpu_load_percent: cpuPercent,
      ram_total_gb: totalMem / (1024 * 1024 * 1024),
      ram_used_gb: usedMem / (1024 * 1024 * 1024),
      ram_free_gb: freeMem / (1024 * 1024 * 1024),
      ram_percent: ramPercent,
      total_motors: motorsCount.rows[0].count,
      total_categories: categoriesCount.rows[0].count,
      pending_requests: requestsCount.rows[0].count,
      total_users: usersCount.rows[0].count
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// User onboarding fetch & save overrides
app.get('/api/admin/onboarding', async (req, res) => {
  const uid = req.session.uid;
  try {
    const r = await pool.query('SELECT * FROM public.user_onboarding WHERE user_id = $1', [uid]);
    res.json(r.rows[0] || { user_id: uid, pages_progress: {}, tour_completed: false });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/admin/onboarding', async (req, res) => {
  const uid = req.session.uid;
  const payload = { ...req.body, user_id: uid };
  try {
    const ex = await pool.query('SELECT id FROM public.user_onboarding WHERE user_id = $1', [uid]);
    if (ex.rows.length > 0) {
      const data = await queryTable('user_onboarding', 'PATCH', payload, { user_id: `eq.${uid}` });
      res.json(data);
    } else {
      const data = await queryTable('user_onboarding', 'POST', payload, null);
      res.json(data);
    }
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Override: patch user profiles endpoint to sync with auth.users metadata
app.patch('/api/admin/users/:id', async (req, res) => {
  const { id } = req.params;
  const { role } = req.body || {};
  if (!role) return res.status(400).json({ error: 'Role is required' });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const u1 = await client.query(
      `UPDATE public.user_profiles SET role = $1 WHERE id = $2 RETURNING *`,
      [role, id]
    );

    await client.query(
      `UPDATE auth.users SET raw_user_meta_data = json_build_object('role', $1)::jsonb WHERE id = $2`,
      [role, id]
    );

    await client.query('COMMIT');
    res.json(u1.rows);
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

// Custom handler for motor test data points to support relation join select queries
app.get(['/api/admin/motor-test-data-points', '/api/admin/motor_test_data_points'], async (req, res) => {
  try {
    const { test_run_id, select, order } = req.query;

    // Check if we need the join
    const hasJoin = select && select.includes('motor_test_runs');

    let sql = '';
    let vals = [];

    if (hasJoin) {
      sql = `
        SELECT dp.*, row_to_json(r.*) as motor_test_runs
        FROM public.motor_test_data_points dp
        JOIN public.motor_test_runs r ON dp.test_run_id = r.id
      `;
      
      const whereParts = [];
      if (test_run_id) {
        if (test_run_id.startsWith('eq.')) {
          const val = test_run_id.slice(3);
          whereParts.push(`dp.test_run_id = $${vals.length + 1}`);
          vals.push(val);
        } else if (test_run_id.startsWith('in.(')) {
          const valStr = test_run_id.slice(4, -1);
          const ids = valStr.split(',').map(id => id.trim());
          whereParts.push(`dp.test_run_id = ANY($${vals.length + 1})`);
          vals.push(ids);
        }
      }
      
      if (whereParts.length) {
        sql += ` WHERE ${whereParts.join(' AND ')}`;
      }

      if (order) {
        const orderParts = order.split(',');
        const orderClauses = orderParts.map(item => {
          const parts = item.trim().split('.');
          const col = parts[0];
          const dir = parts[1] === 'desc' ? 'DESC' : 'ASC';
          if (!/^[a-zA-Z0-9_]+$/.test(col)) throw new Error('Invalid order column');
          return `dp."${col}" ${dir}`;
        });
        sql += ` ORDER BY ${orderClauses.join(', ')}`;
      } else {
        sql += ` ORDER BY dp.throttle ASC`;
      }

      const dbRes = await pool.query(sql, vals);
      res.json(dbRes.rows);
    } else {
      // Fallback to the generic queryTable logic
      const data = await queryTable('motor_test_data_points', 'GET', null, req.query);
      res.json(data);
    }
  } catch (err) {
    console.error('[Custom data-points handler error]', err);
    res.status(500).json({ error: err.message });
  }
});

// Generic Table proxy endpoints (enforces tableMap routing constraints)
app.all('/api/admin/:table', async (req, res) => {
  const clientTable = req.params.table;
  const dbTable = tableMap[clientTable] || clientTable.replace(/-/g, '_');

  let method = req.method.toUpperCase();
  if (method === 'PUT') method = 'PATCH';

  try {
    const payload = ['POST', 'PATCH'].includes(method) ? req.body : null;
    const data = await queryTable(dbTable, method, payload, req.query);
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.all('/api/admin/:table/:id', async (req, res) => {
  const clientTable = req.params.table;
  const dbTable = tableMap[clientTable] || clientTable.replace(/-/g, '_');
  req.query.id = `eq.${req.params.id}`;

  let method = req.method.toUpperCase();
  if (method === 'PUT') method = 'PATCH';

  try {
    const payload = ['POST', 'PATCH'].includes(method) ? req.body : null;
    const data = await queryTable(dbTable, method, payload, req.query);
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// fallback 404 handler
app.use((_req, res) => res.status(404).json({ error: 'Not found' }));

app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Standalone Admin Portal running on http://localhost:${PORT}`);
});
