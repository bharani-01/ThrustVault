'use strict';

async function verifyCss() {
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

    // 2. Fetch admin style.css using the session cookie
    const cssRes = await fetch('http://localhost:8001/admin/style.css', {
      headers: cookie ? { 'cookie': cookie } : {}
    });

    console.log('CSS resource response status:', cssRes.status);
    console.log('Content-Type header:', cssRes.headers.get('content-type'));
    
    if (cssRes.status === 200 && cssRes.headers.get('content-type')?.includes('css')) {
      console.log('✅ CSS Verification Successful!');
      process.exit(0);
    } else {
      console.log('❌ CSS Verification Failed!');
      process.exit(1);
    }
  } catch (err) {
    console.error('ERROR:', err.message);
    process.exit(1);
  }
}

verifyCss();
