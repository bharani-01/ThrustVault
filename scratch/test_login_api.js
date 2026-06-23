'use strict';
async function testLogin() {
  try {
    const res = await fetch('http://localhost:8001/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'admindemo@thrustvault.in',
        password: 'ThrustVault123!'
      })
    });
    console.log('LOGIN STATUS:', res.status);
    const body = await res.json();
    console.log('LOGIN BODY:', body);
    process.exit(res.status === 200 ? 0 : 1);
  } catch (err) {
    console.error('ERROR:', err.message);
    process.exit(1);
  }
}
testLogin();
