'use strict';
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const pool = require('../src/config/db');

async function test() {
  try {
    const res = await pool.query("SELECT * FROM auth.users WHERE email = 'admindemo@thrustvault.in'");
    console.log('ADMIN USER ROW:', res.rows[0]);
    process.exit(0);
  } catch (err) {
    console.error('ERROR:', err.message);
    process.exit(1);
  }
}
test();
