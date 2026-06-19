'use strict';

async function runTests() {
  console.log('🧪 Starting endpoint verification tests...');

  try {
    // 1. Check init-data endpoint (which is protected - should return 401 Unauthorized)
    console.log('\nChecking protection on /api/init-data...');
    const initRes = await fetch('http://localhost:8000/api/init-data');
    console.log(`Status: ${initRes.status} (Expected: 401)`);
    const initJson = await initRes.json();
    console.log('Body:', initJson);

    if (initRes.status !== 401) {
      throw new Error('/api/init-data did not block unauthorized request');
    }

    // 2. Check session endpoint (should return logged_in: false)
    console.log('\nChecking /api/auth/session...');
    const sessionRes = await fetch('http://localhost:8000/api/auth/session');
    console.log(`Status: ${sessionRes.status} (Expected: 200)`);
    const sessionJson = await sessionRes.json();
    console.log('Body:', sessionJson);

    if (sessionJson.logged_in !== false) {
      throw new Error('/api/auth/session did not return logged_in: false');
    }

    // 3. Attempt Demo Bypass Login
    console.log('\nAttempting Demo Bypass Login as user...');
    const loginRes = await fetch('http://localhost:8000/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'interndemo@thrustvault.in',
        password: 'ThrustVault123!'
      })
    });
    console.log(`Status: ${loginRes.status} (Expected: 200)`);
    const loginJson = await loginRes.json();
    console.log('Body:', loginJson);

    if (loginRes.status !== 200 || !loginJson.email) {
      throw new Error('Demo bypass login failed');
    }

    // Extract cookie from headers
    const rawCookie = loginRes.headers.get('set-cookie');
    console.log(`Received Cookie: ${rawCookie ? rawCookie.split(';')[0] : 'None'}`);

    if (!rawCookie) {
      throw new Error('No session cookie returned');
    }

    const cookie = rawCookie.split(';')[0];

    // 4. Request init-data with Cookie
    console.log('\nRequesting /api/init-data with valid session cookie...');
    const authInitRes = await fetch('http://localhost:8000/api/init-data', {
      headers: { 'Cookie': cookie }
    });
    console.log(`Status: ${authInitRes.status} (Expected: 200)`);
    const authInitJson = await authInitRes.json();
    console.log('Categories Count:', authInitJson.categories?.length);
    console.log('Custom Schema Count:', authInitJson.custom_schema?.length);
    console.log('First Motors Count:', authInitJson.first_motors?.length);

    if (authInitRes.status !== 200 || !authInitJson.categories) {
      throw new Error('Failed to fetch init-data even with session cookie');
    }

    // 5. Check Multi-Column Sorting
    console.log('\nRequesting /api/motors?order=company,motor_name with valid session cookie...');
    const sortRes = await fetch('http://localhost:8000/api/motors?order=company,motor_name', {
      headers: { 'Cookie': cookie }
    });
    console.log(`Status: ${sortRes.status} (Expected: 200)`);
    const sortJson = await sortRes.json();
    console.log('Motors Count:', sortJson.length);
    if (sortRes.status !== 200 || !Array.isArray(sortJson)) {
      throw new Error('Multi-column sorting failed');
    }

    // 6. Check Telemetry runs route
    console.log('\nRequesting /api/motor-test-runs?motor_id=eq.faf4a0cd-1203-4953-a4a7-92d8fe1ef996&order=tested_at.desc with valid session cookie...');
    const runsRes = await fetch('http://localhost:8000/api/motor-test-runs?motor_id=eq.faf4a0cd-1203-4953-a4a7-92d8fe1ef996&order=tested_at.desc', {
      headers: { 'Cookie': cookie }
    });
    console.log(`Status: ${runsRes.status} (Expected: 200)`);
    const runsJson = await runsRes.json();
    console.log('Runs Count:', runsJson.length);
    if (runsRes.status !== 200 || !Array.isArray(runsJson)) {
      throw new Error('Telemetry runs route failed');
    }

    // 7. Check Drafts route (POST, GET, DELETE)
    console.log('\nTesting draft-test-runs operations...');
    const testDraftPayload = {
      motor_model: 'MN3110 KV470 Test',
      propeller_model: 'T-MOTO 13*4.4CF Test',
      esc_model: 'Test ESC',
      battery_info: '4S 5000mAh',
      test_conducted_by: 'Auditor Bot',
      data_points: [
        { throttle: 50, voltage: 14.8, current: 10.5, power: 155.4, thrust_g: 500, rpm: 4500, efficiency: 3.2, temperature: 35.5, extra_data: {} },
        { throttle: 75, voltage: 14.7, current: 18.2, power: 267.54, thrust_g: 850, rpm: 5600, efficiency: 3.18, temperature: 42.1, extra_data: {} }
      ]
    };

    console.log('POSTing new draft run to /api/draft-test-runs...');
    const postDraftRes = await fetch('http://localhost:8000/api/draft-test-runs', {
      method: 'POST',
      headers: { 
        'Cookie': cookie,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(testDraftPayload)
    });
    console.log(`POST Status: ${postDraftRes.status} (Expected: 200)`);
    const postDraftJson = await postDraftRes.json();
    console.log('POST Response:', JSON.stringify(postDraftJson, null, 2));

    if (postDraftRes.status !== 200 || !Array.isArray(postDraftJson) || postDraftJson.length === 0) {
      throw new Error('Draft POST failed: ' + JSON.stringify(postDraftJson));
    }

    const draftId = postDraftJson[0].id;
    if (!draftId) {
      throw new Error('Draft POST did not return an id');
    }

    console.log(`\nGETing created draft: /api/draft-test-runs?id=eq.${draftId}...`);
    const getDraftRes = await fetch(`http://localhost:8000/api/draft-test-runs?id=eq.${draftId}`, {
      headers: { 'Cookie': cookie }
    });
    console.log(`GET Status: ${getDraftRes.status} (Expected: 200)`);
    const getDraftJson = await getDraftRes.json();
    console.log('GET Response:', JSON.stringify(getDraftJson, null, 2));

    if (getDraftRes.status !== 200 || !Array.isArray(getDraftJson) || getDraftJson.length === 0) {
      throw new Error('Draft GET failed');
    }

    if (getDraftJson[0].data_points.length !== 2) {
      throw new Error('Draft data_points length mismatch: expected 2, got ' + getDraftJson[0].data_points.length);
    }

    console.log(`\nDELETing created draft: /api/draft-test-runs/${draftId}...`);
    const delDraftRes = await fetch(`http://localhost:8000/api/draft-test-runs/${draftId}`, {
      method: 'DELETE',
      headers: { 'Cookie': cookie }
    });
    console.log(`DELETE Status: ${delDraftRes.status} (Expected: 200)`);
    const delDraftJson = await delDraftRes.json();
    console.log('DELETE Response:', delDraftJson);

    if (delDraftRes.status !== 200) {
      throw new Error('Draft DELETE failed');
    }

    console.log('\n✅ All API routes (including draft POST/GET/DELETE) successfully verified and functional!');
  } catch (e) {
    console.error('\n❌ Verification failed:', e.message);
    process.exit(1);
  }
}

runTests();
