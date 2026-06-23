'use strict';
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const pool = require('../src/config/db');

async function testSelfHealing() {
  console.log('🧪 Testing self-healing user creation logic...');
  try {
    const testEmail = `orphan_${Math.floor(Math.random() * 1000000)}@example.com`;
    const dummyUid = '00000000-0000-0000-0000-000000000099';

    // 1. Manually insert an orphaned profile (does not exist in auth.users)
    console.log(`Manually inserting orphaned user profile for: ${testEmail}...`);
    
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('INSERT INTO auth.users (id, email) VALUES ($1, $2)', [dummyUid, testEmail]);
      await client.query('INSERT INTO public.user_profiles (id, email, role) VALUES ($1, $2, \'user\')', [dummyUid, testEmail]);
      await client.query('DELETE FROM auth.users WHERE id = $1', [dummyUid]); // Leave profile orphaned!
      await client.query('COMMIT');
      console.log('Orphaned profile created.');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }

    // 2. Call the RPC API to create a new user with that same email
    console.log(`Calling create_vault_user RPC for email: ${testEmail} to see if it heals automatically...`);
    const loginRes = await fetch('http://localhost:8001/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'admindemo@thrustvault.in',
        password: 'ThrustVault123!'
      })
    });

    if (loginRes.status !== 200) {
      throw new Error('Login failed with status ' + loginRes.status);
    }
    const cookie = loginRes.headers.get('set-cookie');
    console.log('Cookie received:', cookie);
    
    const headers = {
      'Content-Type': 'application/json',
      ...(cookie ? { 'Cookie': cookie } : {})
    };

    const rpcRes = await fetch('http://localhost:8001/api/admin/rpc/create_vault_user', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        email_val: testEmail,
        password_val: 'SecretPass123!',
        role_val: 'user'
      })
    });

    console.log('RPC Status:', rpcRes.status);
    const body = await rpcRes.text();
    console.log('RPC Response Body:', body);

    if (rpcRes.status === 200) {
      console.log('✅ Success! Self-healing logic successfully cleared the duplicate email and created the user!');
    } else {
      console.log('❌ Failed to create user');
    }

  } catch (err) {
    console.error('❌ Test failed:', err.message);
  } finally {
    await pool.end();
  }
}

testSelfHealing();
