'use strict';
const pool = require('../config/db');
const { queryTable } = require('../utils/queryBuilder');

// ACL rules for dynamic database table API endpoints
const ACL = {
  motors:                 { GET: ['guest', 'user', 'admin'], POST: ['user', 'admin'], PATCH: ['user', 'admin'], DELETE: ['admin'] },
  categories:             { GET: ['guest', 'user', 'admin'], POST: ['user', 'admin'], PATCH: ['user', 'admin'], DELETE: ['user', 'admin'] },
  custom_specs_schema:    { GET: ['guest', 'user', 'admin'], POST: ['user', 'admin'], PATCH: ['user', 'admin'], DELETE: ['user', 'admin'] },
  access_requests:        { GET: ['admin'], POST: ['guest', 'user', 'admin'], PATCH: ['admin'], DELETE: ['admin'] },
  user_onboarding:        { GET: ['guest', 'user', 'admin'], POST: ['guest', 'user', 'admin'], PATCH: ['guest', 'user', 'admin'] },
  motor_test_runs:        { GET: ['guest', 'user', 'admin'], POST: ['user', 'admin'], PATCH: ['user', 'admin'], DELETE: ['user', 'admin'] },
  motor_test_data_points: { GET: ['guest', 'user', 'admin'], POST: ['user', 'admin'], PATCH: ['user', 'admin'], DELETE: ['user', 'admin'] },
  draft_test_runs:        { GET: ['guest', 'user', 'admin'], POST: ['user', 'admin'], PATCH: ['user', 'admin'], DELETE: ['user', 'admin'] },
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
      categories:      cats.rows,
      category_counts: categoryCounts,
      custom_schema:   schema.rows,
      first_motors:    motors.rows,
      has_more:        motors.rows.length >= LIMIT,
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

async function requestAccess(req, res) {
  const { fullName, email, requestedRole, justification } = req.body || {};
  if (!fullName || !email || !requestedRole || !justification) {
    return res.status(400).json({ error: 'Missing required fields' });
  }
  try {
    const dup = await pool.query('SELECT id FROM user_profiles WHERE email = $1', [email]);
    if (dup.rows.length) return res.status(409).json({ error: 'An account already exists with this email.' });
    const pend = await pool.query("SELECT id FROM access_requests WHERE email = $1 AND status = 'pending'", [email]);
    if (pend.rows.length) return res.status(409).json({ error: 'A request is already pending for this email.' });

    await queryTable('access_requests', 'POST', {
      full_name: fullName,
      email,
      requested_role: requestedRole,
      justification,
      status: 'pending',
    });
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}

// ── Generic Database API Proxy ───────────────────────────────────────────────

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
  if (!isAnonPost) {
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
