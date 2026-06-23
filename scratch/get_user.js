'use strict';
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const pool = require('../src/config/db');

async function getUsers() {
  try {
    const res = await pool.query('SELECT * FROM user_profiles');
    console.log('User profiles:', res.rows);
    process.exit(0);
  } catch (err) {
    console.error('Error fetching users:', err);
    process.exit(1);
  }
}
getUsers();
