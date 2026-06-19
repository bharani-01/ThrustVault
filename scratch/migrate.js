'use strict';
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const pool = require('../src/config/db');

async function main() {
  const sqlPath = path.join(__dirname, '../database/migration_drafts_table.sql');
  const sql = fs.readFileSync(sqlPath, 'utf8');
  console.log('Executing migration on host:', process.env.DB_HOST);
  try {
    await pool.query(sql);
    console.log('✅ Migration succeeded: draft_test_runs table created successfully!');
  } catch (err) {
    console.error('❌ Migration failed:', err);
  } finally {
    await pool.end();
  }
}

main();
