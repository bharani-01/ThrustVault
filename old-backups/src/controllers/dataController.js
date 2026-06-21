'use strict';
const crypto = require('crypto');
const pool = require('../config/db');
const { queryTable } = require('../utils/queryBuilder');

// ACL rules for dynamic database table API endpoints
const ACL = {
  motors: { GET: ['guest', 'user', 'admin'], POST: ['user', 'admin'], PATCH: ['user', 'admin'], DELETE: ['admin'] },
  categories: { GET: ['guest', 'user', 'admin'], POST: ['user', 'admin'], PATCH: ['user', 'admin'], DELETE: ['user', 'admin'] },
  custom_specs_schema: { GET: ['guest', 'user', 'admin'], POST: ['user', 'admin'], PATCH: ['user', 'admin'], DELETE: ['user', 'admin'] },
  access_requests: { GET: ['admin'], POST: ['guest', 'user', 'admin'], PATCH: ['admin'], DELETE: ['admin'] },
  user_onboarding: { GET: ['guest', 'user', 'admin'], POST: ['guest', 'user', 'admin'], PATCH: ['guest', 'user', 'admin'] },
  motor_test_runs: { GET: ['guest', 'user', 'admin'], POST: ['user', 'admin'], PATCH: ['user', 'admin'], DELETE: ['user', 'admin'] },
  motor_test_data_points: { GET: ['guest', 'user', 'admin'], POST: ['user', 'admin'], PATCH: ['user', 'admin'], DELETE: ['user', 'admin'] },
  draft_test_runs: { GET: ['guest', 'user', 'admin'], POST: ['user', 'admin'], PATCH: ['user', 'admin'], DELETE: ['user', 'admin'] },
};

/**
 * Bootstrap data query to get categories, motor counts, custom parameters schema,
 * and first 15 motors in a single parallel operation.
 */
async function initData(req, res) {
  const LIMIT = 15;
  try {
    const [cats, counts, schema, motors] = await Promise.all([
      pool.query('SELECT id, name, description FROM categories ORDER BY name'),
      pool.query('SELECT category_id, COUNT(*)::int AS cnt FROM motors GROUP BY category_id'),
      pool.query('SELECT * FROM custom_specs_schema ORDER BY created_at'),
      pool.query(`SELECT id, category_id, motor_name, company, max_thrust,
                         recommended_esc, recommended_propeller,
                         link_motor, link_esc, link_propeller, custom_parameters
                  FROM motors ORDER BY max_thrust ASC LIMIT $1`, [LIMIT]),
    ]);

    const categoryCounts = {};
    counts.rows.forEach(r => {
      if (r.category_id) categoryCounts[String(r.category_id)] = r.cnt;
    });

    res.json({
      categories: cats.rows,
      category_counts: categoryCounts,
      custom_schema: schema.rows,
      first_motors: motors.rows,
      has_more: motors.rows.length >= LIMIT,
    });
  } catch (e) {
    console.error('[init-data]', e.message);
    res.status(500).json({ error: e.message });
  }
}

// ── Motors ───────────────────────────────────────────────────────────────────

async function getMotors(req, res) {
  try {
    res.json(await queryTable('motors', 'GET', null, req.query));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}

async function createMotor(req, res) {
  try {
    res.json(await queryTable('motors', 'POST', req.body, null));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}

async function updateRecommendations(req, res) {
  const ALLOWED = ['recommended_esc', 'recommended_propeller', 'recommended_battery', 'link_esc', 'link_propeller'];
  const payload = {};
  ALLOWED.forEach(k => {
    if (req.body[k] !== undefined) payload[k] = req.body[k];
  });
  if (!Object.keys(payload).length) return res.status(400).json({ error: 'No valid fields' });
  try {
    res.json(await queryTable('motors', 'PATCH', payload, { id: `eq.${req.params.id}` }));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}

// ── Categories ───────────────────────────────────────────────────────────────

async function getCategories(req, res) {
  try {
    res.json(await queryTable('categories', 'GET', null, req.query));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}

async function createCategory(req, res) {
  try {
    res.json(await queryTable('categories', 'POST', req.body, null));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}

async function deleteCategory(req, res) {
  try {
    res.json(await queryTable('categories', 'DELETE', null, { id: `eq.${req.params.id}` }));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}

// ── Custom Specs Schema ──────────────────────────────────────────────────────

async function getCustomSpecs(req, res) {
  try {
    res.json(await queryTable('custom_specs_schema', 'GET', null, req.query));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}

async function createCustomSpec(req, res) {
  try {
    res.json(await queryTable('custom_specs_schema', 'POST', req.body, null));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}

async function deleteCustomSpec(req, res) {
  try {
    res.json(await queryTable('custom_specs_schema', 'DELETE', null, { id: `eq.${req.params.id}` }));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}

// ── Onboarding ───────────────────────────────────────────────────────────────

async function getOnboarding(req, res) {
  const uid = req.session.uid;
  try {
    const r = await pool.query('SELECT * FROM user_onboarding WHERE user_id = $1', [uid]);
    res.json(r.rows[0] || { user_id: uid, pages_progress: {}, tour_completed: false });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}

async function saveOnboarding(req, res) {
  const uid = req.session.uid;
  const payload = { ...req.body, user_id: uid };
  try {
    const ex = await pool.query('SELECT id FROM user_onboarding WHERE user_id = $1', [uid]);
    if (ex.rows.length > 0) {
      res.json(await queryTable('user_onboarding', 'PATCH', payload, { user_id: `eq.${uid}` }));
    } else {
      res.json(await queryTable('user_onboarding', 'POST', payload, null));
    }
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}

// ── User Profiles ────────────────────────────────────────────────────────────

async function getUserProfiles(req, res) {
  try {
    res.json(await queryTable('user_profiles', 'GET', null, req.query));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}

// ── Activity Log ─────────────────────────────────────────────────────────────

async function logActivity(req, res) {
  const { email, role, action, details } = req.body || {};
  try {
    await pool.query(
      `INSERT INTO audit_logs (email, role, route, method, status, ip_address, user_agent, risk_level, details)
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
    console.warn('[log-activity]', e.message);
    res.json({ success: false }); // non-fatal
  }
}

// ── Access Requests & Demo ───────────────────────────────────────────────────

async function requestDemo(req, res) {
  const { name, company, email, usecase } = req.body || {};
  if (!name || !company || !email) {
    return res.status(400).json({ success: false, error: 'Missing required fields' });
  }
  try {
    await queryTable('access_requests', 'POST', {
      full_name: name,
      email,
      requested_role: 'guest',
      justification: `Demo Request — Company: ${company}, Use Case: ${usecase || 'research'}`,
      status: 'pending',
    });
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
}

async function sendResendEmail({ type, to, full_name, temp_password }) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey || apiKey === 're_placeholder_key') {
    console.warn('EMAIL SYSTEM WARNING: RESEND_API_KEY is not configured. Email skipped.');
    return;
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
          <p>Hello ${full_name},</p>
          <p>Thank you for requesting access to the <strong>ThrustVault UAV Motor Database Console</strong>. We have received your request.</p>
          <p>Our administrators are currently reviewing your application. You will receive an email notification once a decision has been made.</p>
          <p style="margin-top: 30px; font-size: 0.82rem; color: #64748b; border-top: 1px solid #e2e8f0; padding-top: 15px;">
              This is an automated notification from ThrustVault. Please do not reply directly to this email.
          </p>
      </div>
    `;
  } else if (type === 'approved') {
    subject = 'ThrustVault Access Approved';
    html = `
      <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 25px; border: 1px solid #e2e8f0; border-radius: 12px; background-color: #ffffff;">
          <div style="text-align: center; border-bottom: 2px solid #059669; padding-bottom: 15px; margin-bottom: 20px;">
              <h2 style="color: #059669; margin: 0; font-family: sans-serif;">Access Approved</h2>
          </div>
          <p>Hello ${full_name},</p>
          <p>We are pleased to inform you that your access request to the <strong>ThrustVault UAV Motor Database Console</strong> has been approved.</p>
          <p>You can log in using the temporary credentials below:</p>
          <table style="background-color: #f8fafc; padding: 15px; border-radius: 8px; width: 100%; border: 1px solid #e2e8f0; font-family: monospace; margin: 15px 0;">
              <tr><td style="padding: 5px;"><strong>Email:</strong></td><td style="padding: 5px;">${to}</td></tr>
              <tr><td style="padding: 5px;"><strong>Default Password:</strong></td><td style="padding: 5px;"><code>${temp_password}</code></td></tr>
          </table>
          <p style="margin-top: 30px; font-size: 0.82rem; color: #64748b; border-top: 1px solid #e2e8f0; padding-top: 15px;">
              This is an automated notification from ThrustVault. Please do not reply directly to this email.
          </p>
      </div>
    `;
  }

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from: 'ThrustVault <no-reply@bharani-01.xyz>',
        to: [to],
        subject,
        html
      })
    });
    if (!res.ok) {
      const errBody = await res.text();
      console.error(`Resend API returned error status ${res.status}: ${errBody}`);
    }
  } catch (e) {
    console.error('Failed to send email via Resend:', e.message);
  }
}

async function requestAccess(req, res) {
  const { fullName, email, justification } = req.body || {};
  if (!fullName || !email || !justification) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    return res.status(400).json({ error: 'Invalid email address format' });
  }

  try {
    const dup = await pool.query('SELECT id FROM user_profiles WHERE email = $1', [email]);
    if (dup.rows.length) return res.status(409).json({ error: 'An account already exists with this email.' });

    const pend = await pool.query("SELECT id FROM access_requests WHERE email = $1 AND status = 'pending'", [email]);
    if (pend.rows.length) return res.status(409).json({ error: 'A request is already pending for this email.' });

    // Check system settings for auto approve
    const settingsRes = await pool.query("SELECT value FROM public.system_settings WHERE key = 'auto_approve'");
    const autoApprove = settingsRes.rows[0]?.value === true || settingsRes.rows[0]?.value === 'true';

    if (autoApprove) {
      const tempPassword = crypto.randomBytes(6).toString('hex') + 'V@' + Math.floor(Math.random() * 100);
      const newUid = crypto.randomUUID();
      const client = await pool.connect();
      try {
        await client.query('BEGIN');

        // 1. Insert into auth.users
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
            json_build_object('role', 'user')::jsonb,
            now(), now(), '', '', '', ''
          )
        `, [newUid, email, tempPassword]);

        // 2. Insert into public.user_profiles (role is 'user' directly now)
        await client.query(`
          INSERT INTO public.user_profiles (id, email, role)
          VALUES ($1, $2, 'user')
          ON CONFLICT (id) DO UPDATE SET email = EXCLUDED.email, role = EXCLUDED.role
        `, [newUid, email]);

        // 3. Save approved access request
        await client.query(`
          INSERT INTO public.access_requests (full_name, email, requested_role, justification, status)
          VALUES ($1, $2, 'user', $3, 'approved')
        `, [fullName, email, justification]);

        await client.query('COMMIT');
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      } finally {
        client.release();
      }

      sendResendEmail({
        type: 'approved',
        to: email,
        full_name: fullName,
        temp_password: tempPassword
      }).catch(console.error);

      return res.json({ success: true, auto_approved: true });

    } else {
      await queryTable('access_requests', 'POST', {
        full_name: fullName,
        email,
        requested_role: 'user',
        justification,
        status: 'pending',
      });

      sendResendEmail({
        type: 'received',
        to: email,
        full_name: fullName
      }).catch(console.error);

      return res.json({ success: true, auto_approved: false });
    }

  } catch (e) {
    console.error('[requestAccess]', e.message);
    res.status(500).json({ error: e.message });
  }
}

async function dbProxy(req, res) {
  const table = req.params.table.replace(/-/g, '_');
  let method = req.method.toUpperCase();
  if (method === 'PUT') method = 'PATCH';

  if (!ACL[table]) return res.status(400).json({ error: `Table '${table}' not supported` });

  const allowedRoles = ACL[table][method] || [];
  const role = req.session.role;
  const uid = req.session.uid;
  const ts = req.session.timestamp || 0;

  const isAnonPost = table === 'access_requests' && method === 'POST';
  const isAnonGet = ['motors', 'categories', 'custom_specs_schema', 'motor_test_runs', 'motor_test_data_points'].includes(table) && method === 'GET';

  if (!isAnonPost && !isAnonGet) {
    if (!role || !uid || Date.now() - ts > 86_400_000) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    if (!allowedRoles.includes(role)) {
      return res.status(403).json({ error: `Forbidden: ${role} cannot ${method} ${table}` });
    }
  }

  const qp = { ...req.query };
  if (table === 'user_onboarding') qp.user_id = `eq.${uid}`;

  try {
    let m = method;
    if (table === 'user_onboarding' && method === 'POST') {
      const ex = await pool.query('SELECT id FROM user_onboarding WHERE user_id = $1', [uid]);
      if (ex.rows.length) {
        m = 'PATCH';
        Object.keys(qp).forEach(k => {
          if (k !== 'user_id') delete qp[k];
        });
      }
    }
    const payload = ['POST', 'PATCH'].includes(m) ? req.body : null;
    const data = await queryTable(table, m, payload, qp);
    if (table === 'user_onboarding' && m === 'GET') {
      return res.json(data.length ? data[0] : { user_id: uid, pages_progress: {}, tour_completed: false });
    }
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}

module.exports = {
  initData,
  getMotors,
  createMotor,
  updateRecommendations,
  getCategories,
  createCategory,
  deleteCategory,
  getCustomSpecs,
  createCustomSpec,
  deleteCustomSpec,
  getOnboarding,
  saveOnboarding,
  getUserProfiles,
  logActivity,
  requestDemo,
  requestAccess,
  dbProxy,
};
