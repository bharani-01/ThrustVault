'use strict';
const crypto = require('crypto');
const pool = require('../config/db');
const { queryTable } = require('../utils/queryBuilder');

// ACL rules for dynamic database table API endpoints (excluding guest read operations which are handled via guestRoutes)
const ACL = {
  motors: { POST: ['user', 'admin'], PATCH: ['admin'], DELETE: ['admin'] },
  categories: { POST: ['user', 'admin'], PATCH: ['user', 'admin'], DELETE: ['user', 'admin'] },
  custom_specs_schema: { POST: ['user', 'admin'], PATCH: ['user', 'admin'], DELETE: ['user', 'admin'] },
  access_requests: { GET: ['admin'], POST: ['user', 'admin'], PATCH: ['admin'], DELETE: ['admin'] },
  user_onboarding: { GET: ['user', 'admin'], POST: ['user', 'admin'], PATCH: ['user', 'admin'] },
  motor_test_runs: { GET: ['user', 'admin'], POST: ['user', 'admin'], PATCH: ['user', 'admin'], DELETE: ['user', 'admin'] },
  motor_test_data_points: { GET: ['user', 'admin'], POST: ['user', 'admin'], PATCH: ['user', 'admin'], DELETE: ['user', 'admin'] },
  draft_test_runs: { GET: ['user', 'admin'], POST: ['user', 'admin'], PATCH: ['user', 'admin'], DELETE: ['user', 'admin'] },
  escs: { GET: ['user', 'admin'], POST: ['user', 'admin'], PATCH: ['admin'], DELETE: ['admin'] },
  propellers: { GET: ['user', 'admin'], POST: ['user', 'admin'], PATCH: ['admin'], DELETE: ['admin'] },
  audit_logs: { GET: ['user', 'admin'] },
};

let cachedDashboardStats = null;

async function getOrCalculateStats() {
  if (cachedDashboardStats) {
    return cachedDashboardStats;
  }

  try {
    const res = await pool.query('SELECT max_thrust, recommended_esc, motor_name, custom_parameters FROM motors');
    const allMotors = res.rows;

    const totalMotors = allMotors.length;

    function parseThrustToKg(thrustStr) {
      if (!thrustStr) return 0;
      const normalized = String(thrustStr).trim().toLowerCase().replace(/\s+/g, '');
      const match = normalized.match(/^([0-9.]+)(kg|g)?$/);
      if (match) {
        const val = parseFloat(match[1]);
        const unit = match[2] || 'kg';
        return unit === 'g' ? val / 1000 : val;
      }
      const numbers = normalized.match(/[0-9.]+/);
      if (numbers) {
        const val = parseFloat(numbers[0]);
        return (normalized.includes('g') && !normalized.includes('kg')) ? val / 1000 : val;
      }
      return 0;
    }

    let minThrust = Infinity;
    let maxThrust = -Infinity;
    allMotors.forEach(m => {
      const parsed = parseThrustToKg(m.max_thrust);
      if (parsed > 0) {
        if (parsed < minThrust) minThrust = parsed;
        if (parsed > maxThrust) maxThrust = parsed;
      }
    });

    let minThrustVal = 0;
    let maxThrustVal = 0;
    let thrustRangeStr = 'N/A';
    let maxThrustStr = 'N/A';

    if (minThrust !== Infinity && maxThrust !== -Infinity) {
      minThrustVal = minThrust;
      maxThrustVal = maxThrust;
      thrustRangeStr = minThrust === maxThrust 
        ? `${minThrust.toFixed(2)} kg` 
        : `${minThrust.toFixed(2)} – ${maxThrust.toFixed(2)} kg`;
      maxThrustStr = `${maxThrust.toFixed(2)} kg`;
    }

    let sRatings = [];
    allMotors.forEach(m => {
      const customParams = m.custom_parameters || {};
      const v = (customParams.voltage || customParams.voltage_v || customParams.operating_voltage)
        ? String(customParams.voltage || customParams.voltage_v || customParams.operating_voltage)
        : '';
      const esc = m.recommended_esc || '';
      const name = m.motor_name || '';
      
      const match = v.match(/(\d+)s/i) || esc.match(/(\d+)s/i) || name.match(/(\d+)s/i);
      if (match) {
        const val = parseInt(match[1], 10);
        if (val >= 1 && val <= 24) {
          sRatings.push(val);
        }
      }
    });

    let voltageRangeStr = 'N/A';
    if (sRatings.length > 0) {
      const minS = Math.min(...sRatings);
      const maxS = Math.max(...sRatings);
      voltageRangeStr = minS === maxS ? `${minS}S` : `${minS}S – ${maxS}S`;
    }

    cachedDashboardStats = {
      total_motors: totalMotors,
      min_thrust: minThrustVal,
      max_thrust: maxThrustVal,
      thrust_range: thrustRangeStr,
      max_thrust_str: maxThrustStr,
      voltage_range: voltageRangeStr
    };

    return cachedDashboardStats;
  } catch (err) {
    console.error('Error calculating stats:', err);
    return {
      total_motors: 0,
      min_thrust: 0,
      max_thrust: 0,
      thrust_range: 'N/A',
      max_thrust_str: 'N/A',
      voltage_range: 'N/A'
    };
  }
}

function invalidateStatsCache() {
  cachedDashboardStats = null;
}

/**
 * Bootstrap data query to get categories, motor counts, custom parameters schema,
 * and first 15 motors in a single parallel operation.
 */
async function initData(req, res) {
  const LIMIT = 15;
  try {
    const [cats, counts, schema, motors, kpis, brandsQuery] = await Promise.all([
      pool.query('SELECT id, name, description FROM categories ORDER BY name'),
      pool.query('SELECT category_id, COUNT(*)::int AS cnt FROM motors GROUP BY category_id'),
      pool.query('SELECT * FROM custom_specs_schema ORDER BY created_at'),
      pool.query(`SELECT id, category_id, motor_name, company, max_thrust,
                         recommended_esc, recommended_propeller,
                         link_motor, link_esc, link_propeller, custom_parameters, uploaded_by,
                         main_image, gallery_images
                  FROM motors ORDER BY max_thrust ASC LIMIT $1`, [LIMIT]),
      getOrCalculateStats(),
      pool.query("SELECT DISTINCT company FROM motors WHERE company IS NOT NULL AND company != '' ORDER BY company")
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
      dashboard_stats: kpis,
      brands: brandsQuery.rows.map(r => r.company).filter(Boolean)
    });
  } catch (e) {
    console.error('[init-data]', e.message);
    res.status(500).json({ error: e.message });
  }
}

// ── Motors ───────────────────────────────────────────────────────────────────

async function getMotors(req, res) {
  try {
    const qp = { ...req.query };
    
    // Fetch total count without limit, offset, or order using a lightweight id select
    delete qp.limit;
    delete qp.offset;
    delete qp.order;
    qp.select = 'id';
    
    const allMatching = await queryTable('motors', 'GET', null, qp);
    const totalCount = allMatching.length;
    
    const data = await queryTable('motors', 'GET', null, req.query);
    res.setHeader('X-Total-Count', totalCount);
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}

async function createMotor(req, res) {
  try {
    // Dynamic tracking of uploader
    const payload = { ...req.body, uploaded_by: req.session.email };
    invalidateStatsCache();
    res.json(await queryTable('motors', 'POST', payload, null));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}

// ── ESCs ─────────────────────────────────────────────────────────────────────

async function getEscs(req, res) {
  try {
    const qp = { ...req.query };
    delete qp.limit;
    delete qp.offset;
    delete qp.order;
    qp.select = 'id';
    const allMatching = await queryTable('escs', 'GET', null, qp);
    const totalCount = allMatching.length;

    const data = await queryTable('escs', 'GET', null, req.query);
    res.setHeader('X-Total-Count', totalCount);
    res.setHeader('Access-Control-Expose-Headers', 'X-Total-Count');
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}

async function createEsc(req, res) {
  try {
    res.json(await queryTable('escs', 'POST', req.body, null));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}

// ── Propellers ───────────────────────────────────────────────────────────────

async function getPropellers(req, res) {
  try {
    const qp = { ...req.query };
    delete qp.limit;
    delete qp.offset;
    delete qp.order;
    qp.select = 'id';
    const allMatching = await queryTable('propellers', 'GET', null, qp);
    const totalCount = allMatching.length;

    const data = await queryTable('propellers', 'GET', null, req.query);
    res.setHeader('X-Total-Count', totalCount);
    res.setHeader('Access-Control-Expose-Headers', 'X-Total-Count');
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}

async function createPropeller(req, res) {
  try {
    res.json(await queryTable('propellers', 'POST', req.body, null));
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
    invalidateStatsCache();
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
  if (process.env.auditlog === 'false') return res.json({ success: false, disabled: true });
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
    res.json({ success: false });
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

  const appUrl = process.env.APP_BASE_URL || 'https://thrustvault.bharani-01.xyz';
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
          <p>You can visit the console home page here: <a href="${appUrl}" style="color: #2563eb; text-decoration: none; font-weight: 500;">${appUrl}</a></p>
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
          <p style="margin-top: 20px; text-align: center; margin-bottom: 20px;">
              <a href="${appUrl}/login" style="display: inline-block; padding: 10px 20px; background-color: #059669; color: #ffffff; text-decoration: none; border-radius: 8px; font-weight: bold; font-family: sans-serif;">Log In to ThrustVault</a>
          </p>
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
    const dup = await pool.query('SELECT id FROM public.user_profiles WHERE email = $1', [email]);
    if (dup.rows.length) {
      return res.status(409).json({ error: 'An account already exists with this email.' });
    }

    const pend = await pool.query("SELECT id FROM public.access_requests WHERE email = $1 AND status = 'pending'", [email]);
    if (pend.rows.length) return res.status(409).json({ error: 'A request is already pending for this email.' });

    // Check system settings for auto approve
    const settingsRes = await pool.query("SELECT value FROM public.system_settings WHERE key = 'auto_approve'");
    const autoApprove = settingsRes.rows[0]?.value === true || settingsRes.rows[0]?.value === 'true';

    if (autoApprove) {
      const tempPassword = crypto.randomBytes(6).toString('hex') + 'V@' + Math.floor(Math.random() * 100);
      const bcrypt = require('bcryptjs');
      const hash = await bcrypt.hash(tempPassword, 12);
      const newUid = crypto.randomUUID();

      const client = await pool.connect();
      try {
        await client.query('BEGIN');

        // 1. Insert into auth.users to satisfy foreign key constraints
        await client.query(`
          INSERT INTO auth.users (id, email)
          VALUES ($1, $2)
          ON CONFLICT (email) DO NOTHING
        `, [newUid, email]);

        // 2. Insert into public.user_profiles (role is 'user' directly now)
        await client.query(`
          INSERT INTO public.user_profiles (id, email, role, password_hash)
          VALUES ($1, $2, 'user', $3)
          ON CONFLICT (email) DO UPDATE SET role = EXCLUDED.role, password_hash = EXCLUDED.password_hash
        `, [newUid, email, hash]);

        // 2. Save approved access request
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

  // Since Postgres APIs are strictly locked, we enforce that caller must have a valid session
  if (!role || !uid || Date.now() - ts > 86_400_000) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  if (!allowedRoles.includes(role)) {
    return res.status(403).json({ error: `Forbidden: ${role} cannot ${method} ${table}` });
  }

  const qp = { ...req.query };
  if (table === 'user_onboarding') qp.user_id = `eq.${uid}`;
  if (table === 'audit_logs' && role !== 'admin') qp.email = `eq.${req.session.email}`;

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

    // Inject uploaded_by dynamically for new entries in motors or motor_test_runs
    const payload = ['POST', 'PATCH'].includes(m) ? req.body : null;
    if (payload && m === 'POST') {
      if (Array.isArray(payload)) {
        payload.forEach(item => {
          if (table === 'motor_test_runs' || table === 'motors') {
            item.uploaded_by = req.session.email;
          }
        });
      } else if (typeof payload === 'object') {
        if (table === 'motor_test_runs' || table === 'motors') {
          payload.uploaded_by = req.session.email;
        }
      }
    }

    const data = await queryTable(table, m, payload, qp);
    if (table === 'motors' && ['POST', 'PATCH', 'DELETE'].includes(m)) {
      invalidateStatsCache();
    }
    if (table === 'user_onboarding' && m === 'GET') {
      return res.json(data.length ? data[0] : { user_id: uid, pages_progress: {}, tour_completed: false });
    }
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}

async function getGuestCustomSpecs(req, res) {
  try {
    const result = await pool.query('SELECT * FROM public.custom_specs_schema ORDER BY created_at');
    res.json(result.rows);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}

async function getGuestShareItem(req, res) {
  const { type, name } = req.params;
  
  if (!type || !name) {
    return res.status(400).json({ error: 'Type and name parameters are required.' });
  }

  const validTypes = ['motor', 'esc', 'propeller'];
  if (!validTypes.includes(type.toLowerCase())) {
    return res.status(400).json({ error: `Invalid type. Must be one of: ${validTypes.join(', ')}` });
  }

  try {
    let queryResult;
    const decodedName = decodeURIComponent(name).trim();

    if (type.toLowerCase() === 'motor') {
      const sqlExact = `
        SELECT m.*, c.name AS category_name
        FROM public.motors m
        LEFT JOIN public.categories c ON m.category_id = c.id
        WHERE LOWER(m.motor_name) = LOWER($1) OR LOWER(m.id::text) = LOWER($1)
      `;
      queryResult = await pool.query(sqlExact, [decodedName]);

      if (!queryResult || queryResult.rows.length === 0) {
        const sqlFuzzy = `
          SELECT m.*, c.name AS category_name
          FROM public.motors m
          LEFT JOIN public.categories c ON m.category_id = c.id
          WHERE m.motor_name ILIKE $1
          LIMIT 1
        `;
        queryResult = await pool.query(sqlFuzzy, [`%${decodedName}%`]);
      }
    } else if (type.toLowerCase() === 'esc') {
      const sqlExact = `
        SELECT *
        FROM public.escs
        WHERE LOWER(name) = LOWER($1) OR LOWER(id::text) = LOWER($1)
      `;
      queryResult = await pool.query(sqlExact, [decodedName]);

      if (!queryResult || queryResult.rows.length === 0) {
        const sqlFuzzy = `
          SELECT *
          FROM public.escs
          WHERE name ILIKE $1
          LIMIT 1
        `;
        queryResult = await pool.query(sqlFuzzy, [`%${decodedName}%`]);
      }
    } else if (type.toLowerCase() === 'propeller') {
      const sqlExact = `
        SELECT *
        FROM public.propellers
        WHERE LOWER(name) = LOWER($1) OR LOWER(id::text) = LOWER($1)
      `;
      queryResult = await pool.query(sqlExact, [decodedName]);

      if (!queryResult || queryResult.rows.length === 0) {
        const sqlFuzzy = `
          SELECT *
          FROM public.propellers
          WHERE name ILIKE $1
          LIMIT 1
        `;
        queryResult = await pool.query(sqlFuzzy, [`%${decodedName}%`]);
      }
    }

    if (!queryResult || queryResult.rows.length === 0) {
      return res.status(404).json({ error: `${type} with name "${decodedName}" not found.` });
    }

    const item = queryResult.rows[0];

    // Standardize property names for frontend compatibility
    item.name = item.name || item.motor_name || item.motor;
    item.motor_name = item.motor_name || item.name;
    item.motor = item.motor || item.motor_name || item.name;
    item.brand = item.brand || item.company;
    item.company = item.company || item.brand;
    item.main_image = item.main_image || item.mainImage;
    item.mainImage = item.mainImage || item.main_image;
    item.gallery_images = item.gallery_images || item.galleryImages;
    item.galleryImages = item.galleryImages || item.gallery_images;

    if (item.custom_parameters && typeof item.custom_parameters === 'string') {
      try {
        item.custom_parameters = JSON.parse(item.custom_parameters);
      } catch (e) {}
    }
    if (item.gallery_images && typeof item.gallery_images === 'string') {
      try {
        item.gallery_images = JSON.parse(item.gallery_images);
      } catch (e) {}
    }

    res.json(item);
  } catch (e) {
    console.error('[guest-get-share-item]', e.message);
    res.status(500).json({ error: e.message });
  }
}

async function searchGuestMotors(req, res) {
  const q     = String(req.query.q || '').trim();
  const limit = Math.min(parseInt(req.query.limit, 10) || 8, 20);

  if (!q || q.length < 2) {
    return res.json([]);
  }

  try {
    const pattern = `%${q}%`;
    const sql = `
      SELECT m.id, m.motor_name, m.company, m.max_thrust,
             m.category_id, c.name AS category_name,
             m.custom_parameters
      FROM public.motors m
      LEFT JOIN public.categories c ON m.category_id = c.id
      WHERE m.motor_name ILIKE $1 OR m.company ILIKE $1
      ORDER BY m.motor_name ASC
      LIMIT $2
    `;
    const queryResult = await pool.query(sql, [pattern, limit]);
    const result = queryResult.rows.map(r => {
      if (r.custom_parameters && typeof r.custom_parameters === 'string') {
        try { r.custom_parameters = JSON.parse(r.custom_parameters); } catch (e) {}
      }
      return r;
    });
    res.json(result);
  } catch (e) {
    console.error('[guest-search-motors]', e.message);
    res.status(500).json({ error: e.message });
  }
}

async function getGuestDbTable(req, res) {
  const table = req.params.table.replace(/-/g, '_');
  try {
    const validTables = ['motor_test_runs', 'motor_test_data_points'];
    if (!validTables.includes(table)) {
      return res.status(403).json({ error: 'Access denied' });
    }
    let sql = `SELECT * FROM public.${table}`;
    const params = [];
    if (req.query.motor_id) {
      sql += ` WHERE motor_id = $1`;
      params.push(req.query.motor_id.replace(/^eq\./, ''));
    } else if (req.query.test_run_id) {
      sql += ` WHERE test_run_id = $1`;
      params.push(req.query.test_run_id.replace(/^eq\./, ''));
    }
    if (req.query.order) {
      const parts = req.query.order.split('.');
      sql += ` ORDER BY ${parts[0]} ${parts[1] ? parts[1].toUpperCase() : 'ASC'}`;
    }
    if (req.query.limit) {
      sql += ` LIMIT ${parseInt(req.query.limit, 10)}`;
    }
    const resDb = await pool.query(sql, params);
    res.json(resDb.rows);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}

async function findItemByName(req, res) {
  const { name } = req.params;
  if (!name) return res.status(400).json({ error: 'Missing name parameter' });
  const decodedName = decodeURIComponent(name).trim();
  
  try {
    // 1. Search in motors
    let motorRes = await pool.query(
      `SELECT id, motor_name AS name FROM public.motors WHERE LOWER(motor_name) = LOWER($1) LIMIT 1`,
      [decodedName]
    );
    if (!motorRes.rows.length) {
      motorRes = await pool.query(
        `SELECT id, motor_name AS name FROM public.motors WHERE motor_name ILIKE $1 LIMIT 1`,
        [`%${decodedName}%`]
      );
    }
    if (motorRes.rows.length > 0) {
      return res.json({ type: 'motor', id: motorRes.rows[0].id, name: motorRes.rows[0].name });
    }

    // 2. Search in escs
    const escRes = await pool.query(
      `SELECT id FROM public.escs WHERE name = $1 OR name ILIKE $1 LIMIT 1`,
      [name]
    );
    if (escRes.rows.length > 0) {
      return res.json({ type: 'esc', id: escRes.rows[0].id });
    }

    // 3. Search in propellers
    const propRes = await pool.query(
      `SELECT id FROM public.propellers WHERE name = $1 OR name ILIKE $1 LIMIT 1`,
      [name]
    );
    if (propRes.rows.length > 0) {
      return res.json({ type: 'propeller', id: propRes.rows[0].id });
    }

    return res.status(404).json({ error: 'Item not found' });
  } catch (err) {
    console.error('[find-item-by-name]', err.message);
    return res.status(500).json({ error: err.message });
  }
}

async function findMotorsWizard(req, res) {
  const {
    min_kv = 50,
    max_kv = 25000,
    min_thrust = 0.01,
    max_thrust = 50,
    min_weight = 0,
    max_weight = 2000,
    cells = '',
    brands = '',
    stator_class = 'all'
  } = req.query;

  try {
    const vals = [];
    const whereParts = [];

    // 1. KV range
    vals.push(parseFloat(min_kv), parseFloat(max_kv));
    whereParts.push(`(
      NULLIF(custom_parameters->>'kv_rating', '')::numeric IS NOT NULL AND
      NULLIF(custom_parameters->>'kv_rating', '')::numeric >= $${vals.length - 1} AND
      NULLIF(custom_parameters->>'kv_rating', '')::numeric <= $${vals.length}
    )`);

    // 2. Thrust range
    const parsedThrustExpr = `COALESCE(
      CASE 
        WHEN max_thrust ILIKE '%g' AND max_thrust NOT ILIKE '%kg' THEN (substring(max_thrust from '^[0-9.]+')::numeric / 1000.0)
        WHEN max_thrust ILIKE '%kg' THEN substring(max_thrust from '^[0-9.]+')::numeric
        ELSE NULLIF(substring(max_thrust from '^[0-9.]+'), '')::numeric
      END, 1.0)`;

    vals.push(parseFloat(min_thrust), parseFloat(max_thrust));
    whereParts.push(`(${parsedThrustExpr} >= $${vals.length - 1} AND ${parsedThrustExpr} <= $${vals.length})`);

    // 3. Weight range
    vals.push(parseFloat(min_weight), parseFloat(max_weight));
    whereParts.push(`(
      NULLIF(custom_parameters->>'weight_g', '')::numeric IS NULL OR
      (
        NULLIF(custom_parameters->>'weight_g', '')::numeric >= $${vals.length - 1} AND
        NULLIF(custom_parameters->>'weight_g', '')::numeric <= $${vals.length}
      )
    )`);

    // 4. Voltage cells
    if (cells) {
      const cellArray = String(cells).split(',').map(c => c.trim()).filter(Boolean);
      if (cellArray.length > 0) {
        const regexPattern = cellArray.map(c => `${c}s`).join('|');
        vals.push(regexPattern);
        whereParts.push(`(custom_parameters->>'operating_voltage' ~* $${vals.length})`);
      }
    }

    // 5. Brands
    if (brands) {
      const brandArray = String(brands).split(',').map(b => b.trim()).filter(Boolean);
      if (brandArray.length > 0) {
        vals.push(brandArray);
        whereParts.push(`(company = ANY($${vals.length}))`);
      }
    }

    // 6. Stator class filter
    if (stator_class && stator_class !== 'all') {
      const statorExpr = `CASE
        WHEN NULLIF(substring(custom_parameters->>'stator_size' from '^\\d{2}'), '')::numeric < 14 THEN 'micro'
        WHEN NULLIF(substring(custom_parameters->>'stator_size' from '^\\d{2}'), '')::numeric >= 14 AND NULLIF(substring(custom_parameters->>'stator_size' from '^\\d{2}'), '')::numeric < 22 THEN 'mini'
        WHEN NULLIF(substring(custom_parameters->>'stator_size' from '^\\d{2}'), '')::numeric >= 22 AND NULLIF(substring(custom_parameters->>'stator_size' from '^\\d{2}'), '')::numeric <= 25 THEN 'standard'
        WHEN NULLIF(substring(custom_parameters->>'stator_size' from '^\\d{2}'), '')::numeric >= 26 THEN 'heavy'
        ELSE 'standard'
      END`;
      vals.push(stator_class);
      whereParts.push(`(${statorExpr} = $${vals.length})`);
    }

    let sql = `
      SELECT id, motor_name, company, max_thrust, recommended_esc, recommended_propeller, custom_parameters
      FROM public.motors
    `;
    if (whereParts.length) {
      sql += ` WHERE ${whereParts.join(' AND ')}`;
    }
    sql += ` ORDER BY motor_name ASC LIMIT 200`;

    const resDb = await pool.query(sql, vals);
    
    const results = resDb.rows.map(m => {
      let sClass = 'standard';
      const statorSize = m.custom_parameters?.stator_size || m.motor_name || '';
      const sizeMatch = String(statorSize).match(/(\d{2})\d{2}/);
      if (sizeMatch) {
        const diameter = parseInt(sizeMatch[1]);
        if (diameter < 14) sClass = 'micro';
        else if (diameter >= 14 && diameter < 22) sClass = 'mini';
        else if (diameter >= 22 && diameter <= 25) sClass = 'standard';
        else if (diameter >= 26) sClass = 'heavy';
      }

      const parseNumber = (val) => {
        if (val === undefined || val === null) return 0;
        const match = String(val).match(/([\d\.]+)/);
        return match ? parseFloat(match[1]) : 0;
      };

      const convertToKg = (val, unit) => {
        switch (unit?.toLowerCase()) {
          case 'g': return val / 1000;
          case 'n': return val / 9.80665;
          case 'lb': return val * 0.453592;
          default: return val;
        }
      };

      const rawThrust = m.max_thrust;
      let kgVal = 1.0;
      if (rawThrust) {
        const match = String(rawThrust).trim().match(/^([\d\.]+)\s*(kg|g|n|lb)?/i);
        if (match) {
          kgVal = convertToKg(parseFloat(match[1]), match[2] || 'kg');
        }
      }

      return {
        id: m.id,
        name: m.motor_name,
        brand: m.company,
        kv: parseNumber(m.custom_parameters?.kv_rating || 0),
        voltage: String(m.custom_parameters?.operating_voltage || ''),
        thrust: kgVal,
        thrustRaw: m.max_thrust,
        propeller: m.recommended_propeller || '—',
        esc: m.recommended_esc || '—',
        weight: parseNumber(m.custom_parameters?.weight_g || m.custom_parameters?.weight_with_cable || m.custom_parameters?.weight_no_cable || 0),
        maxPower: parseNumber(m.custom_parameters?.max_power_w || m.custom_parameters?.max_power || 0),
        maxCurrent: parseNumber(m.custom_parameters?.max_current || m.custom_parameters?.no_load_current || 0),
        statorClass: sClass
      };
    });

    res.json(results);
  } catch (err) {
    console.error('[findMotorsWizard Error]', err.message);
    res.status(500).json({ error: err.message });
  }
}

module.exports = {
  initData,
  getMotors,
  createMotor,
  getEscs,
  createEsc,
  getPropellers,
  createPropeller,
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
  getGuestCustomSpecs,
  getGuestShareItem,
  searchGuestMotors,
  getGuestDbTable,
  findItemByName,
  findMotorsWizard,
};
