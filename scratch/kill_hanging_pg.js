'use strict';
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const pool = require('../src/config/db');

async function killHanging() {
  console.log('Connecting to PostgreSQL to kill hanging migrations...');
  try {
    // Find pids that run the migration query and are active
    const res = await pool.query(`
      SELECT pid, age(clock_timestamp(), query_start), query 
      FROM pg_stat_activity 
      WHERE state = 'active' AND query LIKE '%Dynamic Migration%' AND pid != pg_backend_pid();
    `);
    
    console.log('Found hanging migration queries:', res.rows);

    for (const row of res.rows) {
      console.log(`Terminating backend process PID ${row.pid}...`);
      const killRes = await pool.query('SELECT pg_terminate_backend($1) as terminated', [row.pid]);
      console.log(`PID ${row.pid} termination result:`, killRes.rows[0].terminated);
    }

    process.exit(0);
  } catch (err) {
    console.error('Error terminating backends:', err);
    process.exit(1);
  }
}

killHanging();
