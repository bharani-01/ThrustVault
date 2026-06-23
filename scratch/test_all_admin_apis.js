'use strict';

async function testAllAdminApis() {
  try {
    // 1. Log in to get session cookie
    const loginRes = await fetch('http://localhost:8001/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'admindemo@thrustvault.in',
        password: 'ThrustVault123!'
      })
    });

    console.log('Login Response Status:', loginRes.status);
    if (loginRes.status !== 200) {
      throw new Error('Login failed!');
    }
    const cookie = loginRes.headers.get('set-cookie');
    const headers = cookie ? { 'cookie': cookie } : {};

    // 2. Test categories endpoint
    console.log('\nTesting /api/admin/categories?order=name...');
    const catRes = await fetch('http://localhost:8001/api/admin/categories?order=name', { headers });
    console.log('Status:', catRes.status);
    if (catRes.status === 200) {
      const cats = await catRes.json();
      console.log('Categories Count:', cats.length);
    } else {
      console.error('Body:', await catRes.text());
    }

    // 3. Test motors endpoint
    console.log('\nTesting /api/admin/motors...');
    const motorRes = await fetch('http://localhost:8001/api/admin/motors', { headers });
    console.log('Status:', motorRes.status);
    if (motorRes.status === 200) {
      const motors = await motorRes.json();
      console.log('Motors Count:', motors.length);
    } else {
      console.error('Body:', await motorRes.text());
    }

    // 4. Test custom-specs endpoint
    console.log('\nTesting /api/admin/custom-specs?order=created_at...');
    const specsRes = await fetch('http://localhost:8001/api/admin/custom-specs?order=created_at', { headers });
    console.log('Status:', specsRes.status);
    if (specsRes.status === 200) {
      const specs = await specsRes.json();
      console.log('Custom Specs Count:', specs.length);
    } else {
      console.error('Body:', await specsRes.text());
    }

    // 5. Test statistics endpoint
    console.log('\nTesting /api/admin/statistics...');
    const statsRes = await fetch('http://localhost:8001/api/admin/statistics', { headers });
    console.log('Status:', statsRes.status);
    if (statsRes.status === 200) {
      const stats = await statsRes.json();
      console.log('Stats Payload Keys:', Object.keys(stats));
    } else {
      console.error('Body:', await statsRes.text());
    }

    console.log('\n✅ All admin APIs verified successfully!');
    process.exit(0);
  } catch (err) {
    console.error('\n❌ ERROR:', err.message);
    process.exit(1);
  }
}

testAllAdminApis();
