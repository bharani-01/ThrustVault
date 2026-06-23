'use strict';
const sqliteDb = require('../config/sqlite');
const { querySQLiteTable } = require('../utils/sqliteQueryBuilder');
const pool = require('../config/db');


/**
 * Bootstrap data query to get categories, motor counts, custom parameters schema,
 * and first 15 motors from the local SQLite catalog in a single parallel operation.
 */
async function initData(req, res) {
  const LIMIT = 15;
  try {
    const catsStmt = sqliteDb.prepare('SELECT id, name, description FROM categories ORDER BY name');
    const countsStmt = sqliteDb.prepare('SELECT category_id, COUNT(*) AS cnt FROM motors GROUP BY category_id');
    const schemaStmt = sqliteDb.prepare('SELECT * FROM custom_specs_schema ORDER BY created_at');
    const motorsStmt = sqliteDb.prepare(`
      SELECT id, category_id, motor_name, company, max_thrust,
             recommended_esc, recommended_propeller,
             link_motor, link_esc, link_propeller, custom_parameters, uploaded_by,
             main_image, gallery_images
      FROM motors ORDER BY max_thrust ASC LIMIT ?
    `);

    const catsRows = catsStmt.all();
    const countsRows = countsStmt.all();
    const schemaRows = schemaStmt.all();
    const motorsRows = motorsStmt.all(LIMIT);

    const categoryCounts = {};
    countsRows.forEach(r => {
      if (r.category_id) categoryCounts[String(r.category_id)] = r.cnt;
    });

    const parsedMotors = motorsRows.map(m => {
      const copy = { ...m };
      if (copy.custom_parameters && typeof copy.custom_parameters === 'string') {
        try {
          copy.custom_parameters = JSON.parse(copy.custom_parameters);
        } catch (e) {}
      }
      if (copy.gallery_images && typeof copy.gallery_images === 'string') {
        try {
          copy.gallery_images = JSON.parse(copy.gallery_images);
        } catch (e) {}
      }
      return copy;
    });

    res.json({
      categories:      catsRows,
      category_counts: categoryCounts,
      custom_schema:   schemaRows,
      first_motors:    parsedMotors,
      has_more:        parsedMotors.length >= LIMIT,
    });
  } catch (e) {
    console.error('[guest-init-data]', e.message);
    res.status(500).json({ error: e.message });
  }
}

async function getMotors(req, res) {
  try {
    const data = await querySQLiteTable('motors', req.query);
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}

/**
 * GET /api/guest/motors/search?q=<term>&limit=<n>
 * Full-text LIKE search across motor_name and company columns.
 */
async function searchMotors(req, res) {
  const q     = String(req.query.q || '').trim();
  const limit = Math.min(parseInt(req.query.limit, 10) || 8, 20);

  if (!q || q.length < 2) {
    return res.json([]);
  }

  try {
    const pattern = `%${q}%`;
    const stmt = sqliteDb.prepare(`
      SELECT m.id, m.motor_name, m.company, m.max_thrust,
             m.category_id, c.name AS category_name,
             m.custom_parameters
      FROM motors m
      LEFT JOIN categories c ON m.category_id = c.id
      WHERE m.motor_name LIKE ? OR m.company LIKE ?
      ORDER BY m.motor_name ASC
      LIMIT ?
    `);
    const rows = stmt.all(pattern, pattern, limit);

    const result = rows.map(r => {
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

async function getCategories(req, res) {
  try {
    const data = await querySQLiteTable('categories', req.query);
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}

async function getCustomSpecs(req, res) {
  try {
    const data = await querySQLiteTable('custom_specs_schema', req.query);
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}

async function getMotorTestRuns(req, res) {
  try {
    const data = await querySQLiteTable('motor_test_runs', req.query);
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}

async function getMotorTestDataPoints(req, res) {
  try {
    const data = await querySQLiteTable('motor_test_data_points', req.query);
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}

async function logActivity(req, res) {
  const { email, role, action, details } = req.body || {};
  try {
    const stmt = sqliteDb.prepare(`
      INSERT INTO audit_logs (email, role, route, method, status, ip_address, user_agent, risk_level, details)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      email || 'Anonymous Guest',
      role || 'guest',
      action || 'Guest-API-Activity',
      req.method || 'POST',
      200,
      req.ip || req.headers['x-forwarded-for'] || '127.0.0.1',
      req.headers['user-agent'] || 'Node Client (SQLite)',
      'info',
      details || ''
    );

    res.json({ success: true });
  } catch (e) {
    console.warn('[guest-log-activity]', e.message);
    res.json({ success: false }); // non-fatal
  }
}

async function getShareItem(req, res) {
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
    if (type.toLowerCase() === 'motor') {
      const sql = `
        SELECT m.*, c.name AS category_name
        FROM public.motors m
        LEFT JOIN public.categories c ON m.category_id = c.id
        WHERE LOWER(m.motor_name) = LOWER($1)
      `;
      queryResult = await pool.query(sql, [name]);
    } else if (type.toLowerCase() === 'esc') {
      const sql = `
        SELECT *
        FROM public.escs
        WHERE LOWER(name) = LOWER($1)
      `;
      queryResult = await pool.query(sql, [name]);
    } else if (type.toLowerCase() === 'propeller') {
      const sql = `
        SELECT *
        FROM public.propellers
        WHERE LOWER(name) = LOWER($1)
      `;
      queryResult = await pool.query(sql, [name]);
    }

    if (!queryResult || queryResult.rows.length === 0) {
      return res.status(404).json({ error: `${type} with name "${name}" not found.` });
    }

    const item = queryResult.rows[0];

    // Safely parse JSON properties if they are strings
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

module.exports = {
  initData,
  getMotors,
  searchMotors,
  getCategories,
  getCustomSpecs,
  getMotorTestRuns,
  getMotorTestDataPoints,
  logActivity,
  getShareItem,
};

