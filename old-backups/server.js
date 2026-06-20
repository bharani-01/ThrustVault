'use strict';
require('dotenv').config();

const app = require('./src/app');
const pool = require('./src/config/db');

const PORT = parseInt(process.env.PORT || '8000', 10);

// Verify database connection and initialize settings/migrations before starting
pool.query(`
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
`).then(() => {
  console.log('✅  AWS RDS connection verified, system settings initialized, and migrations applied');
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀  ThrustVault running on http://localhost:${PORT}`);
  });
}).catch(err => {
  console.error('❌  Database connection / initialization failed:', err.message);
  process.exit(1);
});
