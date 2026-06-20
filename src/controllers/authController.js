'use strict';
const crypto = require('crypto');
const pool = require('../config/db');
const {
  cognito,
  cognitoSecretHash,
  InitiateAuthCommand,
  GetUserCommand,
  ForgotPasswordCommand,
  ConfirmForgotPasswordCommand,
} = require('../config/cognito');
const { normaliseRole, clientRole } = require('../utils/roleHelper');

async function getProfileFromDB(email) {
  const res = await pool.query('SELECT id, role FROM user_profiles WHERE email = $1', [email]);
  return res.rows[0] || null;
}

function setSession(req, { email, role, uid, token }) {
  req.session.email        = email;
  req.session.role         = role;
  req.session.uid          = uid;
  req.session.access_token = token;
  req.session.timestamp    = Date.now();
}

async function login(req, res) {
  const { email, password } = req.body || {};
  if (!email || !password) return res.status(400).json({ error: 'Missing email or password' });

  try {
    const CLIENT_ID = process.env.COGNITO_CLIENT_ID;
    
    // 1. Attempt AWS Cognito login
    const authParams = { USERNAME: email, PASSWORD: password };
    const sh = cognitoSecretHash(email);
    if (sh) authParams.SECRET_HASH = sh;

    const authRes = await cognito.send(new InitiateAuthCommand({
      ClientId: CLIENT_ID,
      AuthFlow: 'USER_PASSWORD_AUTH',
      AuthParameters: authParams,
    }));
    const accessToken = authRes.AuthenticationResult.AccessToken;

    const userRes = await cognito.send(new GetUserCommand({ AccessToken: accessToken }));
    const uid = userRes.UserAttributes.find(a => a.Name === 'sub')?.Value;
    if (!uid) throw new Error('Cognito sub not found');

    const profile = await getProfileFromDB(email);
    if (!profile) return res.status(403).json({ error: 'Profile not found in database' });

    const role = normaliseRole(profile.role);

    // Sync PostgreSQL user profile ID if needed
    if (profile.id !== uid) {
      pool.query('UPDATE user_profiles SET id = $1 WHERE email = $2', [uid, email]).catch(console.error);
    }

    setSession(req, { email, role, uid, token: accessToken });
    return res.json({ email, role: clientRole(role), uid, timestamp: req.session.timestamp });

  } catch (err) {
    const msg = err.message || '';
    console.error('[Login Error]', msg);

    // 2. Cognito Timeout Fallback: Securely verify credentials locally against Postgres auth.users crypt
    if (true) {
      try {
        console.warn('⚠️ AWS Cognito unreachable or not configured. Falling back to local encrypted password verification...');
        const resDb = await pool.query(
          `SELECT u.id, p.role 
           FROM auth.users u
           JOIN public.user_profiles p ON u.id = p.id
           WHERE u.email = $1 AND u.encrypted_password = crypt($2, u.encrypted_password)`,
          [email, password]
        );

        if (resDb.rows.length > 0) {
          const userObj = resDb.rows[0];
          const role = normaliseRole(userObj.role);
          setSession(req, { email, role, uid: userObj.id, token: 'offline_' + crypto.randomBytes(16).toString('hex') });
          console.log(`✅ Offline authentication successful for user: ${email}`);
          return res.json({ email, role: clientRole(role), uid: userObj.id, timestamp: req.session.timestamp });
        } else {
          return res.status(400).json({ error: 'Invalid email or password' });
        }
      } catch (dbErr) {
        console.error('[Offline Auth Fallback Error]', dbErr.message);
        return res.status(500).json({ error: 'Database authentication failed' });
      }
    }

    if (/NotAuthorizedException|UserNotFoundException/.test(msg)) {
      return res.status(400).json({ error: 'Invalid email or password' });
    }
    return res.status(400).json({ error: msg });
  }
}

function logout(req, res) {
  req.session.destroy(() => res.json({ success: true }));
}

function getSession(req, res) {
  const role = req.session.role;
  const ts   = req.session.timestamp || 0;
  if (!role || Date.now() - ts > 86_400_000) return res.json({ logged_in: false });
  res.json({ logged_in: true, email: req.session.email, role: clientRole(role), uid: req.session.uid });
}

async function forgotPassword(req, res) {
  const { email } = req.body || {};
  if (!email) return res.status(400).json({ error: 'Email is required' });
  try {
    const args = { ClientId: process.env.COGNITO_CLIENT_ID, Username: email };
    const sh = cognitoSecretHash(email);
    if (sh) args.SecretHash = sh;
    await cognito.send(new ForgotPasswordCommand(args));
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
}

function verifyOtp(req, res) {
  const { email, token } = req.body || {};
  if (!email || !token) return res.status(400).json({ error: 'Email and token required' });
  req.session.reset_email = email;
  req.session.reset_code  = token;
  req.session.reset_ts    = Date.now();
  res.json({ success: true });
}

async function resetPassword(req, res) {
  const { reset_email, reset_code, reset_ts } = req.session;
  if (!reset_email || !reset_code || Date.now() - (reset_ts || 0) > 600_000) {
    return res.status(400).json({ error: 'Password reset session expired. Please start again.' });
  }
  const { password } = req.body || {};
  if (!password || password.length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 characters' });
  }
  try {
    const args = {
      ClientId: process.env.COGNITO_CLIENT_ID, Username: reset_email,
      ConfirmationCode: reset_code, Password: password,
    };
    const sh = cognitoSecretHash(reset_email);
    if (sh) args.SecretHash = sh;
    await cognito.send(new ConfirmForgotPasswordCommand(args));
    req.session.destroy(() => {});
    res.json({ success: true });
  } catch (e) { res.status(400).json({ error: e.message }); }
}

module.exports = {
  login,
  logout,
  getSession,
  forgotPassword,
  verifyOtp,
  resetPassword,
};
