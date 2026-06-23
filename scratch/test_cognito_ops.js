'use strict';
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const { CognitoIdentityProviderClient, ListUsersCommand } = require('@aws-sdk/client-cognito-identity-provider');
const { fromIni } = require('@aws-sdk/credential-provider-ini');

async function test() {
  const USER_POOL_ID = process.env.COGNITO_USER_POOL_ID;
  console.log('USER_POOL_ID:', USER_POOL_ID);
  
  // Try ThrustVault profile first, then Bharani-Claude-api, then default
  let credentials;
  try {
    credentials = fromIni({ profile: 'ThrustVault' });
    console.log('Using ThrustVault profile');
  } catch (e) {
    try {
      credentials = fromIni({ profile: 'Bharani-Claude-api' });
      console.log('Using Bharani-Claude-api profile');
    } catch (e2) {
      console.log('Using default credentials provider');
    }
  }

  const client = new CognitoIdentityProviderClient({
    region: process.env.COGNITO_REGION || 'eu-north-1',
    credentials
  });

  try {
    const res = await client.send(new ListUsersCommand({
      UserPoolId: USER_POOL_ID
    }));
    console.log('Success connecting to AWS Cognito User Pool!');
    console.log('Users in pool:', res.Users.map(u => ({
      Username: u.Username,
      Email: u.Attributes.find(a => a.Name === 'email')?.Value,
      Status: u.UserStatus,
      Enabled: u.Enabled
    })));
  } catch (err) {
    console.error('Failed to query Cognito:', err);
  }
}

test();
