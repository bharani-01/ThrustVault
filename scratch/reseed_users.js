'use strict';
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const pool = require('../src/config/db');
const crypto = require('crypto');

const DEMO_USERS = [
  { email: 'admindemo@thrustvault.in', role: 'admin', password: 'ThrustVault123!' },
  { email: 'userdemo@thrustvault.in', role: 'user', password: 'ThrustVault123!' },
  { email: 'guestdemo@thrustvault.in', role: 'guest', password: 'ThrustVault123!' }
];

async function reseed() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    
    console.log('🧹 Cleaning up all existing users from auth.users (cascades to profiles)...');
    await client.query('DELETE FROM auth.users');
    
    console.log('🌱 Seeding new clean credentials...');
    for (const u of DEMO_USERS) {
      const uid = crypto.randomUUID();
      
      // Insert into auth.users
      await client.query(`
        INSERT INTO auth.users (
          instance_id, id, aud, role, email, encrypted_password, 
          email_confirmed_at, recovery_sent_at, last_sign_in_at, 
          raw_app_meta_data, raw_user_meta_data, created_at, updated_at, 
          confirmation_token, email_change, email_change_token_new, recovery_token
        )
        VALUES (
          '00000000-0000-0000-0000-000000000000',
          $1, 'authenticated', 'authenticated', $2, crypt($3, gen_salt('bf')),
          now(), now(), now(),
          '{"provider":"email","providers":["email"]}'::jsonb,
          json_build_object('role', $4::text)::jsonb,
          now(), now(), '', '', '', ''
        )
      `, [uid, u.email, u.password, u.role]);

      // Insert into public.user_profiles
      await client.query(`
        INSERT INTO public.user_profiles (id, email, role)
        VALUES ($1, $2, $3)
      `, [uid, u.email, u.role]);
      
      console.log(`Created ${u.role}: ${u.email}`);
    }
    
    await client.query('COMMIT');
    console.log('✅ Reseeding completed successfully!');
    process.exit(0);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('RESEED ERROR:', err.message);
    process.exit(1);
  } finally {
    client.release();
  }
}
reseed();
