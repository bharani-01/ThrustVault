'use strict';

async function testApiMotors() {
  try {
    // 1. Log in to get session cookie
    console.log('Logging in...');
    const loginRes = await fetch('http://localhost:8000/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'userdemo@thrustvault.in',
        password: 'ThrustVault123!'
      })
    });

    if (!loginRes.ok) {
      throw new Error(`Login failed with status: ${loginRes.status}`);
    }

    const cookie = loginRes.headers.get('set-cookie');
    console.log('Login successful! Session Cookie obtained.');

    // 2. Fetch /api/init-data
    console.log('Fetching init-data...');
    const initRes = await fetch('http://localhost:8000/api/init-data', {
      headers: { 'cookie': cookie }
    });
    const initData = await initRes.json();
    console.log('First motors batch count:', initData.first_motors.length);
    console.log('Cached dashboard stats:', initData.dashboard_stats);

    // 3. Fetch remaining batches
    const BATCH_SIZE = 50;
    let offset = 15;
    let totalLoaded = initData.first_motors.length;

    while (true) {
      console.log(`Fetching batch at offset ${offset}...`);
      const res = await fetch(`http://localhost:8000/api/motors?limit=${BATCH_SIZE}&offset=${offset}&order=max_thrust.asc`, {
        headers: { 'cookie': cookie }
      });

      if (!res.ok) {
        console.error(`Fetch failed at offset ${offset} with status: ${res.status}`);
        const errText = await res.text();
        console.error('Response:', errText);
        break;
      }

      const batch = await res.json();
      console.log(`Fetched ${batch.length} motors`);
      if (batch.length === 0) break;

      totalLoaded += batch.length;
      offset += batch.length;
      if (batch.length < BATCH_SIZE) break;
    }

    console.log(`Total motors loaded from HTTP API: ${totalLoaded}`);
    process.exit(0);
  } catch (err) {
    console.error('Error during API test:', err);
    process.exit(1);
  }
}

testApiMotors();
