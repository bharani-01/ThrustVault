'use strict';
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const pool = require('../src/config/db');

async function inspectEmail() {
  const targetEmail = 'bharani@nxtride.tech';
  console.log(`🔎 Inspecting database records for: ${targetEmail} (case-insensitive)...`);
  try {
    const authRes = await pool.query('SELECT id, email, created_at FROM auth.users WHERE LOWER(email) = LOWER($1)', [targetEmail]);
    console.log('auth.users records found:', authRes.rows.length);
    if (authRes.rows.length > 0) {
      console.log(authRes.rows);
    }

    const profileRes = await pool.query('SELECT id, email, role, created_at FROM public.user_profiles WHERE LOWER(email) = LOWER($1)', [targetEmail]);
    console.log('public.user_profiles records found:', profileRes.rows.length);
    if (profileRes.rows.length > 0) {
      console.log(profileRes.rows);
    }

    console.log('\nListing ALL emails in public.user_profiles:');
    const allProfiles = await pool.query('SELECT id, email, role FROM public.user_profiles');
    console.log(allProfiles.rows);

  } catch (err) {
    console.error('❌ Query failed:', err.message);
  } finally {
    await pool.end();
  }
}

inspectEmail();
