'use strict';
const pool = require('../config/db');
const sqliteDb = require('../config/sqlite');

/**
 * Startup synchronization from PostgreSQL to SQLite
 */
async function syncPostgresToSqlite() {
  console.log('🔄 Starting PostgreSQL to SQLite database synchronization...');
  
  try {
    // 1. Fetch all records from Postgres
    const [cats, motors, specs, runs, points] = await Promise.all([
      pool.query('SELECT id, name, description, created_at, updated_at FROM categories'),
      pool.query('SELECT id, category_id, motor_name, company, max_thrust, recommended_esc, recommended_propeller, link_motor, link_esc, link_propeller, custom_parameters, uploaded_by, created_at, updated_at FROM motors'),
      pool.query('SELECT id, field_key, field_name, field_type, field_unit, created_at FROM custom_specs_schema'),
      pool.query('SELECT id, motor_id, propeller_model, esc_model, battery_info, test_conducted_by, uploaded_by, tested_at, created_at FROM motor_test_runs'),
      pool.query('SELECT id, test_run_id, throttle, voltage, current, power, thrust_g, rpm, efficiency, temperature, extra_data, created_at FROM motor_test_data_points'),
    ]);

    console.log(`📡 Fetched Postgres records: ${cats.rows.length} categories, ${motors.rows.length} motors, ${specs.rows.length} custom specs, ${runs.rows.length} test runs, ${points.rows.length} test data points`);
    if (motors.rows.length > 0) {
      console.log('💡 Sample Postgres motor row columns:', Object.keys(motors.rows[0]));
      console.log('💡 Sample Postgres motor row content:', motors.rows[0]);
    }

    const safeVal = (v) => {
      if (v === undefined || v === null) return null;
      if (v instanceof Date) return v.toISOString();
      return v;
    };
    const safeNum = (v) => {
      if (v === null || v === undefined || v === '') return null;
      const n = Number(v);
      return isNaN(n) ? null : n;
    };

    // 2. Drop and recreate SQLite tables in a transaction
    sqliteDb.exec('BEGIN');

    try {
      // Recreate categories
      sqliteDb.exec('DROP TABLE IF EXISTS categories');
      sqliteDb.exec(`
        CREATE TABLE categories (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          description TEXT,
          created_at TEXT,
          updated_at TEXT
        )
      `);

      // Recreate motors
      sqliteDb.exec('DROP TABLE IF EXISTS motors');
      sqliteDb.exec(`
        CREATE TABLE motors (
          id TEXT PRIMARY KEY,
          category_id TEXT,
          motor_name TEXT NOT NULL,
          company TEXT NOT NULL,
          max_thrust TEXT NOT NULL,
          recommended_esc TEXT,
          recommended_propeller TEXT,
          link_motor TEXT,
          link_esc TEXT,
          link_propeller TEXT,
          custom_parameters TEXT,
          uploaded_by TEXT,
          created_at TEXT,
          updated_at TEXT
        )
      `);

      // Recreate custom_specs_schema
      sqliteDb.exec('DROP TABLE IF EXISTS custom_specs_schema');
      sqliteDb.exec(`
        CREATE TABLE custom_specs_schema (
          id TEXT PRIMARY KEY,
          field_key TEXT UNIQUE NOT NULL,
          field_name TEXT NOT NULL,
          field_type TEXT,
          field_unit TEXT,
          created_at TEXT
        )
      `);

      // Recreate motor_test_runs
      sqliteDb.exec('DROP TABLE IF EXISTS motor_test_runs');
      sqliteDb.exec(`
        CREATE TABLE motor_test_runs (
          id TEXT PRIMARY KEY,
          motor_id TEXT NOT NULL,
          propeller_model TEXT NOT NULL,
          esc_model TEXT,
          battery_info TEXT,
          test_conducted_by TEXT,
          uploaded_by TEXT,
          tested_at TEXT,
          created_at TEXT
        )
      `);

      // Recreate motor_test_data_points
      sqliteDb.exec('DROP TABLE IF EXISTS motor_test_data_points');
      sqliteDb.exec(`
        CREATE TABLE motor_test_data_points (
          id TEXT PRIMARY KEY,
          test_run_id TEXT NOT NULL,
          throttle REAL NOT NULL,
          voltage REAL,
          current REAL,
          power REAL,
          thrust_g REAL NOT NULL,
          rpm REAL,
          efficiency REAL,
          temperature REAL,
          extra_data TEXT,
          created_at TEXT
        )
      `);

      // Recreate audit_logs for guest operations
      sqliteDb.exec(`
        CREATE TABLE IF NOT EXISTS audit_logs (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          email TEXT,
          role TEXT,
          route TEXT,
          method TEXT,
          status INTEGER,
          ip_address TEXT,
          user_agent TEXT,
          risk_level TEXT,
          details TEXT,
          created_at TEXT DEFAULT CURRENT_TIMESTAMP
        )
      `);

      // 3. Prepare inserts
      const insertCat = sqliteDb.prepare(`
        INSERT INTO categories (id, name, description, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?)
      `);

      const insertMotor = sqliteDb.prepare(`
        INSERT INTO motors (id, category_id, motor_name, company, max_thrust, recommended_esc, recommended_propeller, link_motor, link_esc, link_propeller, custom_parameters, uploaded_by, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      const insertSpec = sqliteDb.prepare(`
        INSERT INTO custom_specs_schema (id, field_key, field_name, field_type, field_unit, created_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `);

      const insertRun = sqliteDb.prepare(`
        INSERT INTO motor_test_runs (id, motor_id, propeller_model, esc_model, battery_info, test_conducted_by, uploaded_by, tested_at, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      const insertPoint = sqliteDb.prepare(`
        INSERT INTO motor_test_data_points (id, test_run_id, throttle, voltage, current, power, thrust_g, rpm, efficiency, temperature, extra_data, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      // 4. Batch inserts
      for (const row of cats.rows) {
        try {
          insertCat.run(safeVal(row.id), safeVal(row.name), safeVal(row.description), safeVal(row.created_at), safeVal(row.updated_at));
        } catch (e) {
          console.error('[Sync Error] Failed inserting category row:', row);
          throw e;
        }
      }

      for (const row of motors.rows) {
        const customParams = typeof row.custom_parameters === 'object' ? JSON.stringify(row.custom_parameters) : row.custom_parameters;
        try {
          insertMotor.run(
            safeVal(row.id), safeVal(row.category_id), safeVal(row.motor_name), safeVal(row.company), safeVal(row.max_thrust),
            safeVal(row.recommended_esc), safeVal(row.recommended_propeller), safeVal(row.link_motor), safeVal(row.link_esc), safeVal(row.link_propeller),
            safeVal(customParams), safeVal(row.uploaded_by), safeVal(row.created_at), safeVal(row.updated_at)
          );
        } catch (e) {
          console.error('[Sync Error] Failed inserting motor row:', row);
          throw e;
        }
      }

      for (const row of specs.rows) {
        try {
          insertSpec.run(safeVal(row.id), safeVal(row.field_key), safeVal(row.field_name), safeVal(row.field_type), safeVal(row.field_unit), safeVal(row.created_at));
        } catch (e) {
          console.error('[Sync Error] Failed inserting spec schema row:', row);
          throw e;
        }
      }

      for (const row of runs.rows) {
        try {
          insertRun.run(safeVal(row.id), safeVal(row.motor_id), safeVal(row.propeller_model), safeVal(row.esc_model), safeVal(row.battery_info), safeVal(row.test_conducted_by), safeVal(row.uploaded_by), safeVal(row.tested_at), safeVal(row.created_at));
        } catch (e) {
          console.error('[Sync Error] Failed inserting test run row:', row);
          throw e;
        }
      }

      for (const row of points.rows) {
        const extraData = typeof row.extra_data === 'object' ? JSON.stringify(row.extra_data) : row.extra_data;
        try {
          insertPoint.run(
            safeVal(row.id), safeVal(row.test_run_id), safeNum(row.throttle), safeNum(row.voltage), safeNum(row.current),
            safeNum(row.power), safeNum(row.thrust_g), safeNum(row.rpm), safeNum(row.efficiency),
            safeNum(row.temperature), safeVal(extraData), safeVal(row.created_at)
          );
        } catch (e) {
          console.error('[Sync Error] Failed inserting data point row:', row);
          throw e;
        }
      }

      sqliteDb.exec('COMMIT');
      console.log('✅ SQLite database synchronized successfully');
    } catch (err) {
      sqliteDb.exec('ROLLBACK');
      throw err;
    }

  } catch (err) {
    console.error('❌ Error during SQLite synchronization:', err.message);
    throw err;
  }
}

module.exports = {
  syncPostgresToSqlite,
};
