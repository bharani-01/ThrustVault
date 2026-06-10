-- Drone Motors Database Schema (PostgreSQL)

-- Categories (Thrust Levels)
CREATE TABLE IF NOT EXISTS categories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    description TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Motors
CREATE TABLE IF NOT EXISTS motors (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    category_id UUID REFERENCES categories(id) ON DELETE CASCADE,
    motor_name VARCHAR(255) NOT NULL,
    company VARCHAR(255) NOT NULL,
    max_thrust VARCHAR(100) NOT NULL,
    recommended_esc VARCHAR(255),
    recommended_propeller VARCHAR(255),
    link_motor TEXT,
    link_esc TEXT,
    link_propeller TEXT,
    custom_parameters JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Safe migration for existing setups
ALTER TABLE motors ADD COLUMN IF NOT EXISTS custom_parameters JSONB DEFAULT '{}'::jsonb;

-- Enforce URL constraints on reference links
ALTER TABLE public.motors 
    DROP CONSTRAINT IF EXISTS chk_link_motor,
    DROP CONSTRAINT IF EXISTS chk_link_esc,
    DROP CONSTRAINT IF EXISTS chk_link_propeller,
    ADD CONSTRAINT chk_link_motor CHECK (link_motor IS NULL OR link_motor = '' OR link_motor ~* '^https?://'),
    ADD CONSTRAINT chk_link_esc CHECK (link_esc IS NULL OR link_esc = '' OR link_esc ~* '^https?://'),
    ADD CONSTRAINT chk_link_propeller CHECK (link_propeller IS NULL OR link_propeller = '' OR link_propeller ~* '^https?://');



-- Remove deprecated password column if it exists in public.user_profiles
DO $$ 
BEGIN 
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'user_profiles') THEN
        ALTER TABLE public.user_profiles DROP COLUMN IF EXISTS password;
    END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.user_profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email VARCHAR(255) UNIQUE NOT NULL,
    role VARCHAR(50) NOT NULL CHECK (role IN ('guest', 'intern', 'admin')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Helper functions to check user roles securely without recursion
CREATE OR REPLACE FUNCTION public.check_is_admin()
RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM public.user_profiles
        WHERE id = auth.uid() AND role = 'admin'
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.get_my_role()
RETURNS VARCHAR AS $$
DECLARE
    user_role VARCHAR;
BEGIN
    SELECT role INTO user_role FROM public.user_profiles WHERE id = auth.uid();
    RETURN user_role;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Indexing for performance
CREATE INDEX IF NOT EXISTS idx_motors_category_id ON motors(category_id);
CREATE INDEX IF NOT EXISTS idx_motors_company ON motors(company);
CREATE INDEX IF NOT EXISTS idx_motors_name_search ON motors USING gin (to_tsvector('english', motor_name));

-- Row Level Security (RLS) Setup
ALTER TABLE categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE motors ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist (clean setup)
DROP POLICY IF EXISTS "Allow public read access on categories" ON categories;
DROP POLICY IF EXISTS "Allow public insert on categories" ON categories;
DROP POLICY IF EXISTS "Allow public update on categories" ON categories;
DROP POLICY IF EXISTS "Allow public delete on categories" ON categories;
DROP POLICY IF EXISTS "Allow select for authenticated users" ON categories;
DROP POLICY IF EXISTS "Allow insert for admin and intern" ON categories;
DROP POLICY IF EXISTS "Allow update for admin and intern" ON categories;
DROP POLICY IF EXISTS "Allow delete for admin and intern" ON categories;

DROP POLICY IF EXISTS "Allow public read access on motors" ON motors;
DROP POLICY IF EXISTS "Allow public insert on motors" ON motors;
DROP POLICY IF EXISTS "Allow public update on motors" ON motors;
DROP POLICY IF EXISTS "Allow public delete on motors" ON motors;
DROP POLICY IF EXISTS "Allow select for authenticated users" ON motors;
DROP POLICY IF EXISTS "Allow insert for admin and intern" ON motors;
DROP POLICY IF EXISTS "Allow update for admin and intern" ON motors;
DROP POLICY IF EXISTS "Allow delete for admin and intern" ON motors;

DROP POLICY IF EXISTS "Allow public select on user_profiles" ON public.user_profiles;
DROP POLICY IF EXISTS "Allow select on user_profiles" ON public.user_profiles;
DROP POLICY IF EXISTS "Allow admins to update user_profiles" ON public.user_profiles;

-- Allow select access only to logged-in users with a profile
CREATE POLICY "Allow select for authenticated users" ON categories 
    FOR SELECT USING (auth.uid() IS NOT NULL);

-- Allow write access (insert/update/delete) only to admin and intern roles
CREATE POLICY "Allow insert for admin and intern" ON categories 
    FOR INSERT WITH CHECK (public.get_my_role() IN ('admin', 'intern'));

CREATE POLICY "Allow update for admin and intern" ON categories 
    FOR UPDATE USING (public.get_my_role() IN ('admin', 'intern'));

CREATE POLICY "Allow delete for admin and intern" ON categories 
    FOR DELETE USING (public.get_my_role() IN ('admin', 'intern'));

-- Allow select access only to logged-in users with a profile
CREATE POLICY "Allow select for authenticated users" ON motors 
    FOR SELECT USING (auth.uid() IS NOT NULL);

-- Allow write access (insert/update/delete) only to admin and intern roles
CREATE POLICY "Allow insert for admin and intern" ON motors 
    FOR INSERT WITH CHECK (public.get_my_role() IN ('admin', 'intern'));

CREATE POLICY "Allow update for admin and intern" ON motors 
    FOR UPDATE USING (public.get_my_role() IN ('admin', 'intern'));

CREATE POLICY "Allow delete for admin and intern" ON motors 
    FOR DELETE USING (public.get_my_role() IN ('admin', 'intern'));

-- Allow users to view their own profile, or admins to view all profiles
CREATE POLICY "Allow select on user_profiles" ON public.user_profiles 
    FOR SELECT USING (
        auth.uid() = id 
        OR public.check_is_admin()
    );

-- Allow admins to update roles directly
CREATE POLICY "Allow admins to update user_profiles" ON public.user_profiles 
    FOR UPDATE USING (public.check_is_admin());

-- Functions to auto-update 'updated_at' columns
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ language 'plpgsql';

DROP TRIGGER IF EXISTS update_categories_updated_at ON categories;
CREATE TRIGGER update_categories_updated_at BEFORE UPDATE ON categories FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();

DROP TRIGGER IF EXISTS update_motors_updated_at ON motors;
CREATE TRIGGER update_motors_updated_at BEFORE UPDATE ON motors FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();

-- Enable pgcrypto for password hashing in auth.users
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Secure function to create users in auth.users from client-side JS (Runs with security definer privileges)
CREATE OR REPLACE FUNCTION public.create_vault_user(
    email_val TEXT,
    password_val TEXT,
    role_val TEXT
) RETURNS UUID AS $$
DECLARE
    new_uid UUID;
BEGIN
    -- Check if creator is admin (skip check if database has no admin users yet, e.g. during seeding)
    IF EXISTS (SELECT 1 FROM public.user_profiles WHERE role = 'admin') THEN
        IF NOT EXISTS (
            SELECT 1 FROM public.user_profiles 
            WHERE id = auth.uid() AND role = 'admin'
        ) THEN
            RAISE EXCEPTION 'Only administrators can create user accounts.';
        END IF;
    END IF;

    -- Generate user ID
    new_uid := gen_random_uuid();

    -- Insert user into auth.users (Supabase System Table)
    INSERT INTO auth.users (
        instance_id, id, aud, role, email, encrypted_password, 
        email_confirmed_at, recovery_sent_at, last_sign_in_at, 
        raw_app_meta_data, raw_user_meta_data, created_at, updated_at, 
        confirmation_token, email_change, email_change_token_new, recovery_token
    )
    VALUES (
        '00000000-0000-0000-0000-000000000000',
        new_uid,
        'authenticated',
        'authenticated',
        email_val,
        crypt(password_val, gen_salt('bf')),
        now(),
        now(),
        now(),
        '{"provider":"email","providers":["email"]}',
        json_build_object('role', role_val),
        now(),
        now(),
        '',
        '',
        '',
        ''
    );

    -- Insert into public profiles (handled by trigger, but updated here to ensure consistency)
    INSERT INTO public.user_profiles (id, email, role)
    VALUES (new_uid, email_val, role_val)
    ON CONFLICT (id) DO UPDATE SET email = EXCLUDED.email, role = EXCLUDED.role;

    RETURN new_uid;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Secure function to delete users in auth.users (Runs with security definer privileges)
CREATE OR REPLACE FUNCTION public.delete_vault_user(user_id UUID) RETURNS VOID AS $$
BEGIN
    -- Verify the caller is an administrator
    IF NOT EXISTS (
        SELECT 1 FROM public.user_profiles 
        WHERE id = auth.uid() AND role = 'admin'
    ) THEN
        RAISE EXCEPTION 'Only administrators can delete user accounts.';
    END IF;

    -- Delete from auth.users (will cascade delete from public.user_profiles)
    DELETE FROM auth.users WHERE id = user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Database cleanup helper function for the python seeder script
CREATE OR REPLACE FUNCTION public.cleanup_vault_users() RETURNS VOID AS $$
BEGIN
    DELETE FROM auth.users WHERE id IS NOT NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to automatically create a profile in public.user_profiles for new auth.users
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    -- Delete any existing profile with the same email or ID to prevent conflicts
    DELETE FROM public.user_profiles WHERE email = NEW.email OR id = NEW.id;

    INSERT INTO public.user_profiles (id, email, role)
    VALUES (
        NEW.id,
        NEW.email,
        COALESCE(NEW.raw_user_meta_data->>'role', 'guest')
    );
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger binding
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();


-- =========================================================================
-- MOTOR PERFORMANCE ANALYTICS & CURVES EXTENSION
-- =========================================================================

-- Create motor_test_runs Table
CREATE TABLE IF NOT EXISTS public.motor_test_runs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    motor_id UUID REFERENCES public.motors(id) ON DELETE CASCADE NOT NULL,
    propeller_model VARCHAR(255) NOT NULL,
    esc_model VARCHAR(255),
    battery_info VARCHAR(255),
    test_conducted_by VARCHAR(255),
    tested_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Create motor_test_data_points Table
CREATE TABLE IF NOT EXISTS public.motor_test_data_points (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    test_run_id UUID REFERENCES public.motor_test_runs(id) ON DELETE CASCADE NOT NULL,
    throttle NUMERIC NOT NULL,
    voltage NUMERIC,
    current NUMERIC,
    power NUMERIC,
    thrust_g NUMERIC NOT NULL,
    rpm NUMERIC,
    efficiency NUMERIC,
    temperature NUMERIC,
    extra_data JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Enable indexing for performance
CREATE INDEX IF NOT EXISTS idx_motor_test_runs_motor_id ON public.motor_test_runs(motor_id);
CREATE INDEX IF NOT EXISTS idx_motor_test_data_points_run_id ON public.motor_test_data_points(test_run_id);

-- Enable RLS
ALTER TABLE public.motor_test_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.motor_test_data_points ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if any
DROP POLICY IF EXISTS "Allow select for authenticated users" ON public.motor_test_runs;
DROP POLICY IF EXISTS "Allow select for authenticated users" ON public.motor_test_data_points;
DROP POLICY IF EXISTS "Allow write for admins and interns" ON public.motor_test_runs;
DROP POLICY IF EXISTS "Allow write for admins and interns" ON public.motor_test_data_points;

-- Create Policies
CREATE POLICY "Allow select for authenticated users" ON public.motor_test_runs 
    FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY "Allow select for authenticated users" ON public.motor_test_data_points 
    FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY "Allow write for admins and interns" ON public.motor_test_runs 
    FOR ALL USING (public.get_my_role() IN ('admin', 'intern'));

CREATE POLICY "Allow write for admins and interns" ON public.motor_test_data_points 
    FOR ALL USING (public.get_my_role() IN ('admin', 'intern'));


-- =========================================================================
-- DYNAMIC SPEC SCHEMA CUSTOMIZER EXTENSION
-- =========================================================================

-- Create custom_specs_schema Table
CREATE TABLE IF NOT EXISTS public.custom_specs_schema (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    field_key VARCHAR(100) UNIQUE NOT NULL,
    field_name VARCHAR(255) NOT NULL,
    field_type VARCHAR(50) DEFAULT 'text' CHECK (field_type IN ('text', 'number', 'boolean')),
    field_unit VARCHAR(50),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Enable RLS
ALTER TABLE public.custom_specs_schema ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if any
DROP POLICY IF EXISTS "Allow select for authenticated users" ON public.custom_specs_schema;
DROP POLICY IF EXISTS "Allow write for admins" ON public.custom_specs_schema;

-- Create Policies
CREATE POLICY "Allow select for authenticated users" ON public.custom_specs_schema 
    FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY "Allow write for admins" ON public.custom_specs_schema 
    FOR ALL USING (public.get_my_role() = 'admin');



