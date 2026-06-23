'use strict';
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const pool = require('../src/config/db');

async function killZombies() {
  try {
    // Kill any backend that has been idle or stuck in ClientWrite for > 2 minutes
    // These are orphaned connections from crashed server instances
    const res = await pool.query(`
      SELECT pid, state, wait_event_type, wait_event,
             age(clock_timestamp(), query_start) as age,
             left(query, 100) as query_snippet
      FROM pg_stat_activity
      WHERE pid != pg_backend_pid()
        AND (
          -- Stuck sending results to a dead client
          (state = 'active' AND wait_event = 'ClientWrite' AND query_start < now() - interval '2 minutes')
          OR
          -- Idle connections from old server instances (> 5 minutes old)
          (state = 'idle' AND state_change < now() - interval '5 minutes'
           AND query NOT LIKE '%aurora%' AND query NOT LIKE '%rds_%' AND query NOT LIKE '%heartbeat%')
        )
    `);

    console.log('Zombie/stuck backends to kill:', res.rows.length);
    console.table(res.rows);

    for (const row of res.rows) {
      console.log(`Terminating PID ${row.pid} (${row.state}, ${row.wait_event})...`);
      const killRes = await pool.query('SELECT pg_terminate_backend($1) AS terminated', [row.pid]);
      console.log(`  → terminated: ${killRes.rows[0].terminated}`);
    }

    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}
killZombies();
