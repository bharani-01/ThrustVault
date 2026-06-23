'use strict';
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const pool = require('../src/config/db');
const fs = require('fs');

async function checkActivity() {
  const logLines = [];
  const log = (...args) => {
    console.log(...args);
    logLines.push(args.map(a => typeof a === 'object' ? JSON.stringify(a, null, 2) : String(a)).join(' '));
  };

  log('Connecting to PostgreSQL...');
  try {
    const res1 = await pool.query('SELECT 1 as test');
    log('SELECT 1 successful:', res1.rows);

    const res2 = await pool.query(`
      SELECT pid, age(clock_timestamp(), query_start), usename, state, query 
      FROM pg_stat_activity 
      WHERE state != 'idle' AND query NOT LIKE '%pg_stat_activity%';
    `);
    log('Active queries:', res2.rows);

    const res3 = await pool.query(`
      SELECT
        coalesce(blockingl.relation::regclass::text,blockingl.locktype) as locked_item,
        blockeda.pid as blocked_pid,
        blockeda.query as blocked_query,
        blockedl.mode as blocked_mode,
        blockinga.pid as blocking_pid,
        blockinga.query as blocking_query,
        blockingl.mode as blocking_mode
      FROM pg_catalog.pg_locks blockedl
      JOIN pg_catalog.pg_stat_activity blockeda ON blockeda.pid = blockedl.pid
      JOIN pg_catalog.pg_locks blockingl
        ON blockingl.pid != blockedl.pid
        AND (
          (blockingl.locktype = 'relation' AND blockingl.relation = blockedl.relation)
          OR (blockingl.locktype = 'transactionid' AND blockingl.transactionid = blockedl.transactionid)
        )
      JOIN pg_catalog.pg_stat_activity blockinga ON blockinga.pid = blockingl.pid
      WHERE NOT blockedl.granted;
    `);
    log('Blocked/Blocking locks:', res3.rows);

    fs.writeFileSync('scratch/activity.txt', logLines.join('\n'), 'utf-8');
    process.exit(0);
  } catch (err) {
    log('Error running checkActivity:', err);
    fs.writeFileSync('scratch/activity.txt', logLines.join('\n'), 'utf-8');
    process.exit(1);
  }
}

checkActivity();
