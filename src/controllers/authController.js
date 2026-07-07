'use strict';
const crypto  = require('crypto');
const https   = require('https');
const bcrypt  = require('bcryptjs');
const pool    = require('../config/db');
const { normaliseRole, clientRole } = require('../utils/roleHelper');

// ── Helpers ───────────────────────────────────────────────────────────────────

async function getProfileFromDB(email) {
  const res = await pool.query(
    'SELECT id, role, password_hash, username FROM public.user_profiles WHERE email = $1',
    [email]
  );
  return res.rows[0] || null;
}

function setSession(req, { email, role, uid, username }) {
  req.session.email     = email;
  req.session.role      = role;
  req.session.uid       = uid;
  req.session.username  = username;
  req.session.timestamp = Date.now();
}

// Send OTP email via Resend API
async function sendOtpEmail(email, otp) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) throw new Error('RESEND_API_KEY not configured');

  const body = JSON.stringify({
    from:    'ThrustVault <noreply@thrustvault.bharani-01.xyz>',
    to:      [email],
    subject: 'ThrustVault — Password Reset Code',
    html:    `
      <div style="font-family:Inter,sans-serif;max-width:480px;margin:0 auto;padding:32px;background:#f8f9fa;border-radius:12px;">
        <h2 style="color:#001e40;margin-bottom:8px;">Password Reset</h2>
        <p style="color:#475569;font-size:14px;">Use the code below to reset your ThrustVault password. It expires in <strong>10 minutes</strong>.</p>
        <div style="background:#001e40;color:#fff;font-size:32px;font-weight:800;letter-spacing:12px;text-align:center;padding:24px;border-radius:8px;margin:24px 0;">${otp}</div>
        <p style="color:#94a3b8;font-size:12px;">If you didn't request this, ignore this email.</p>
      </div>
    `,
  });

  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: 'api.resend.com',
      path:     '/emails',
      method:   'POST',
      headers:  { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
    }, (resp) => {
      let data = '';
      resp.on('data', c => data += c);
      resp.on('end', () => {
        const parsed = JSON.parse(data);
        if (resp.statusCode >= 400) reject(new Error(parsed.message || 'Resend API error'));
        else resolve(parsed);
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

// ── Auth Handlers ─────────────────────────────────────────────────────────────

async function login(req, res) {
  const { email, password } = req.body || {};
  if (!email || !password) return res.status(400).json({ error: 'Missing email or password' });

  try {
    const profile = await getProfileFromDB(email);
    if (!profile) return res.status(400).json({ error: 'Invalid email or password' });
    if (!profile.password_hash) return res.status(400).json({ error: 'Account has no password set. Contact an admin.' });

    const valid = await bcrypt.compare(password, profile.password_hash);
    if (!valid) return res.status(400).json({ error: 'Invalid email or password' });

    const role = normaliseRole(profile.role);
    setSession(req, { email, role, uid: profile.id, username: profile.username });
    return res.json({ email, role: clientRole(role), uid: profile.id, username: profile.username, timestamp: req.session.timestamp });

  } catch (err) {
    console.error('[Login Error]', err.message);
    return res.status(500).json({ error: 'Login failed. Please try again.' });
  }
}

function logout(req, res) {
  req.session.destroy(() => res.json({ success: true }));
}

function getSession(req, res) {
  const role = req.session.role;
  const ts   = req.session.timestamp || 0;
  if (!role || Date.now() - ts > 86_400_000) return res.json({ logged_in: false });
  res.json({ logged_in: true, email: req.session.email, role: clientRole(role), uid: req.session.uid, username: req.session.username });
}

async function forgotPassword(req, res) {
  const { email } = req.body || {};
  if (!email) return res.status(400).json({ error: 'Email is required' });

  try {
    // Always return success to prevent email enumeration
    const profile = await getProfileFromDB(email);
    if (!profile) return res.json({ success: true });

    const otp       = crypto.randomInt(100000, 999999).toString();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 min

    await pool.query(
      `INSERT INTO public.password_reset_tokens (email, token, expires_at) VALUES ($1, $2, $3)`,
      [email, otp, expiresAt]
    );

    await sendOtpEmail(email, otp);
    res.json({ success: true });
  } catch (e) {
    console.error('[ForgotPassword Error]', e.message);
    res.status(500).json({ error: 'Failed to send reset code. Try again.' });
  }
}

function verifyOtp(req, res) {
  const { email, token } = req.body || {};
  if (!email || !token) return res.status(400).json({ error: 'Email and token required' });
  // Store in session for the reset step — actual DB validation happens at reset
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
    // Validate OTP from DB
    const tokenRes = await pool.query(
      `SELECT id FROM public.password_reset_tokens
       WHERE email = $1 AND token = $2 AND used = FALSE AND expires_at > NOW()
       ORDER BY created_at DESC LIMIT 1`,
      [reset_email, reset_code]
    );
    if (!tokenRes.rows.length) {
      return res.status(400).json({ error: 'Invalid or expired reset code.' });
    }

    const hash = await bcrypt.hash(password, 12);
    await pool.query('UPDATE public.user_profiles SET password_hash = $1 WHERE email = $2', [hash, reset_email]);
    await pool.query('UPDATE public.password_reset_tokens SET used = TRUE WHERE id = $1', [tokenRes.rows[0].id]);

    req.session.destroy(() => {});
    res.json({ success: true });
  } catch (e) {
    console.error('[ResetPassword Error]', e.message);
    res.status(500).json({ error: 'Failed to reset password. Try again.' });
  }
}

async function changePassword(req, res) {
  const { currentPassword, newPassword } = req.body || {};
  if (!req.session.uid) {
    return res.status(401).json({ error: 'Unauthorized: Session not active.' });
  }
  if (!currentPassword || !newPassword) {
    return res.status(400).json({ error: 'Current password and new password are required.' });
  }
  if (newPassword.length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 characters.' });
  }
  try {
    const userRes = await pool.query('SELECT password_hash FROM public.user_profiles WHERE id = $1', [req.session.uid]);
    const user = userRes.rows[0];
    if (!user) return res.status(404).json({ error: 'User not found.' });

    const valid = await bcrypt.compare(currentPassword, user.password_hash);
    if (!valid) return res.status(400).json({ error: 'Incorrect current password.' });

    const newHash = await bcrypt.hash(newPassword, 12);
    await pool.query('UPDATE public.user_profiles SET password_hash = $1 WHERE id = $2', [newHash, req.session.uid]);
    res.json({ success: true, message: 'Password updated successfully.' });
  } catch (e) {
    console.error('[Change Password Error]', e.message);
    res.status(500).json({ error: e.message });
  }
}

module.exports = {
  login,
  logout,
  getSession,
  forgotPassword,
  verifyOtp,
  resetPassword,
  changePassword,
};
