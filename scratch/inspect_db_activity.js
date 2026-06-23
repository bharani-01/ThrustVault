'use strict';
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const pool = require('../src/config/db');

async function inspect() {
  try {
    const res = await pool.query(`
      SELECT pid, state, query, age(clock_timestamp(), query_start) as duration, wait_event_type, wait_event 
      FROM pg_stat_activity 
      WHERE state IS NOT NULL AND query NOT LIKE '%pg_stat_activity%'
      ORDER BY duration DESC
    `);
    console.log('ACTIVE QUERIES:');
    res.rows.forEach(row => {
      console.log(`- PID ${row.pid}: State=${row.state}, Duration=${row.duration}, Wait=${row.wait_event_type}:${row.wait_event}\n  Query: ${row.query.substring(0, 150)}`);
    });
    process.exit(0);
  } catch (err) {
    console.error('ERROR:', err);
    process.exit(1);
  }
}
inspect();
