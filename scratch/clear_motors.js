'use strict';
require('dotenv').config();
const pool = require('../src/config/db');
const { syncPostgresToSqlite } = require('../src/utils/sqliteSync');

async function clearMotors() {
  console.log('⏳ Connecting to PostgreSQL to delete all motor data...');
  try {
    const res = await pool.query('DELETE FROM public.motors');
    console.log(`✅ Deleted all records from public.motors database table. Row count affected: ${res.rowCount}`);

    console.log('⏳ Running SQLite sync to propagate deletions to local SQLite...');
    await syncPostgresToSqlite();
    console.log('✅ SQLite sync complete. All motor data removed successfully!');
    
    process.exit(0);
  } catch (err) {
    console.error('❌ Error clearing database:', err.message);
    process.exit(1);
  }
}

clearMotors();
