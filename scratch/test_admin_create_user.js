'use strict';

async function testCreateVaultUser() {
  console.log('🧪 Testing create_vault_user RPC via admin portal...');
  try {
    // 1. Log in
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
    const headers = {
      'Content-Type': 'application/json',
      ...(cookie ? { 'cookie': cookie } : {})
    };

    // 2. Call RPC to create user
    const testEmail = `admin_created_${Math.floor(Math.random() * 1000000)}@example.com`;
    console.log(`Creating user: ${testEmail}...`);
    
    const rpcRes = await fetch('http://localhost:8001/api/admin/rpc/create_vault_user', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        email_val: testEmail,
        password_val: 'SecretPass123!',
        role_val: 'user'
      })
    });

    console.log('RPC Response Status:', rpcRes.status);
    const body = await rpcRes.text();
    console.log('RPC Response Body:', body);

    if (rpcRes.status === 200) {
      console.log('✅ User successfully created in Postgres! ID:', body);
    } else {
      console.log('❌ Failed to create user');
    }

  } catch (err) {
    console.error('❌ Test failed:', err.message);
  }
}

testCreateVaultUser();
