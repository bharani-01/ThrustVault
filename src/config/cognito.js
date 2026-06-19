'use strict';
const crypto = require('crypto');
const {
  CognitoIdentityProviderClient,
  InitiateAuthCommand,
  GetUserCommand,
  ForgotPasswordCommand,
  ConfirmForgotPasswordCommand,
} = require('@aws-sdk/client-cognito-identity-provider');

const cognito = new CognitoIdentityProviderClient({
  region: process.env.COGNITO_REGION || process.env.AWS_REGION || 'eu-north-1',
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
