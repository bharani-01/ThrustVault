'use strict';
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const pool = require('../src/config/db');

async function updatePassword() {
  try {
    console.log('Updating password hash for admindemo@thrustvault.in...');
    await pool.query(`
      UPDATE auth.users 
      SET encrypted_password = crypt('ThrustVault123!', gen_salt('bf'))
      WHERE email = 'admindemo@thrustvault.in'
    `);
    console.log('✅ Password hash updated successfully!');
    process.exit(0);
  } catch (err) {
    console.error('ERROR:', err.message);
    process.exit(1);
  }
}
updatePassword();
