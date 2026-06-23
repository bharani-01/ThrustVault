'use strict';
async function testLogin() {
  try {
    const res = await fetch('http://localhost:8000/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'admindemo@thrustvault.in',
        password: 'ThrustVault123!'
      })
    });
    console.log('USER APP LOGIN STATUS:', res.status);
    const body = await res.json();
    console.log('USER APP LOGIN BODY:', body);
  } catch (err) {
    console.error('ERROR:', err.message);
  }
}
testLogin();
