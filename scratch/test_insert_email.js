'use strict';
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const pool = require('../src/config/db');

async function testInsert() {
  const email = 'bharani@nxtride.tech';
  console.log(`Trying to insert user into both tables with email: ${email}...`);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const newUid = '00000000-0000-0000-0000-000000000099';
    
    await client.query(`
      INSERT INTO auth.users (id, email)
      VALUES ($1, $2)
    `, [newUid, email]);
    
    await client.query(`
      INSERT INTO public.user_profiles (id, email, role)
      VALUES ($1, $2, 'user')
    `, [newUid, email]);
    
    console.log('✅ Successfully inserted user into both tables!');
    await client.query('ROLLBACK');
  } catch (err) {
    console.error('❌ Insert failed:', err.message);
  } finally {
    client.release();
    await pool.end();
  }
}

testInsert();
