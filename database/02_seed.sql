-- Create auth schema and users table
CREATE SCHEMA IF NOT EXISTS auth;

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

-- Seed default admin and user accounts in auth.users
INSERT INTO auth.users (id, email) VALUES
('f1211b85-9e5d-43c0-8d8a-409b5947a945', 'admindemo@thrustvault.in')
ON CONFLICT (id) DO NOTHING;

INSERT INTO auth.users (id, email) VALUES
('e801f624-0f7a-46c8-90c1-1dcadebb854e', 'userdemo@thrustvault.in')
ON CONFLICT (id) DO NOTHING;

-- Seed default user_profiles
INSERT INTO public.user_profiles (id, email, role, password_hash, username) VALUES
('f1211b85-9e5d-43c0-8d8a-409b5947a945', 'admindemo@thrustvault.in', 'admin', '$2a$12$4VsTLjOR03RSsiPw8RtN/esF6hDk.4hvmkMfv6vNeSwqBZLAJ/uA2', 'admindemo'),
('e801f624-0f7a-46c8-90c1-1dcadebb854e', 'userdemo@thrustvault.in', 'user', '$2a$12$4VsTLjOR03RSsiPw8RtN/esF6hDk.4hvmkMfv6vNeSwqBZLAJ/uA2', 'userdemo')
ON CONFLICT (id) DO NOTHING;
