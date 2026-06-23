'use strict';
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const pool = require('../src/config/db');
const os = require('os');

async function testStats() {
  try {
    const [motorsCount, categoriesCount, requestsCount, usersCount] = await Promise.all([
      pool.query('SELECT COUNT(*)::int AS count FROM public.motors'),
      pool.query('SELECT COUNT(*)::int AS count FROM public.categories'),
      pool.query("SELECT COUNT(*)::int AS count FROM public.access_requests WHERE status = 'pending'"),
      pool.query('SELECT COUNT(*)::int AS count FROM public.user_profiles')
    ]);

    const cpuLoad = os.loadavg();
    const cpuCores = os.cpus().length;
    const cpuPercent = Math.min(100, (cpuLoad[0] / cpuCores) * 100);

    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    const usedMem = totalMem - freeMem;
    const ramPercent = (usedMem / totalMem) * 100;

    console.log('STATS PAYLOAD:', {
      cpu_load: cpuLoad,
      cpu_load_percent: cpuPercent,
      ram_total_gb: totalMem / (1024 * 1024 * 1024),
      ram_used_gb: usedMem / (1024 * 1024 * 1024),
      ram_free_gb: freeMem / (1024 * 1024 * 1024),
      ram_percent: ramPercent,
      total_motors: motorsCount.rows[0].count,
      total_categories: categoriesCount.rows[0].count,
      pending_requests: requestsCount.rows[0].count,
      total_users: usersCount.rows[0].count
    });
    process.exit(0);
  } catch (err) {
    console.error('STATS RUNNER ERROR:', err.message);
    process.exit(1);
  }
}
testStats();
