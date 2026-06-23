'use strict';
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const pool = require('../src/config/db');

async function dropConstraints() {
  console.log('Connecting to PostgreSQL to drop auth foreign key constraints...');
  try {
    await pool.query(`
      ALTER TABLE public.user_profiles DROP CONSTRAINT IF EXISTS user_profiles_id_fkey;
      ALTER TABLE public.user_onboarding DROP CONSTRAINT IF EXISTS user_onboarding_user_id_fkey;
    `);
    console.log('✅ Successfully dropped auth foreign key constraints!');
    process.exit(0);
  } catch (err) {
    console.error('Error dropping constraints:', err);
    process.exit(1);
  }
}

dropConstraints();
