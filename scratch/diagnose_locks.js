'use strict';
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const pool = require('../src/config/db');

async function diagnose() {
  try {
    // All active queries holding locks on user_profiles
    const locks = await pool.query(`
      SELECT 
        pid,
        state,
        wait_event_type,
        wait_event,
        age(clock_timestamp(), query_start) as age,
        left(query, 120) as query_snippet
      FROM pg_stat_activity
      WHERE state IS NOT NULL
        AND pid != pg_backend_pid()
      ORDER BY query_start ASC
    `);
    console.log('All active backends:');
    console.table(locks.rows);

    // Specifically what is blocking
    const blocking = await pool.query(`
      SELECT
        blocked.pid AS blocked_pid,
        blocked.wait_event,
        blocked.state as blocked_state,
        left(blocked.query, 80) as blocked_query,
        blocker.pid AS blocker_pid,
        blocker.state as blocker_state,
        left(blocker.query, 80) as blocker_query
      FROM pg_stat_activity blocked
      JOIN pg_stat_activity blocker
        ON blocker.pid = ANY(pg_blocking_pids(blocked.pid))
      WHERE blocked.pid != pg_backend_pid()
    `);
    console.log('\nBlocking relationships:');
    console.table(blocking.rows);

    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}
diagnose();
