'use strict';
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const pool = require('../src/config/db');

async function inspect() {
  try {
    const res = await pool.query(`
      SELECT a.attname, format_type(a.atttypid, a.atttypmod) AS data_type
      FROM pg_attribute a
      JOIN pg_class c ON a.attrelid = c.oid
      JOIN pg_namespace n ON c.relnamespace = n.oid
      WHERE n.nspname = 'auth' AND c.relname = 'users' AND a.attnum > 0 AND NOT a.attisdropped
    `);
    console.log('REAL COLUMNS:', res.rows);
    process.exit(0);
  } catch (err) {
    console.error('ERROR:', err.message);
    process.exit(1);
  }
}
inspect();
