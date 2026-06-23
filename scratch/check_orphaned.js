'use strict';
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const pool = require('../src/config/db');

async function check() {
  try {
    const res1 = await pool.query('SELECT COUNT(*)::int as count FROM public.user_profiles');
    console.log('Total user profiles:', res1.rows[0].count);

    const res2 = await pool.query('SELECT COUNT(*)::int as count FROM auth.users');
    console.log('Total auth users:', res2.rows[0].count);

    const res3 = await pool.query(`
      SELECT id, email, role FROM public.user_profiles 
      WHERE id NOT IN (SELECT id FROM auth.users)
    `);
    console.log('Orphaned user profiles (no matching auth user):', res3.rows);

    process.exit(0);
  } catch (err) {
    console.error('Error:', err);
    process.exit(1);
  }
}

check();
