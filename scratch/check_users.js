'use strict';
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const pool = require('../src/config/db');

async function check() {
  try {
    const res = await pool.query('SELECT * FROM auth.users LIMIT 1');
    console.log('USER ROW:', res.rows[0]);
    process.exit(0);
  } catch (err) {
    console.error('ERROR:', err.message);
    process.exit(1);
  }
}
check();
