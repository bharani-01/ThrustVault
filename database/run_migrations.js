'use strict';
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

const isLocal = process.env.DB_HOST === 'localhost' || process.env.DB_HOST === '127.0.0.1';
const useSSL = process.env.DB_SSL === 'true' || (!isLocal && process.env.DB_SSL !== 'false');

const pool = new Pool({
  host:                   process.env.DB_HOST,
  port:                   parseInt(process.env.DB_PORT || '5432', 10),
  database:               process.env.DB_NAME     || 'postgres',
  user:                   process.env.DB_USER     || 'postgres',
  password:               process.env.DB_PASSWORD,
  ssl:                    useSSL ? { rejectUnauthorized: false } : false,
});

async function main() {
  console.log('🔌 Connecting to PostgreSQL database to run migrations...');
  const client = await pool.connect();
  try {
    // 0. Ensure auth schema, auth.uid() function, and auth.users table exist
    console.log('⏳ Ensuring auth schema, auth.uid() stub, and auth.users table exist...');
    await client.query('CREATE SCHEMA IF NOT EXISTS auth;');
    await client.query(`
      CREATE TABLE IF NOT EXISTS auth.users (
          id UUID PRIMARY KEY,
          email VARCHAR(255) UNIQUE NOT NULL,
          encrypted_password VARCHAR(255),
          email_confirmed_at TIMESTAMP WITH TIME ZONE,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
          updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
          instance_id UUID,
          aud VARCHAR(255),
          role VARCHAR(255),
          recovery_sent_at TIMESTAMP WITH TIME ZONE,
          last_sign_in_at TIMESTAMP WITH TIME ZONE,
          raw_app_meta_data JSONB,
          raw_user_meta_data JSONB,
          confirmation_token VARCHAR(255),
          email_change VARCHAR(255),
          email_change_token_new VARCHAR(255),
          recovery_token VARCHAR(255)
      );
    `);
    await client.query(`
      CREATE OR REPLACE FUNCTION auth.uid()
      RETURNS UUID AS $$
      BEGIN
        RETURN NULL;
      END;
      $$ LANGUAGE plpgsql;
    `);
    console.log('✅ Auth schema, users table, and stub verified.');

    // 1. Run database/schema.sql
    console.log('⏳ Applying core schema (database/schema.sql)...');
    const schemaSql = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
    await client.query(schemaSql);
    console.log('✅ Core schema applied successfully.');

    // 2. Run database/migration_pg_auth.sql
    console.log('⏳ Applying PostgreSQL auth migration (database/migration_pg_auth.sql)...');
    const authSql = fs.readFileSync(path.join(__dirname, 'migration_pg_auth.sql'), 'utf8');
    await client.query(authSql);
    console.log('✅ Auth migration applied successfully.');

    // 3. Run database/02_seed.sql
    console.log('⏳ Seeding demo users and credentials (database/02_seed.sql)...');
    const seedSql = fs.readFileSync(path.join(__dirname, '02_seed.sql'), 'utf8');
    await client.query(seedSql);
    console.log('✅ Database successfully seeded.');

    console.log('🎉 Migrations successfully completed!');
  } catch (err) {
    console.error('❌ MIGRATION ERROR:', err.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

main();
