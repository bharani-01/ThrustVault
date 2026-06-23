'use strict';
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const pool = require('../src/config/db');
const { CognitoIdentityProviderClient, ListUsersCommand } = require('@aws-sdk/client-cognito-identity-provider');
const { fromIni } = require('@aws-sdk/credential-provider-ini');

async function testDelete() {
  const testEmail = 'admin_created_949373@example.com';
  console.log(`🧪 Testing deletion of user: ${testEmail}...`);

  let credentials;
  try {
    credentials = fromIni({ profile: 'ThrustVault' });
  } catch (e) {
    try {
      credentials = fromIni({ profile: 'Bharani-Claude-api' });
    } catch (e2) {}
  }

  const cognitoClient = new CognitoIdentityProviderClient({
    region: process.env.COGNITO_REGION || 'eu-north-1',
    credentials
  });

  try {
    // 1. Get the user_id (sub) from database or Cognito
    const dbRes = await pool.query('SELECT id FROM public.user_profiles WHERE email = $1', [testEmail]);
    if (dbRes.rows.length === 0) {
      throw new Error(`User ${testEmail} not found in database user_profiles. Please run test_admin_create_user.js first.`);
    }
    const userId = dbRes.rows[0].id;
    console.log(`Found database user ID (sub): ${userId}`);

    // 2. Log in as admin to get session cookie
    const loginRes = await fetch('http://localhost:8001/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'admindemo@thrustvault.in',
        password: 'ThrustVault123!'
      })
    });

    if (loginRes.status !== 200) {
      throw new Error('Admin login failed with status ' + loginRes.status);
    }
    const cookie = loginRes.headers.get('set-cookie');
    const headers = {
      'Content-Type': 'application/json',
      ...(cookie ? { 'cookie': cookie } : {})
    };

    // 3. Call the delete RPC endpoint
    console.log('Sending delete_vault_user RPC request...');
    const deleteRes = await fetch('http://localhost:8001/api/admin/rpc/delete_vault_user', {
      method: 'POST',
      headers,
      body: JSON.stringify({ user_id: userId })
    });

    console.log('Delete Response Status:', deleteRes.status);
    const body = await deleteRes.json();
    console.log('Delete Response Body:', body);

    if (deleteRes.status === 200 && body.success === true) {
      console.log('✅ Delete RPC endpoint returned success status.');
    } else {
      console.error('❌ Failed: Delete RPC endpoint failed.');
    }

    // 4. Verify user is removed from database
    console.log('Verifying user removal in database...');
    const dbVerify = await pool.query('SELECT * FROM public.user_profiles WHERE id = $1', [userId]);
    if (dbVerify.rows.length === 0) {
      console.log('✅ Success: User successfully deleted from database public.user_profiles.');
    } else {
      console.error('❌ Error: User still exists in database public.user_profiles!');
    }

    // 5. Verify user is removed from Cognito
    console.log('Verifying user removal in AWS Cognito User Pool...');
    const listRes = await cognitoClient.send(new ListUsersCommand({
      UserPoolId: process.env.COGNITO_USER_POOL_ID,
      Filter: `email = "${testEmail}"`
    }));

    if (!listRes.Users || listRes.Users.length === 0) {
      console.log('✅ Success: User successfully deleted from AWS Cognito User Pool.');
    } else {
      console.error('❌ Error: User still exists in AWS Cognito User Pool!');
    }

  } catch (err) {
    console.error('❌ Deletion test failed:', err.message);
  } finally {
    await pool.end();
  }
}

testDelete();
