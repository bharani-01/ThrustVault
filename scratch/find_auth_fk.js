'use strict';
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const pool = require('../src/config/db');

async function findFKs() {
  try {
    const res = await pool.query(`
      SELECT
        tc.table_schema, 
        tc.table_name, 
        tc.constraint_name,
        kcu.column_name, 
        ccu.table_schema AS foreign_table_schema,
        ccu.table_name AS foreign_table_name,
        ccu.column_name AS foreign_column_name 
      FROM 
        information_schema.table_constraints AS tc 
        JOIN information_schema.key_column_usage AS kcu
          ON tc.constraint_name = kcu.constraint_name
          AND tc.table_schema = kcu.table_schema
        JOIN pg_constraint c ON tc.constraint_name = c.conname
        JOIN pg_namespace n ON n.oid = c.connamespace
        JOIN pg_class cl ON cl.oid = c.confrelid
        JOIN pg_namespace n_conf ON n_conf.oid = cl.relnamespace
        JOIN information_schema.constraint_column_usage AS ccu
          ON ccu.constraint_name = tc.constraint_name
      WHERE tc.constraint_type = 'FOREIGN KEY' 
        AND n_conf.nspname = 'auth' AND cl.relname = 'users';
    `);
    console.log('Foreign key constraints referencing auth.users:');
    console.table(res.rows);
    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}

findFKs();
