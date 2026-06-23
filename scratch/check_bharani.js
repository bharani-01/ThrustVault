'use strict';
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const pool = require('../src/config/db');

async function checkUser() {
  const email = 'bharani.cyber@gmail.com';
  try {
    const authRes = await pool.query('SELECT id, email, role FROM auth.users WHERE email = $1', [email]);
    console.log('auth.users:', authRes.rows);

    const profileRes = await pool.query('SELECT * FROM public.user_profiles WHERE email = $1', [email]);
    console.log('user_profiles:', profileRes.rows);

    const accessRes = await pool.query('SELECT * FROM public.access_requests WHERE email = $1', [email]);
    console.log('access_requests:', accessRes.rows);

  } catch (err) {
    console.error(err);
  } finally {
    await pool.end();
  }
}

checkUser();
