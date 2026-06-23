'use strict';

async function testPatchUser() {
  console.log('🧪 Testing admin patch user role API...');
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
    console.log('Cookie received:', cookie);
    
    const headers = {
      'Content-Type': 'application/json',
      ...(cookie ? { 'cookie': cookie } : {})
    };

    // 2. We use the UUID from the previously created user
    const userId = 'f4f52029-4f2f-4f8e-a9db-fae8e5fc7e0c';
    console.log(`Patching role of user ID: ${userId} to admin...`);
    
    const patchRes = await fetch(`http://localhost:8001/api/admin/users/${userId}`, {
      method: 'PATCH',
      headers,
      body: JSON.stringify({
        role: 'admin'
      })
    });

    console.log('PATCH Response Status:', patchRes.status);
    const body = await patchRes.text();
    console.log('PATCH Response Body:', body);

    if (patchRes.status === 200) {
      console.log('✅ User role successfully patched in Postgres!');
    } else {
      console.log('❌ Failed to patch user role');
    }

  } catch (err) {
    console.error('❌ Test failed:', err.message);
  }
}

testPatchUser();
