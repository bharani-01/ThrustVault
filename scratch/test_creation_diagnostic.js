'use strict';
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const { CognitoIdentityProviderClient, AdminCreateUserCommand, AdminSetUserPasswordCommand, ListUsersCommand } = require('@aws-sdk/client-cognito-identity-provider');
const { fromIni } = require('@aws-sdk/credential-provider-ini');
const crypto = require('crypto');

async function test() {
  const USER_POOL_ID = process.env.COGNITO_USER_POOL_ID;
  const email_val = `test_diagnostic_${Math.floor(Math.random() * 1000000)}@example.com`;
  const password_val = 'SecretPass123!';
  
  let credentials;
  try {
    credentials = fromIni({ profile: 'ThrustVault' });
  } catch (e) {
    try {
      credentials = fromIni({ profile: 'Bharani-Claude-api' });
    } catch (e2) {}
  }

  const client = new CognitoIdentityProviderClient({
    region: process.env.COGNITO_REGION || 'eu-north-1',
    credentials
  });

  console.log('1. Attempting to create user with email:', email_val);
  const cogUsername = crypto.randomUUID();
  let dbUserId = null;
  let targetUsername = null;

  try {
    const createUserRes = await client.send(new AdminCreateUserCommand({
      UserPoolId: USER_POOL_ID,
      Username: cogUsername,
      UserAttributes: [
        { Name: 'email', Value: email_val },
        { Name: 'email_verified', Value: 'true' }
      ],
      MessageAction: 'SUPPRESS'
    }));
    const subAttr = createUserRes.User.Attributes.find(a => a.Name === 'sub');
    dbUserId = subAttr ? subAttr.Value : null;
    targetUsername = createUserRes.User.Username; // This is the Cognito Username (UUID)
    console.log('Created User Cognito Username:', targetUsername);
    console.log('Created User Cognito sub (for DB):', dbUserId);
  } catch (cognitoErr) {
    console.log('CreateUser caught error name:', cognitoErr.name, 'message:', cognitoErr.message);
    if (cognitoErr.name === 'UsernameExistsException' || cognitoErr.name === 'AliasExistsException' || cognitoErr.message.includes('exists')) {
      console.log('User exists exception matched. Listing users...');
      const listUsersRes = await client.send(new ListUsersCommand({
        UserPoolId: USER_POOL_ID,
        Filter: `email = "${email_val}"`
      }));
      if (listUsersRes.Users && listUsersRes.Users.length > 0) {
        targetUsername = listUsersRes.Users[0].Username;
        const subAttr = listUsersRes.Users[0].Attributes.find(a => a.Name === 'sub');
        dbUserId = subAttr ? subAttr.Value : null;
        console.log('Found existing user Username:', targetUsername);
        console.log('Found existing user sub (for DB):', dbUserId);
      } else {
        console.log('No user found matching email filter.');
      }
    } else {
      console.error('Unhandled creation error:', cognitoErr);
    }
  }

  if (targetUsername) {
    console.log('2. Setting user password for Username:', targetUsername);
    try {
      const setPassRes = await client.send(new AdminSetUserPasswordCommand({
        UserPoolId: USER_POOL_ID,
        Username: targetUsername, // Use targetUsername (which is the Cognito Username UUID)
        Password: password_val,
        Permanent: true
      }));
      console.log('✅ SetPassword response successful!');
    } catch (passErr) {
      console.error('❌ SetPassword error:', passErr.message);
    }
  }
}

test();
