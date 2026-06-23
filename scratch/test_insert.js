'use strict';
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const pool = require('../src/config/db');

async function testInsert() {
  try {
    const res = await pool.query(`
      INSERT INTO auth.users (
        instance_id, id, aud, role, email, encrypted_password, 
        email_confirmed_at, recovery_sent_at, last_sign_in_at, 
        raw_app_meta_data, raw_user_meta_data, created_at, updated_at, 
        confirmation_token, email_change, email_change_token_new, recovery_token
      )
      VALUES (
        '00000000-0000-0000-0000-000000000000',
        '001cb9ec-d051-7013-f115-6662d3f166c8', 'authenticated', 'authenticated', 'test_insert@thrustvault.in', 'password_hash',
        now(), now(), now(),
        '{"provider":"email","providers":["email"]}'::jsonb,
        '{"role":"user"}'::jsonb,
        now(), now(), '', '', '', ''
      )
      RETURNING *
    `);
    console.log('INSERT SUCCESS:', res.rows[0]);
    process.exit(0);
  } catch (err) {
    console.error('INSERT ERROR:', err.message);
    process.exit(1);
  }
}
testInsert();
