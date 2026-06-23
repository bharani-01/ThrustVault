'use strict';
const crypto = require('crypto');
const pool = require('../config/db');
const { queryTable } = require('../utils/queryBuilder');
const { cognito } = require('../config/cognito');

// ACL rules for dynamic database table API endpoints (excluding guest read operations which are handled via guestRoutes)
const ACL = {
  motors: { POST: ['user', 'admin'], PATCH: ['user', 'admin'], DELETE: ['admin'] },
  categories: { POST: ['user', 'admin'], PATCH: ['user', 'admin'], DELETE: ['user', 'admin'] },
  custom_specs_schema: { POST: ['user', 'admin'], PATCH: ['user', 'admin'], DELETE: ['user', 'admin'] },
  access_requests: { GET: ['admin'], POST: ['user', 'admin'], PATCH: ['admin'], DELETE: ['admin'] },
  user_onboarding: { GET: ['user', 'admin'], POST: ['user', 'admin'], PATCH: ['user', 'admin'] },
  motor_test_runs: { GET: ['user', 'admin'], POST: ['user', 'admin'], PATCH: ['user', 'admin'], DELETE: ['user', 'admin'] },
  motor_test_data_points: { GET: ['user', 'admin'], POST: ['user', 'admin'], PATCH: ['user', 'admin'], DELETE: ['user', 'admin'] },
  draft_test_runs: { GET: ['user', 'admin'], POST: ['user', 'admin'], PATCH: ['user', 'admin'], DELETE: ['user', 'admin'] },
  escs: { GET: ['user', 'admin'], POST: ['user', 'admin'], PATCH: ['user', 'admin'], DELETE: ['admin'] },
  propellers: { GET: ['user', 'admin'], POST: ['user', 'admin'], PATCH: ['user', 'admin'], DELETE: ['admin'] },
};

let cachedDashboardStats = null;

async function getOrCalculateStats() {
  if (cachedDashboardStats) {
    return cachedDashboardStats;
  }

  try {
    const res = await pool.query('SELECT max_thrust, recommended_esc, motor_name, custom_parameters FROM motors');
    const allMotors = res.rows;

    const totalMotors = allMotors.length;

    function parseThrustToKg(thrustStr) {
      if (!thrustStr) return 0;
      const normalized = String(thrustStr).trim().toLowerCase().replace(/\s+/g, '');
      const match = normalized.match(/^([0-9.]+)(kg|g)?$/);
      if (match) {
        const val = parseFloat(match[1]);
        const unit = match[2] || 'kg';
        return unit === 'g' ? val / 1000 : val;
      }
      const numbers = normalized.match(/[0-9.]+/);
      if (numbers) {
        const val = parseFloat(numbers[0]);
        return (normalized.includes('g') && !normalized.includes('kg')) ? val / 1000 : val;
      }
      return 0;
    }

    let minThrust = Infinity;
    let maxThrust = -Infinity;
    allMotors.forEach(m => {
      const parsed = parseThrustToKg(m.max_thrust);
      if (parsed > 0) {
        if (parsed < minThrust) minThrust = parsed;
        if (parsed > maxThrust) maxThrust = parsed;
      }
    });

    let minThrustVal = 0;
    let maxThrustVal = 0;
    let thrustRangeStr = 'N/A';
    let maxThrustStr = 'N/A';

    if (minThrust !== Infinity && maxThrust !== -Infinity) {
      minThrustVal = minThrust;
      maxThrustVal = maxThrust;
      thrustRangeStr = minThrust === maxThrust 
        ? `${minThrust.toFixed(2)} kg` 
        : `${minThrust.toFixed(2)} – ${maxThrust.toFixed(2)} kg`;
      maxThrustStr = `${maxThrust.toFixed(2)} kg`;
    }

    let sRatings = [];
    allMotors.forEach(m => {
      const customParams = m.custom_parameters || {};
      const v = (customParams.voltage || customParams.voltage_v || customParams.operating_voltage)
        ? String(customParams.voltage || customParams.voltage_v || customParams.operating_voltage)
        : '';
      const esc = m.recommended_esc || '';
      const name = m.motor_name || '';
      
      const match = v.match(/(\d+)s/i) || esc.match(/(\d+)s/i) || name.match(/(\d+)s/i);
      if (match) {
        sRatings.push(parseInt(match[1], 10));
      }
    });

    let voltageRangeStr = 'N/A';
    if (sRatings.length > 0) {
      const minS = Math.min(...sRatings);
      const maxS = Math.max(...sRatings);
      voltageRangeStr = minS === maxS ? `${minS}S` : `${minS}S – ${maxS}S`;
    }

    cachedDashboardStats = {
      total_motors: totalMotors,
      min_thrust: minThrustVal,
      max_thrust: maxThrustVal,
      thrust_range: thrustRangeStr,
      max_thrust_str: maxThrustStr,
      voltage_range: voltageRangeStr
    };

    return cachedDashboardStats;
  } catch (err) {
    console.error('Error calculating stats:', err);
    return {
      total_motors: 0,
      min_thrust: 0,
      max_thrust: 0,
      thrust_range: 'N/A',
      max_thrust_str: 'N/A',
      voltage_range: 'N/A'
    };
  }
}

function invalidateStatsCache() {
  cachedDashboardStats = null;
}

/**
 * Bootstrap data query to get categories, motor counts, custom parameters schema,
 * and first 15 motors in a single parallel operation.
 */
async function initData(req, res) {
  const LIMIT = 15;
  try {
    const [cats, counts, schema, motors, kpis, brandsQuery] = await Promise.all([
      pool.query('SELECT id, name, description FROM categories ORDER BY name'),
      pool.query(`SELECT category_id, COUNT(*)::int AS cnt FROM motors 
                  WHERE max_thrust NOT IN ('0', '0.0', '0.00', '0.000', '0.000 kg', '0 kg', '0 g', '0kg', '0g', '') AND max_thrust IS NOT NULL
                  GROUP BY category_id`),
      pool.query('SELECT * FROM custom_specs_schema ORDER BY created_at'),
      pool.query(`SELECT id, category_id, motor_name, company, max_thrust,
                         recommended_esc, recommended_propeller,
                         link_motor, link_esc, link_propeller, custom_parameters, uploaded_by,
                         main_image, gallery_images
                  FROM motors 
                  WHERE max_thrust NOT IN ('0', '0.0', '0.00', '0.000', '0.000 kg', '0 kg', '0 g', '0kg', '0g', '') AND max_thrust IS NOT NULL
                  ORDER BY max_thrust ASC LIMIT $1`, [LIMIT]),
      getOrCalculateStats(),
      pool.query(`SELECT DISTINCT company FROM motors 
                  WHERE company IS NOT NULL AND company != '' 
                    AND max_thrust NOT IN ('0', '0.0', '0.00', '0.000', '0.000 kg', '0 kg', '0 g', '0kg', '0g', '') AND max_thrust IS NOT NULL
                  ORDER BY company`)
    ]);

    const categoryCounts = {};
    counts.rows.forEach(r => {
      if (r.category_id) categoryCounts[String(r.category_id)] = r.cnt;
    });

    res.json({
      categories: cats.rows,
      category_counts: categoryCounts,
      custom_schema: schema.rows,
      first_motors: motors.rows,
      has_more: motors.rows.length >= LIMIT,
      dashboard_stats: kpis,
      brands: brandsQuery.rows.map(r => r.company).filter(Boolean)
    });
  } catch (e) {
    console.error('[init-data]', e.message);
    res.status(500).json({ error: e.message });
  }
}

// ── Motors ───────────────────────────────────────────────────────────────────

async function getMotors(req, res) {
  try {
    const qp = { ...req.query, exclude_zero_thrust: 'true' };
    
    // Fetch total count without limit, offset, or order using a lightweight id select
    delete qp.limit;
    delete qp.offset;
    delete qp.order;
    qp.select = 'id';
    
    const allMatching = await queryTable('motors', 'GET', null, qp);
    const totalCount = allMatching.length;
    
    const data = await queryTable('motors', 'GET', null, { ...req.query, exclude_zero_thrust: 'true' });
    res.setHeader('X-Total-Count', totalCount);
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}

async function createMotor(req, res) {
  try {
    // Dynamic tracking of uploader
    const payload = { ...req.body, uploaded_by: req.session.email };
    invalidateStatsCache();
    res.json(await queryTable('motors', 'POST', payload, null));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}

// ── ESCs ─────────────────────────────────────────────────────────────────────

async function getEscs(req, res) {
  try {
    res.json(await queryTable('escs', 'GET', null, req.query));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}

async function createEsc(req, res) {
  try {
    res.json(await queryTable('escs', 'POST', req.body, null));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}

// ── Propellers ───────────────────────────────────────────────────────────────

async function getPropellers(req, res) {
  try {
    res.json(await queryTable('propellers', 'GET', null, req.query));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}

async function createPropeller(req, res) {
  try {
    res.json(await queryTable('propellers', 'POST', req.body, null));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}

async function updateRecommendations(req, res) {
  const ALLOWED = ['recommended_esc', 'recommended_propeller', 'recommended_battery', 'link_esc', 'link_propeller'];
  const payload = {};
  ALLOWED.forEach(k => {
    if (req.body[k] !== undefined) payload[k] = req.body[k];
  });
  if (!Object.keys(payload).length) return res.status(400).json({ error: 'No valid fields' });
  try {
    invalidateStatsCache();
    res.json(await queryTable('motors', 'PATCH', payload, { id: `eq.${req.params.id}` }));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}

// ── Categories ───────────────────────────────────────────────────────────────

async function getCategories(req, res) {
  try {
    res.json(await queryTable('categories', 'GET', null, req.query));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}

async function createCategory(req, res) {
  try {
    res.json(await queryTable('categories', 'POST', req.body, null));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}

async function deleteCategory(req, res) {
  try {
    res.json(await queryTable('categories', 'DELETE', null, { id: `eq.${req.params.id}` }));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}

// ── Custom Specs Schema ──────────────────────────────────────────────────────

async function getCustomSpecs(req, res) {
  try {
    res.json(await queryTable('custom_specs_schema', 'GET', null, req.query));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}

async function createCustomSpec(req, res) {
  try {
    res.json(await queryTable('custom_specs_schema', 'POST', req.body, null));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}

async function deleteCustomSpec(req, res) {
  try {
    res.json(await queryTable('custom_specs_schema', 'DELETE', null, { id: `eq.${req.params.id}` }));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}

// ── Onboarding ───────────────────────────────────────────────────────────────

async function getOnboarding(req, res) {
  const uid = req.session.uid;
  try {
    const r = await pool.query('SELECT * FROM user_onboarding WHERE user_id = $1', [uid]);
    res.json(r.rows[0] || { user_id: uid, pages_progress: {}, tour_completed: false });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}

async function saveOnboarding(req, res) {
  const uid = req.session.uid;
  const payload = { ...req.body, user_id: uid };
  try {
    const ex = await pool.query('SELECT id FROM user_onboarding WHERE user_id = $1', [uid]);
    if (ex.rows.length > 0) {
      res.json(await queryTable('user_onboarding', 'PATCH', payload, { user_id: `eq.${uid}` }));
    } else {
      res.json(await queryTable('user_onboarding', 'POST', payload, null));
    }
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}

// ── User Profiles ────────────────────────────────────────────────────────────

async function getUserProfiles(req, res) {
  try {
    res.json(await queryTable('user_profiles', 'GET', null, req.query));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}

// ── Activity Log ─────────────────────────────────────────────────────────────

async function logActivity(req, res) {
  const { email, role, action, details } = req.body || {};
  try {
    await pool.query(
      `INSERT INTO audit_logs (email, role, route, method, status, ip_address, user_agent, risk_level, details)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       ON CONFLICT DO NOTHING`,
      [
        email || req.session.email || 'Anonymous',
        role || req.session.role || 'Anonymous',
        action || 'API-Activity',
        req.method || 'POST',
        200,
        req.ip || req.headers['x-forwarded-for'] || '127.0.0.1',
        req.headers['user-agent'] || 'Node Client',
        'info',
        details || ''
      ]
    );
    res.json({ success: true });
  } catch (e) {
    console.warn('[log-activity]', e.message);
    res.json({ success: false }); // non-fatal
  }
}

// ── Access Requests & Demo ───────────────────────────────────────────────────

async function requestDemo(req, res) {
  const { name, company, email, usecase } = req.body || {};
  if (!name || !company || !email) {
    return res.status(400).json({ success: false, error: 'Missing required fields' });
  }
  try {
    await queryTable('access_requests', 'POST', {
      full_name: name,
      email,
      requested_role: 'guest',
      justification: `Demo Request — Company: ${company}, Use Case: ${usecase || 'research'}`,
      status: 'pending',
    });
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
}

async function sendResendEmail({ type, to, full_name, temp_password }) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey || apiKey === 're_placeholder_key') {
    console.warn('EMAIL SYSTEM WARNING: RESEND_API_KEY is not configured. Email skipped.');
    return;
  }

  const appUrl = process.env.APP_BASE_URL || 'https://thrustvault.bharani-01.xyz';
  let subject = '';
  let html = '';

  if (type === 'received') {
    subject = 'ThrustVault Access Request Received';
    html = `
      <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 25px; border: 1px solid #e2e8f0; border-radius: 12px; background-color: #ffffff;">
          <div style="text-align: center; border-bottom: 2px solid #2563eb; padding-bottom: 15px; margin-bottom: 20px;">
              <h2 style="color: #2563eb; margin: 0; font-family: sans-serif;">ThrustVault Access Request</h2>
          </div>
          <p>Hello ${full_name},</p>
          <p>Thank you for requesting access to the <strong>ThrustVault UAV Motor Database Console</strong>. We have received your request.</p>
          <p>Our administrators are currently reviewing your application. You will receive an email notification once a decision has been made.</p>
          <p>You can visit the console home page here: <a href="${appUrl}" style="color: #2563eb; text-decoration: none; font-weight: 500;">${appUrl}</a></p>
          <p style="margin-top: 30px; font-size: 0.82rem; color: #64748b; border-top: 1px solid #e2e8f0; padding-top: 15px;">
              This is an automated notification from ThrustVault. Please do not reply directly to this email.
          </p>
      </div>
    `;
  } else if (type === 'approved') {
    subject = 'ThrustVault Access Approved';
    html = `
      <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 25px; border: 1px solid #e2e8f0; border-radius: 12px; background-color: #ffffff;">
          <div style="text-align: center; border-bottom: 2px solid #059669; padding-bottom: 15px; margin-bottom: 20px;">
              <h2 style="color: #059669; margin: 0; font-family: sans-serif;">Access Approved</h2>
          </div>
          <p>Hello ${full_name},</p>
          <p>We are pleased to inform you that your access request to the <strong>ThrustVault UAV Motor Database Console</strong> has been approved.</p>
          <p>You can log in using the temporary credentials below:</p>
          <table style="background-color: #f8fafc; padding: 15px; border-radius: 8px; width: 100%; border: 1px solid #e2e8f0; font-family: monospace; margin: 15px 0;">
              <tr><td style="padding: 5px;"><strong>Email:</strong></td><td style="padding: 5px;">${to}</td></tr>
              <tr><td style="padding: 5px;"><strong>Default Password:</strong></td><td style="padding: 5px;"><code>${temp_password}</code></td></tr>
          </table>
          <p style="margin-top: 20px; text-align: center; margin-bottom: 20px;">
              <a href="${appUrl}/login" style="display: inline-block; padding: 10px 20px; background-color: #059669; color: #ffffff; text-decoration: none; border-radius: 8px; font-weight: bold; font-family: sans-serif;">Log In to ThrustVault</a>
          </p>
          <p style="margin-top: 30px; font-size: 0.82rem; color: #64748b; border-top: 1px solid #e2e8f0; padding-top: 15px;">
              This is an automated notification from ThrustVault. Please do not reply directly to this email.
          </p>
      </div>
    `;
  }

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from: 'ThrustVault <no-reply@bharani-01.xyz>',
        to: [to],
        subject,
        html
      })
    });
    if (!res.ok) {
      const errBody = await res.text();
      console.error(`Resend API returned error status ${res.status}: ${errBody}`);
    }
  } catch (e) {
    console.error('Failed to send email via Resend:', e.message);
  }
}

async function requestAccess(req, res) {
  const { fullName, email, justification } = req.body || {};
  if (!fullName || !email || !justification) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    return res.status(400).json({ error: 'Invalid email address format' });
  }

  try {
    const dup = await pool.query('SELECT id FROM user_profiles WHERE email = $1', [email]);
    if (dup.rows.length) {
      // Self-healing: Check if user actually exists in AWS Cognito User Pool.
      // If they don't, we clean up the stale DB records so registration can proceed.
      const USER_POOL_ID = process.env.COGNITO_USER_POOL_ID;
      let existsInCognito = false;
      if (USER_POOL_ID) {
        try {
          const { ListUsersCommand } = require('@aws-sdk/client-cognito-identity-provider');
          const listUsersRes = await cognito.send(new ListUsersCommand({
            UserPoolId: USER_POOL_ID,
            Filter: `email = "${email}"`
          }));
          existsInCognito = listUsersRes.Users && listUsersRes.Users.length > 0;
        } catch (cognitoErr) {
          console.warn('[Self-Healing] Failed to list users from Cognito:', cognitoErr.message);
          // If we fail to check Cognito (e.g. credentials error), we assume they exist to be safe.
          existsInCognito = true;
        }
      }

      if (!existsInCognito) {
        console.log(`[Self-Healing] User ${email} exists in database but not in Cognito. Cleaning up stale database records...`);
        const client = await pool.connect();
        try {
          await client.query('BEGIN');
          const userId = dup.rows[0].id;
          await client.query('DELETE FROM public.user_onboarding WHERE user_id = $1', [userId]);
          await client.query('DELETE FROM public.user_profiles WHERE id = $1', [userId]);
          await client.query('DELETE FROM auth.users WHERE id = $1', [userId]);
          await client.query('DELETE FROM public.access_requests WHERE email = $1', [email]);
          await client.query('COMMIT');
        } catch (err) {
          await client.query('ROLLBACK');
          console.error('[Self-Healing] DB cleanup error:', err.message);
          return res.status(500).json({ error: 'Database cleanup failed during self-healing: ' + err.message });
        } finally {
          client.release();
        }
      } else {
        return res.status(409).json({ error: 'An account already exists with this email.' });
      }
    }

    const pend = await pool.query("SELECT id FROM access_requests WHERE email = $1 AND status = 'pending'", [email]);
    if (pend.rows.length) return res.status(409).json({ error: 'A request is already pending for this email.' });

    // Check system settings for auto approve
    const settingsRes = await pool.query("SELECT value FROM public.system_settings WHERE key = 'auto_approve'");
    const autoApprove = settingsRes.rows[0]?.value === true || settingsRes.rows[0]?.value === 'true';

    if (autoApprove) {
      const tempPassword = crypto.randomBytes(6).toString('hex') + 'V@' + Math.floor(Math.random() * 100);

      const USER_POOL_ID = process.env.COGNITO_USER_POOL_ID;
      if (!USER_POOL_ID) {
        throw new Error('AWS Cognito User Pool is not configured in environment variables.');
      }

      let newUid = null;
      let targetUsername = null;
      const {
        AdminCreateUserCommand,
        AdminSetUserPasswordCommand,
        ListUsersCommand
      } = require('@aws-sdk/client-cognito-identity-provider');

      // 1. Create User in Cognito
      const cogUsername = crypto.randomUUID();
      try {
        const createUserRes = await cognito.send(new AdminCreateUserCommand({
          UserPoolId: USER_POOL_ID,
          Username: cogUsername,
          UserAttributes: [
            { Name: 'email', Value: email },
            { Name: 'email_verified', Value: 'true' }
          ],
          MessageAction: 'SUPPRESS'
        }));
        const subAttr = createUserRes.User.Attributes.find(a => a.Name === 'sub');
        newUid = subAttr ? subAttr.Value : null;
        targetUsername = createUserRes.User.Username;
      } catch (cognitoErr) {
        if (cognitoErr.name === 'UsernameExistsException' || cognitoErr.name === 'AliasExistsException' || cognitoErr.message.includes('exists')) {
          // User already exists, search by email to retrieve the existing sub/username
          const listUsersRes = await cognito.send(new ListUsersCommand({
            UserPoolId: USER_POOL_ID,
            Filter: `email = "${email}"`
          }));
          if (listUsersRes.Users && listUsersRes.Users.length > 0) {
            targetUsername = listUsersRes.Users[0].Username;
            const subAttr = listUsersRes.Users[0].Attributes.find(a => a.Name === 'sub');
            newUid = subAttr ? subAttr.Value : null;
          } else {
            throw cognitoErr;
          }
        } else {
          throw cognitoErr;
        }
      }

      if (!newUid || !targetUsername) {
        throw new Error('Failed to retrieve user identifiers from AWS Cognito.');
      }

      // 2. Set permanent password in Cognito (using Cognito Username)
      await cognito.send(new AdminSetUserPasswordCommand({
        UserPoolId: USER_POOL_ID,
        Username: targetUsername,
        Password: tempPassword,
        Permanent: true
      }));

      const client = await pool.connect();
      try {
        await client.query('BEGIN');

        // 0. Clean up any orphaned profile record with the same email if it exists
        await client.query(`
          DELETE FROM public.user_profiles 
          WHERE email = $1 AND id NOT IN (SELECT id FROM auth.users)
        `, [email]);

        // 1. Insert into auth.users
        await client.query(`
          INSERT INTO auth.users (
            instance_id, id, aud, role, email, encrypted_password, 
            email_confirmed_at, recovery_sent_at, last_sign_in_at, 
            raw_app_meta_data, raw_user_meta_data, created_at, updated_at, 
            confirmation_token, email_change, email_change_token_new, recovery_token
          )
          VALUES (
            '00000000-0000-0000-0000-000000000000',
            $1, 'authenticated', 'authenticated', $2, crypt($3, gen_salt('bf')),
            now(), now(), now(),
            '{"provider":"email","providers":["email"]}'::jsonb,
            json_build_object('role', 'user')::jsonb,
            now(), now(), '', '', '', ''
          )
          ON CONFLICT (id) DO NOTHING
        `, [newUid, email, tempPassword]);

        // 2. Insert into public.user_profiles (role is 'user' directly now)
        await client.query(`
          INSERT INTO public.user_profiles (id, email, role)
          VALUES ($1, $2, 'user')
          ON CONFLICT (id) DO UPDATE SET email = EXCLUDED.email, role = EXCLUDED.role
        `, [newUid, email]);

        // 3. Save approved access request
        await client.query(`
          INSERT INTO public.access_requests (full_name, email, requested_role, justification, status)
          VALUES ($1, $2, 'user', $3, 'approved')
        `, [fullName, email, justification]);

        await client.query('COMMIT');
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      } finally {
        client.release();
      }

      sendResendEmail({
        type: 'approved',
        to: email,
        full_name: fullName,
        temp_password: tempPassword
      }).catch(console.error);

      return res.json({ success: true, auto_approved: true });

    } else {
      await queryTable('access_requests', 'POST', {
        full_name: fullName,
        email,
        requested_role: 'user',
        justification,
        status: 'pending',
      });

      sendResendEmail({
        type: 'received',
        to: email,
        full_name: fullName
      }).catch(console.error);

      return res.json({ success: true, auto_approved: false });
    }

  } catch (e) {
    console.error('[requestAccess]', e.message);
    res.status(500).json({ error: e.message });
  }
}

async function dbProxy(req, res) {
  const table = req.params.table.replace(/-/g, '_');
  let method = req.method.toUpperCase();
  if (method === 'PUT') method = 'PATCH';

  if (!ACL[table]) return res.status(400).json({ error: `Table '${table}' not supported` });

  const allowedRoles = ACL[table][method] || [];
  const role = req.session.role;
  const uid = req.session.uid;
  const ts = req.session.timestamp || 0;

  // Since Postgres APIs are strictly locked, we enforce that caller must have a valid session
  if (!role || !uid || Date.now() - ts > 86_400_000) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  if (!allowedRoles.includes(role)) {
    return res.status(403).json({ error: `Forbidden: ${role} cannot ${method} ${table}` });
  }

  const qp = { ...req.query };
  if (table === 'user_onboarding') qp.user_id = `eq.${uid}`;

  try {
    let m = method;
    if (table === 'user_onboarding' && method === 'POST') {
      const ex = await pool.query('SELECT id FROM user_onboarding WHERE user_id = $1', [uid]);
      if (ex.rows.length) {
        m = 'PATCH';
        Object.keys(qp).forEach(k => {
          if (k !== 'user_id') delete qp[k];
        });
      }
    }

    // Inject uploaded_by dynamically for new entries in motors or motor_test_runs
    const payload = ['POST', 'PATCH'].includes(m) ? req.body : null;
    if (payload && m === 'POST') {
      if (Array.isArray(payload)) {
        payload.forEach(item => {
          if (table === 'motor_test_runs' || table === 'motors') {
            item.uploaded_by = req.session.email;
          }
        });
      } else if (typeof payload === 'object') {
        if (table === 'motor_test_runs' || table === 'motors') {
          payload.uploaded_by = req.session.email;
        }
      }
    }

    const data = await queryTable(table, m, payload, qp);
    if (table === 'motors' && ['POST', 'PATCH', 'DELETE'].includes(m)) {
      invalidateStatsCache();
    }
    if (table === 'user_onboarding' && m === 'GET') {
      return res.json(data.length ? data[0] : { user_id: uid, pages_progress: {}, tour_completed: false });
    }
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}

module.exports = {
  initData,
  getMotors,
  createMotor,
  getEscs,
  createEsc,
  getPropellers,
  createPropeller,
  updateRecommendations,
  getCategories,
  createCategory,
  deleteCategory,
  getCustomSpecs,
  createCustomSpec,
  deleteCustomSpec,
  getOnboarding,
  saveOnboarding,
  getUserProfiles,
  logActivity,
  requestDemo,
  requestAccess,
  dbProxy,
};
