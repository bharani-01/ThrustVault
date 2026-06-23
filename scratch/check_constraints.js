'use strict';
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const pool = require('../src/config/db');

async function check() {
  try {
    const tableInfo = await pool.query(`
      SELECT column_name, data_type, character_maximum_length
      FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'access_requests'
    `);
    console.log('--- Columns of public.access_requests ---');
    console.table(tableInfo.rows);

    const constraints = await pool.query(`
      SELECT conname, pg_get_constraintdef(c.oid)
      FROM pg_constraint c
      JOIN pg_namespace n ON n.oid = c.connamespace
      WHERE n.nspname = 'public' AND c.conrelid = 'public.access_requests'::regclass
    `);
    console.log('\n--- Constraints of public.access_requests ---');
    console.table(constraints.rows);

    const constraints2 = await pool.query(`
      SELECT conname, pg_get_constraintdef(c.oid)
      FROM pg_constraint c
      JOIN pg_namespace n ON n.oid = c.connamespace
      WHERE n.nspname = 'public' AND c.conrelid = 'public.user_profiles'::regclass
    `);
    console.log('\n--- Constraints of public.user_profiles ---');
    console.table(constraints2.rows);

  } catch (err) {
    console.error(err);
  } finally {
    await pool.end();
  }
}

check();
