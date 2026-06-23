'use strict';
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const pool = require('../src/config/db');
const { cognito } = require('../src/config/cognito');

async function syncNow() {
  const USER_POOL_ID = process.env.COGNITO_USER_POOL_ID;
  if (!USER_POOL_ID) {
    console.error('AWS Cognito User Pool is not configured.');
    process.exit(1);
  }

  try {
    const { ListUsersCommand } = require('@aws-sdk/client-cognito-identity-provider');
    console.log('Fetching users from Cognito...');
    const listRes = await cognito.send(new ListUsersCommand({
      UserPoolId: USER_POOL_ID
    }));

    const cognitoUsers = (listRes.Users || []).map(u => {
      const email = u.Attributes.find(a => a.Name === 'email')?.Value;
      const sub = u.Attributes.find(a => a.Name === 'sub')?.Value;
      return {
        id: sub,
        email: email,
        created_at: u.UserCreateDate,
        role: 'user'
      };
    }).filter(u => u.id && u.email);

    console.log(`Cognito contains ${cognitoUsers.length} users:`, cognitoUsers.map(u => u.email));

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const dbUsersRes = await client.query('SELECT id, email, role FROM public.user_profiles');
      const dbUsers = dbUsersRes.rows;
      console.log(`PostgreSQL contains ${dbUsers.length} user profiles:`, dbUsers.map(u => u.email));

      const cognitoIds = new Set(cognitoUsers.map(u => u.id));
      const orphanedDbUsers = dbUsers.filter(u => !cognitoIds.has(u.id));

      for (const orphan of orphanedDbUsers) {
        console.log(`[Auto-Sync] Cleaning up orphaned user in DB (not in Cognito): ${orphan.email}`);
        await client.query('DELETE FROM public.user_onboarding WHERE user_id = $1', [orphan.id]);
        await client.query('DELETE FROM public.user_profiles WHERE id = $1', [orphan.id]);
        await client.query('DELETE FROM auth.users WHERE id = $1', [orphan.id]);
      }

      const dbUserIds = new Set(dbUsers.map(u => u.id));
      const missingInDb = cognitoUsers.filter(u => !dbUserIds.has(u.id));

      for (const missing of missingInDb) {
        console.log(`[Auto-Sync] Auto-creating missing database profile for Cognito user: ${missing.email}`);
        await client.query(`
          INSERT INTO auth.users (
            instance_id, id, aud, role, email, encrypted_password, 
            email_confirmed_at, recovery_sent_at, last_sign_in_at, 
            raw_app_meta_data, raw_user_meta_data, created_at, updated_at, 
            confirmation_token, email_change, email_change_token_new, recovery_token
          )
          VALUES (
            '00000000-0000-0000-0000-000000000000',
            $1, 'authenticated', 'authenticated', $2, crypt('ThrustVaultSyncPass123!', gen_salt('bf')),
            now(), now(), now(),
            '{"provider":"email","providers":["email"]}'::jsonb,
            json_build_object('role', 'user')::jsonb,
            now(), now(), '', '', '', ''
          )
          ON CONFLICT (id) DO NOTHING
        `, [missing.id, missing.email]);

        await client.query(`
          INSERT INTO public.user_profiles (id, email, role)
          VALUES ($1, $2, 'user')
          ON CONFLICT (id) DO NOTHING
        `, [missing.id, missing.email]);
      }

      await client.query('COMMIT');
      console.log('Sync finished successfully.');
    } catch (syncErr) {
      await client.query('ROLLBACK');
      console.error('[Auto-Sync Error]', syncErr);
    } finally {
      client.release();
    }
  } catch (err) {
    console.error('Error fetching Cognito users:', err.message);
  } finally {
    await pool.end();
  }
}

syncNow();
