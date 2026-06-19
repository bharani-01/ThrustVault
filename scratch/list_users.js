'use strict';
require('dotenv').config();
const pool = require('../src/config/db');

async function main() {
  try {
    const res = await pool.query(`
      SELECT email, role, id
      FROM user_profiles
      ORDER BY email
    `);
    console.log('Users in database:', res.rows);
  } catch (err) {
    console.error('Error listing users:', err);
  } finally {
    await pool.end();
  }
}

main();
