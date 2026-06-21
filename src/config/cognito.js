'use strict';
const crypto = require('crypto');
const {
  CognitoIdentityProviderClient,
  InitiateAuthCommand,
  GetUserCommand,
  ForgotPasswordCommand,
  ConfirmForgotPasswordCommand,
} = require('@aws-sdk/client-cognito-identity-provider');

let credentials;
if (process.env.NODE_ENV !== 'production' && !process.env.AWS_ACCESS_KEY_ID && !process.env.AWS_SECRET_ACCESS_KEY) {
  try {
    const { fromIni } = require('@aws-sdk/credential-provider-ini');
    credentials = fromIni({ profile: 'ThrustVault' });
  } catch (e) {
    try {
      const { fromIni } = require('@aws-sdk/credential-provider-ini');
      credentials = fromIni({ profile: 'Bharani-Claude-api' });
    } catch (e2) {
      // Fallback to default
    }
  }
}

const cognito = new CognitoIdentityProviderClient({
  region: process.env.COGNITO_REGION || process.env.AWS_REGION || 'eu-north-1',
  credentials,
});

function cognitoSecretHash(username) {
  const secret = process.env.COGNITO_CLIENT_SECRET;
  if (!secret) return null;
  return crypto.createHmac('sha256', secret)
    .update(username + process.env.COGNITO_CLIENT_ID)
    .digest('base64');
}

module.exports = {
  cognito,
  cognitoSecretHash,
  InitiateAuthCommand,
  GetUserCommand,
  ForgotPasswordCommand,
  ConfirmForgotPasswordCommand,
};
