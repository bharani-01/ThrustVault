'use strict';
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const pool = require('../src/config/db');

async function test() {
  try {
    const res = await pool.query(`
      SELECT definition 
      FROM pg_views 
      WHERE schemaname = 'auth' AND viewname = 'users'
    `);
    if (res.rows.length > 0) {
      console.log('VIEW DEFINITION:', res.rows[0].definition);
    } else {
      console.log('NOT A VIEW');
    }
    process.exit(0);
  } catch (err) {
    console.error('ERROR:', err.message);
    process.exit(1);
  }
}
test();
