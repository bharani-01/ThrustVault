'use strict';
require('dotenv').config();

const app = require('./src/app');
const pool = require('./src/config/db');
const { syncPostgresToSqlite } = require('./src/utils/sqliteSync');

const PORT = parseInt(process.env.PORT || '8000', 10);

async function bootstrap() {
  try {
    console.log('🔌 Verifying PostgreSQL connection & running database migrations...');
    
    // 1. Run PostgreSQL initialization & migrations
    await pool.query(`
      -- Initialize system settings table
      CREATE TABLE IF NOT EXISTS public.system_settings (
          key VARCHAR(255) PRIMARY KEY,
          value JSONB NOT NULL
      );
      INSERT INTO public.system_settings (key, value) 
      VALUES ('auto_approve', 'false'::jsonb) 
      ON CONFLICT (key) DO NOTHING;

      -- Dynamic Migration: Change intern role to user in constraints and tables
      DO $$ 
      DECLARE 
          r RECORD;
      BEGIN 
          IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'user_profiles' AND column_name = 'role') THEN
              FOR r IN 
                  SELECT constraint_name 
                  FROM information_schema.constraint_column_usage 
                  WHERE table_name = 'user_profiles' AND column_name = 'role' 
                    AND constraint_name LIKE '%check%'
              LOOP
                  EXECUTE 'ALTER TABLE public.user_profiles DROP CONSTRAINT ' || quote_ident(r.constraint_name);
              END LOOP;
              UPDATE public.user_profiles SET role = 'user' WHERE role = 'intern';
              ALTER TABLE public.user_profiles ADD CONSTRAINT user_profiles_role_check CHECK (role IN ('guest', 'user', 'admin'));
          END IF;
      END $$;

      DO $$ 
      DECLARE 
          r RECORD;
      BEGIN 
          IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'access_requests' AND column_name = 'requested_role') THEN
              FOR r IN 
                  SELECT constraint_name 
                  FROM information_schema.constraint_column_usage 
                  WHERE table_name = 'access_requests' AND column_name = 'requested_role' 
                    AND constraint_name LIKE '%check%'
              LOOP
                  EXECUTE 'ALTER TABLE public.access_requests DROP CONSTRAINT ' || quote_ident(r.constraint_name);
              END LOOP;
              UPDATE public.access_requests SET requested_role = 'user' WHERE requested_role = 'intern';
              ALTER TABLE public.access_requests ADD CONSTRAINT access_requests_requested_role_check CHECK (requested_role IN ('guest', 'user', 'admin'));
          END IF;
      END $$;

      -- Uploader By tracking field migrations
      ALTER TABLE public.motors ADD COLUMN IF NOT EXISTS uploaded_by VARCHAR(255);
      ALTER TABLE public.motor_test_runs ADD COLUMN IF NOT EXISTS uploaded_by VARCHAR(255);

      -- Add username column to user_profiles and populate defaults
      ALTER TABLE public.user_profiles ADD COLUMN IF NOT EXISTS username VARCHAR(255) UNIQUE;
      UPDATE public.user_profiles 
      SET username = split_part(email, '@', 1) || '_' || substring(id::text, 1, 4)
      WHERE username IS NULL;
    `);

    console.log('✅  AWS RDS PostgreSQL connection verified, system settings initialized, and migrations applied');

    // 2. Run SQLite guest database synchronization
    await syncPostgresToSqlite();

    // 3. Start Express server listener
    app.listen(PORT, '0.0.0.0', () => {
      console.log(`🚀  ThrustVault running on http://localhost:${PORT}`);
    });

  } catch (err) {
    console.error('❌  Server bootstrap / database initialization failed:', err.message);
    process.exit(1);
  }
}

bootstrap();
