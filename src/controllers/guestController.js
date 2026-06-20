'use strict';
const sqliteDb = require('../config/sqlite');
const { querySQLiteTable } = require('../utils/sqliteQueryBuilder');

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
             link_motor, link_esc, link_propeller, custom_parameters, uploaded_by
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

module.exports = {
  initData,
  getMotors,
  getCategories,
  getCustomSpecs,
  getMotorTestRuns,
  getMotorTestDataPoints,
  logActivity,
};
