'use strict';
require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  host: process.env.DB_HOST,
  port: parseInt(process.env.DB_PORT || '5432'),
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  ssl: { rejectUnauthorized: false }
});

async function main() {
  try {
    const res = await pool.query('SELECT email, role FROM public.user_profiles');
    console.log('User roles in PostgreSQL:');
    res.rows.forEach(r => {
      console.log(`- Email: ${r.email}, Role: ${r.role}`);
    });
  } catch (err) {
    console.error('Error:', err);
  } finally {
    await pool.end();
  }
}

main();
