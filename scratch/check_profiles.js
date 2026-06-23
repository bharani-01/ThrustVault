'use strict';
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const pool = require('../src/config/db');

async function test() {
  try {
    const res = await pool.query('SELECT * FROM public.user_profiles ORDER BY email');
    console.log('PROFILES:', res.rows);
    process.exit(0);
  } catch (err) {
    console.error('ERROR:', err.message);
    process.exit(1);
  }
}
test();
