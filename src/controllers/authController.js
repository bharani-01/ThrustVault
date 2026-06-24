'use strict';
const crypto = require('crypto');
const https  = require('https');
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

    // Sync PostgreSQL user profile ID if needed (post-restore: auth.users may be missing this UID)
    if (profile.id !== uid) {
      (async () => {
        const client = await pool.connect();
        try {
          await client.query('BEGIN');
          // Ensure auth.users row exists for this Cognito UID before updating the FK
          await client.query(`
            INSERT INTO auth.users (id, email)
            VALUES ($1, $2)
            ON CONFLICT (id) DO NOTHING
          `, [uid, email]);
          await client.query('UPDATE user_profiles SET id = $1 WHERE email = $2', [uid, email]);
          await client.query('COMMIT');
          console.log(`[Auth Sync] Synced Cognito UID for ${email}`);
        } catch (syncErr) {
          await client.query('ROLLBACK');
          console.error('[Auth Sync] Failed to sync user ID:', syncErr.message);
        } finally {
          client.release();
        }
      })();
    }

    setSession(req, { email, role, uid, token: accessToken });
    return res.json({ email, role: clientRole(role), uid, timestamp: req.session.timestamp });

  } catch (err) {
    const msg = err.message || '';
    console.error('[Login Error]', msg);

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

// ── Google / Cognito Federation ───────────────────────────────────────────────

function googleOAuthRedirect(req, res) {
  const domain      = process.env.COGNITO_DOMAIN;
  const clientId    = process.env.COGNITO_CLIENT_ID;
  const baseUrl     = process.env.APP_BASE_URL || `http://localhost:${process.env.PORT || 8000}`;
  const redirectUri = encodeURIComponent(`${baseUrl}/api/auth/cognito/callback`);
  const scopes      = encodeURIComponent('email openid profile');

  const url = `${domain}/oauth2/authorize` +
    `?identity_provider=Google` +
    `&redirect_uri=${redirectUri}` +
    `&response_type=code` +
    `&client_id=${clientId}` +
    `&scope=${scopes}`;

  res.redirect(url);
}

async function cognitoCallback(req, res) {
  const { code, error } = req.query;

  if (error || !code) {
    console.error('[Cognito Callback] Error from Cognito:', error);
    return res.redirect('/login?error=google_cancelled');
  }

  try {
    const domain       = process.env.COGNITO_DOMAIN;
    const clientId     = process.env.COGNITO_CLIENT_ID;
    const clientSecret = process.env.COGNITO_CLIENT_SECRET;
    const baseUrl      = process.env.APP_BASE_URL || `http://localhost:${process.env.PORT || 8000}`;
    const redirectUri  = `${baseUrl}/api/auth/cognito/callback`;

    // Exchange authorization code for tokens
    const tokenData = await exchangeCodeForTokens({ domain, clientId, clientSecret, redirectUri, code });
    const { id_token } = tokenData;
    if (!id_token) throw new Error('No id_token returned from Cognito');

    // Decode JWT payload (base64url) — Cognito already validated via HTTPS
    const payloadB64 = id_token.split('.')[1];
    const payload    = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8'));

    const email = payload.email;
    const uid   = payload.sub;
    if (!email) throw new Error('No email in Cognito ID token');

    // Look up or auto-provision user in user_profiles with 'user' role
    let profile = await getProfileFromDB(email);
    if (!profile) {
      const username = email.split('@')[0] + '_' + uid.substring(0, 4);
      await pool.query(
        `INSERT INTO public.user_profiles (id, email, role, username, created_at)
         VALUES ($1, $2, 'user', $3, NOW())
         ON CONFLICT (email) DO NOTHING`,
        [uid, email, username]
      );
      profile = await getProfileFromDB(email);
    }

    if (!profile) throw new Error('Failed to resolve user profile');

    const role = normaliseRole(profile.role);
    setSession(req, { email, role, uid, token: id_token });

    console.log(`[Google SSO] Signed in: ${email} (${role})`);
    res.redirect('/dashboard');

  } catch (err) {
    console.error('[Cognito Callback] Error:', err.message);
    res.redirect('/login?error=google_failed');
  }
}

function exchangeCodeForTokens({ domain, clientId, clientSecret, redirectUri, code }) {
  return new Promise((resolve, reject) => {
    const body = new URLSearchParams({
      grant_type:   'authorization_code',
      client_id:    clientId,
      redirect_uri: redirectUri,
      code,
    }).toString();

    const auth    = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
    const url     = new URL(`${domain}/oauth2/token`);
    const options = {
      hostname: url.hostname,
      port: 443,
      path: url.pathname,
      method: 'POST',
      headers: {
        'Content-Type':   'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(body),
        'Authorization':  `Basic ${auth}`,
      },
    };

    const req = https.request(options, (resp) => {
      let data = '';
      resp.on('data', chunk => data += chunk);
      resp.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          if (parsed.error) reject(new Error(parsed.error_description || parsed.error));
          else resolve(parsed);
        } catch (e) { reject(e); }
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

module.exports = {
  login,
  logout,
  getSession,
  forgotPassword,
  verifyOtp,
  resetPassword,
  googleOAuthRedirect,
  cognitoCallback,
};
