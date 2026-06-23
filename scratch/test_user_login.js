'use strict';

async function testUserLogin() {
  console.log('🧪 Testing login for database-only user bharani.cyber@gmail.com...');
  try {
    const loginRes = await fetch('http://localhost:8000/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'bharani.cyber@gmail.com',
        password: '123456'
      })
    });

    console.log('Login Response Status:', loginRes.status);
    const body = await loginRes.json();
    console.log('Response Body:', body);

    if (loginRes.status === 200) {
      console.log('✅ Success! User successfully logged in!');
    } else {
      console.log('❌ Login failed');
    }
  } catch (err) {
    console.error('❌ Test failed:', err.message);
  }
}

testUserLogin();
