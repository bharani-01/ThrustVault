'use strict';
require('dotenv').config();

const app = require('./src/app');
const pool = require('./src/config/db');
const { syncPostgresToSqlite } = require('./src/utils/sqliteSync');

const PORT = parseInt(process.env.PORT || '8000', 10);

/**
 * Run all database migrations sequentially.
 * Each statement is its own round-trip so DDL locks are released promptly.
 */
async function runMigrations(client) {
  // 1. system_settings table
  await client.query(`
    CREATE TABLE IF NOT EXISTS public.system_settings (
        key VARCHAR(255) PRIMARY KEY,
        value JSONB NOT NULL
    )
  `);
  await client.query(`
    INSERT INTO public.system_settings (key, value)
    VALUES ('auto_approve', 'false'::jsonb)
    ON CONFLICT (key) DO NOTHING
  `);

  // 2. role migration: intern -> user (user_profiles)
  await client.query(`
    DO $$
    DECLARE r RECORD;
    BEGIN
      IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'user_profiles' AND column_name = 'role') THEN
        FOR r IN
          SELECT constraint_name FROM information_schema.table_constraints
          WHERE table_name = 'user_profiles' AND constraint_type = 'CHECK'
            AND constraint_name LIKE '%role%'
        LOOP
          EXECUTE 'ALTER TABLE public.user_profiles DROP CONSTRAINT IF EXISTS ' || quote_ident(r.constraint_name);
        END LOOP;
        UPDATE public.user_profiles SET role = 'user' WHERE role = 'intern';
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.table_constraints
          WHERE table_name = 'user_profiles' AND constraint_name = 'user_profiles_role_check'
        ) THEN
          ALTER TABLE public.user_profiles ADD CONSTRAINT user_profiles_role_check
            CHECK (role IN ('guest', 'user', 'admin'));
        END IF;
      END IF;
    END $$
  `);

  // 3. role migration: intern -> user (access_requests)
  await client.query(`
    DO $$
    DECLARE r RECORD;
    BEGIN
      IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'access_requests' AND column_name = 'requested_role') THEN
        FOR r IN
          SELECT constraint_name FROM information_schema.table_constraints
          WHERE table_name = 'access_requests' AND constraint_type = 'CHECK'
            AND constraint_name LIKE '%requested_role%'
        LOOP
          EXECUTE 'ALTER TABLE public.access_requests DROP CONSTRAINT IF EXISTS ' || quote_ident(r.constraint_name);
        END LOOP;
        UPDATE public.access_requests SET requested_role = 'user' WHERE requested_role = 'intern';
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.table_constraints
          WHERE table_name = 'access_requests' AND constraint_name = 'access_requests_requested_role_check'
        ) THEN
          ALTER TABLE public.access_requests ADD CONSTRAINT access_requests_requested_role_check
            CHECK (requested_role IN ('guest', 'user', 'admin'));
        END IF;
      END IF;
    END $$
  `);

  // 4. uploaded_by columns
  await client.query(`ALTER TABLE public.motors ADD COLUMN IF NOT EXISTS uploaded_by VARCHAR(255)`);
  await client.query(`ALTER TABLE public.motor_test_runs ADD COLUMN IF NOT EXISTS uploaded_by VARCHAR(255)`);

  // 5. image columns on motors
  await client.query(`ALTER TABLE public.motors ADD COLUMN IF NOT EXISTS main_image TEXT`);
  await client.query(`ALTER TABLE public.motors ADD COLUMN IF NOT EXISTS gallery_images JSONB DEFAULT '[]'::jsonb`);

  // 6. ESCs table
  await client.query(`
    CREATE TABLE IF NOT EXISTS public.escs (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name VARCHAR(255) NOT NULL,
        brand VARCHAR(255) NOT NULL,
        price VARCHAR(100),
        currency VARCHAR(50),
        url TEXT,
        sku VARCHAR(255),
        main_image TEXT,
        gallery_images JSONB DEFAULT '[]'::jsonb,
        custom_parameters JSONB DEFAULT '{}'::jsonb,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
        CONSTRAINT uq_esc_name_brand UNIQUE (name, brand)
    )
  `);

  // 7. Propellers table
  await client.query(`
    CREATE TABLE IF NOT EXISTS public.propellers (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name VARCHAR(255) NOT NULL,
        brand VARCHAR(255) NOT NULL,
        price VARCHAR(100),
        currency VARCHAR(50),
        url TEXT,
        sku VARCHAR(255),
        main_image TEXT,
        gallery_images JSONB DEFAULT '[]'::jsonb,
        custom_parameters JSONB DEFAULT '{}'::jsonb,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
        CONSTRAINT uq_prop_name_brand UNIQUE (name, brand)
    )
  `);

  // 8. Indexes on ESCs and propellers
  await client.query(`CREATE INDEX IF NOT EXISTS idx_escs_brand ON public.escs(brand)`);
  await client.query(`CREATE INDEX IF NOT EXISTS idx_propellers_brand ON public.propellers(brand)`);

  // 9. username column on user_profiles
  await client.query(`ALTER TABLE public.user_profiles ADD COLUMN IF NOT EXISTS username VARCHAR(255) UNIQUE`);
  await client.query(`
    UPDATE public.user_profiles
    SET username = split_part(email, '@', 1) || '_' || substring(id::text, 1, 4)
    WHERE username IS NULL
  `);
}

async function bootstrap() {
  try {
    console.log('🔌 Verifying PostgreSQL connection & running database migrations...');

    const client = await pool.connect();
    try {
      // Advisory lock (ID: 7474) ensures only ONE process runs migrations at a time.
      // If another server is already running migrations, this one skips safely.
      const lockRes = await client.query('SELECT pg_try_advisory_lock(7474) AS acquired');
      const lockAcquired = lockRes.rows[0].acquired;

      if (lockAcquired) {
        console.log('🔒 Migration lock acquired — running migrations...');
        await runMigrations(client);
        await client.query('SELECT pg_advisory_unlock(7474)');
        console.log('✅  AWS RDS PostgreSQL connection verified, system settings initialized, and migrations applied');
      } else {
        console.log('ℹ️  Another process is running migrations — skipping (already up to date).');
      }
    } finally {
      client.release();
    }

    // Run SQLite guest database synchronization
    await syncPostgresToSqlite();

    // Start Express server listener
    app.listen(PORT, '0.0.0.0', () => {
      console.log(`🚀  ThrustVault running on http://localhost:${PORT}`);
    });

  } catch (err) {
    console.error('❌  Server bootstrap / database initialization failed:', err.message);
    process.exit(1);
  }
}

bootstrap();
