'use strict';
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const pool = require('../src/config/db');

async function inspect() {
  try {
    const res = await pool.query(`
      SELECT c.id, c.name, COUNT(m.id) as motor_count 
      FROM categories c 
      LEFT JOIN motors m ON c.id = m.category_id 
      GROUP BY c.id, c.name 
      ORDER BY motor_count DESC, c.name ASC
    `);
    console.log('CATEGORIES IN DB:');
    res.rows.forEach(row => {
      console.log(`- ${row.name}: id=${row.id}, motors=${row.motor_count}`);
    });
    process.exit(0);
  } catch (err) {
    console.error('ERROR:', err);
    process.exit(1);
  }
}
inspect();
