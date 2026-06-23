'use strict';

async function verifyCustomSpecs() {
  try {
    // 1. Log in to get session cookies
    const loginRes = await fetch('http://localhost:8001/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'admindemo@thrustvault.in',
        password: 'ThrustVault123!'
      })
    });

    console.log('Login response status:', loginRes.status);
    const cookie = loginRes.headers.get('set-cookie');
    console.log('Session Cookie received:', cookie ? 'Yes' : 'No');

    // 2. Fetch custom-specs using the session cookie
    const specsRes = await fetch('http://localhost:8001/api/admin/custom-specs?order=created_at', {
      headers: cookie ? { 'cookie': cookie } : {}
    });

    console.log('Custom specs response status:', specsRes.status);
    const body = await specsRes.json();
    console.log('Response body:', Array.isArray(body) ? `Array of ${body.length} items` : body);

    if (specsRes.status === 200) {
      console.log('✅ Custom Specs Query Verification Successful!');
      process.exit(0);
    } else {
      console.log('❌ Custom Specs Query Verification Failed!');
      process.exit(1);
    }
  } catch (err) {
    console.error('ERROR:', err.message);
    process.exit(1);
  }
}

verifyCustomSpecs();
