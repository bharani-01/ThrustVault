'use strict';
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const pool = require('../src/config/db');

async function main() {
  const emails = ['bharanisri73@gmail.com', 'admindemo@thrustvault.in'];
  
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    
    for (const email of emails) {
      console.log(`Promoting ${email} to admin...`);
      
      // Update public.user_profiles
      const profileRes = await client.query(
        `UPDATE public.user_profiles SET role = 'admin' WHERE email = $1 RETURNING id`,
        [email]
      );
      
      if (profileRes.rows.length > 0) {
        const id = profileRes.rows[0].id;
        console.log(`  Found user profile ID: ${id}`);
        
        // Update auth.users metadata
        await client.query(
          `UPDATE auth.users SET raw_user_meta_data = json_build_object('role', 'admin')::jsonb WHERE id = $1`,
          [id]
        );
        console.log(`  Successfully updated auth.users for ${email}`);
      } else {
        console.log(`  Warning: User ${email} not found in public.user_profiles.`);
      }
    }
    
    await client.query('COMMIT');
    console.log('Admin restoration complete!');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Failed to promote users:', err.message);
  } finally {
    client.release();
    await pool.end();
  }
}

main();
