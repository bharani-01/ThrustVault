'use strict';

async function testLogin() {
  console.log('🧪 Attempting to sign in with the new Cognito user...');
  try {
    const res = await fetch('http://localhost:8000/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'admin_created_201169@example.com',
        password: 'SecretPass123!'
      })
    });

    console.log('Login Response Status:', res.status);
    const body = await res.json();
    console.log('Login Response Body:', body);

    if (res.status === 200 && body.email === 'admin_created_201169@example.com') {
      console.log('✅ Success! Login completed without any challenges or issues.');
    } else {
      console.error('❌ Failed! Login response was not successful.');
    }
  } catch (err) {
    console.error('❌ Login request failed:', err.message);
  }
}

testLogin();
