'use strict';
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const pool = require('../src/config/db');
const { requestAccess } = require('../src/controllers/dataController');

async function testRequestAccessDirectly() {
  console.log('🧪 Testing requestAccess controller directly...');
  try {
    const testEmail = `direct_test_${Math.floor(Math.random() * 1000000)}@example.com`;
    const req = {
      body: {
        fullName: 'Direct Test Requester',
        email: testEmail,
        justification: 'Testing the controller directly without HTTP server.'
      }
    };

    let responseStatus = null;
    let responseJson = null;
    const res = {
      status(s) {
        responseStatus = s;
        return this;
      },
      json(j) {
        responseJson = j;
        return this;
      }
    };

    await requestAccess(req, res);

    console.log('Response Status:', responseStatus || 200);
    console.log('Response JSON:', responseJson);

    // Verify in database
    console.log('Checking database table access_requests...');
    const dbRes = await pool.query('SELECT * FROM public.access_requests WHERE email = $1', [testEmail]);
    if (dbRes.rows.length > 0) {
      console.log('✅ Access request found in DB:', dbRes.rows[0]);
    } else {
      console.log('❌ Access request NOT found in DB');
    }

  } catch (err) {
    console.error('❌ Direct test failed:', err.message);
  } finally {
    await pool.end();
  }
}

testRequestAccessDirectly();
