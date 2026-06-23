'use strict';
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const pool = require('../src/config/db');

async function deleteUser() {
  const email = 'bharani.cyber@gmail.com';
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    console.log(`Searching for profiles with email ${email}...`);
    
    const profileRes = await client.query('SELECT id FROM public.user_profiles WHERE email = $1', [email]);
    if (profileRes.rows.length > 0) {
      const userId = profileRes.rows[0].id;
      console.log(`Found user_profile with ID ${userId}. Deleting associated onboarding data...`);
      await client.query('DELETE FROM public.user_onboarding WHERE user_id = $1', [userId]);
      
      console.log(`Deleting user_profile...`);
      await client.query('DELETE FROM public.user_profiles WHERE id = $1', [userId]);
      
      console.log(`Deleting auth.users record...`);
      await client.query('DELETE FROM auth.users WHERE id = $1', [userId]);
    } else {
      console.log(`No user_profile found for ${email}. Checking auth.users directly...`);
      const authRes = await client.query('SELECT id FROM auth.users WHERE email = $1', [email]);
      if (authRes.rows.length > 0) {
        const userId = authRes.rows[0].id;
        await client.query('DELETE FROM auth.users WHERE id = $1', [userId]);
      }
    }

    console.log(`Deleting any pending/approved access requests with this email...`);
    await client.query('DELETE FROM public.access_requests WHERE email = $1', [email]);

    await client.query('COMMIT');
    console.log(`Successfully cleaned up database records for ${email}.`);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Error during deletion:', err);
  } finally {
    client.release();
    await pool.end();
  }
}

deleteUser();
