'use strict';
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const pool = require('../src/config/db');

async function migrate() {
  try {
    console.log('Running DDL migrations on auth.users table...');
    await pool.query(`
      ALTER TABLE auth.users ADD COLUMN IF NOT EXISTS instance_id UUID;
      ALTER TABLE auth.users ADD COLUMN IF NOT EXISTS aud VARCHAR(255);
      ALTER TABLE auth.users ADD COLUMN IF NOT EXISTS role VARCHAR(255);
      ALTER TABLE auth.users ADD COLUMN IF NOT EXISTS encrypted_password VARCHAR(255);
      ALTER TABLE auth.users ADD COLUMN IF NOT EXISTS email_confirmed_at TIMESTAMP WITH TIME ZONE;
      ALTER TABLE auth.users ADD COLUMN IF NOT EXISTS recovery_sent_at TIMESTAMP WITH TIME ZONE;
      ALTER TABLE auth.users ADD COLUMN IF NOT EXISTS last_sign_in_at TIMESTAMP WITH TIME ZONE;
      ALTER TABLE auth.users ADD COLUMN IF NOT EXISTS raw_app_meta_data JSONB;
      ALTER TABLE auth.users ADD COLUMN IF NOT EXISTS raw_user_meta_data JSONB;
      ALTER TABLE auth.users ADD COLUMN IF NOT EXISTS created_at TIMESTAMP WITH TIME ZONE DEFAULT now();
      ALTER TABLE auth.users ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT now();
      ALTER TABLE auth.users ADD COLUMN IF NOT EXISTS confirmation_token VARCHAR(255);
      ALTER TABLE auth.users ADD COLUMN IF NOT EXISTS email_change VARCHAR(255);
      ALTER TABLE auth.users ADD COLUMN IF NOT EXISTS email_change_token_new VARCHAR(255);
      ALTER TABLE auth.users ADD COLUMN IF NOT EXISTS recovery_token VARCHAR(255);
    `);
    console.log('✅ Columns added successfully to auth.users!');
    process.exit(0);
  } catch (err) {
    console.error('MIGRATION ERROR:', err.message);
    process.exit(1);
  }
}
migrate();
