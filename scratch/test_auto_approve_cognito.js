'use strict';
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const pool = require('../src/config/db');
const { CognitoIdentityProviderClient, ListUsersCommand, AdminDeleteUserCommand } = require('@aws-sdk/client-cognito-identity-provider');
const { fromIni } = require('@aws-sdk/credential-provider-ini');

async function testAutoApprove() {
  console.log('🧪 Testing requestAccess with auto_approve = true...');
  const testEmail = `auto_approved_${Math.floor(Math.random() * 1000000)}@example.com`;
  
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
    // 1. Enable auto_approve in database system_settings
    console.log('Enabling auto_approve in public.system_settings...');
    await pool.query(`
      INSERT INTO public.system_settings (key, value) 
      VALUES ('auto_approve', 'true'::jsonb) 
      ON CONFLICT (key) DO UPDATE SET value = 'true'::jsonb
    `);

    // 2. Call the request-access API endpoint
    console.log('Sending request-access POST request...');
    const res = await fetch('http://localhost:8000/api/public/request-access', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fullName: 'Auto Provisioned Tester',
        email: testEmail,
        justification: 'Automated test for Cognito auto-provisioning.'
      })
    });

    console.log('API Response Status:', res.status);
    const body = await res.json();
    console.log('API Response Body:', body);

    if (res.status === 200 && body.auto_approved === true) {
      console.log('✅ Access request successfully auto-approved!');
    } else {
      console.error('❌ Failed! Request was not auto-approved.');
    }

    // 3. Verify Cognito has the user
    console.log('Verifying user in AWS Cognito...');
    const listRes = await cognitoClient.send(new ListUsersCommand({
      UserPoolId: process.env.COGNITO_USER_POOL_ID,
      Filter: `email = "${testEmail}"`
    }));

    if (listRes.Users && listRes.Users.length > 0) {
      const cogUser = listRes.Users[0];
      console.log('✅ User successfully created in AWS Cognito User Pool!');
      console.log('Cognito User:', {
        Username: cogUser.Username,
        Email: cogUser.Attributes.find(a => a.Name === 'email')?.Value,
        Status: cogUser.UserStatus
      });

      // Cleanup Cognito
      console.log('Cleaning up user from AWS Cognito User Pool...');
      await cognitoClient.send(new AdminDeleteUserCommand({
        UserPoolId: process.env.COGNITO_USER_POOL_ID,
        Username: cogUser.Username
      }));
      console.log('Cleaned up Cognito user successfully.');
    } else {
      console.error('❌ User NOT found in AWS Cognito User Pool!');
    }

    // 4. Verify DB has user profile
    console.log('Verifying user in database profiles...');
    const dbRes = await pool.query('SELECT * FROM public.user_profiles WHERE email = $1', [testEmail]);
    if (dbRes.rows.length > 0) {
      console.log('✅ User found in public.user_profiles:', dbRes.rows[0]);
      
      // Cleanup DB
      console.log('Cleaning up database records...');
      await pool.query('DELETE FROM public.user_profiles WHERE email = $1', [testEmail]);
      await pool.query('DELETE FROM auth.users WHERE email = $1', [testEmail]);
      await pool.query('DELETE FROM public.access_requests WHERE email = $1', [testEmail]);
      console.log('Cleaned up DB records successfully.');
    } else {
      console.error('❌ User NOT found in database!');
    }

  } catch (err) {
    console.error('❌ Test failed:', err.message);
  } finally {
    // Restore auto_approve to false
    console.log('Restoring auto_approve to false...');
    await pool.query(`
      INSERT INTO public.system_settings (key, value) 
      VALUES ('auto_approve', 'false'::jsonb) 
      ON CONFLICT (key) DO UPDATE SET value = 'false'::jsonb
    `);
    await pool.end();
  }
}

testAutoApprove();
