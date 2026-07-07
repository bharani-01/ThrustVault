-- =========================================================================
-- PURE POSTGRESQL AUTH MIGRATION
-- Replaces AWS Cognito with bcrypt password hashes stored in user_profiles
-- =========================================================================

-- Add password_hash and username columns to user_profiles
ALTER TABLE public.user_profiles ADD COLUMN IF NOT EXISTS password_hash TEXT;
ALTER TABLE public.user_profiles ADD COLUMN IF NOT EXISTS username VARCHAR(255);

-- Ensure the role check constraint supports guest, user, and admin
ALTER TABLE public.user_profiles DROP CONSTRAINT IF EXISTS user_profiles_role_check;
ALTER TABLE public.user_profiles ADD CONSTRAINT user_profiles_role_check CHECK (role IN ('guest', 'user', 'admin'));

-- Password reset OTP tokens table
CREATE TABLE IF NOT EXISTS public.password_reset_tokens (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email       VARCHAR(255) NOT NULL,
    token       VARCHAR(6)   NOT NULL,
    expires_at  TIMESTAMP WITH TIME ZONE NOT NULL,
    used        BOOLEAN DEFAULT FALSE NOT NULL,
    created_at  TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_prt_email ON public.password_reset_tokens(email);

-- Auto-expire: clean up tokens older than 1 hour on each insert
CREATE OR REPLACE FUNCTION public.cleanup_expired_reset_tokens()
RETURNS TRIGGER AS $$
BEGIN
    DELETE FROM public.password_reset_tokens
    WHERE expires_at < NOW() OR used = TRUE;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_cleanup_reset_tokens ON public.password_reset_tokens;
CREATE TRIGGER trg_cleanup_reset_tokens
    AFTER INSERT ON public.password_reset_tokens
    FOR EACH STATEMENT EXECUTE FUNCTION public.cleanup_expired_reset_tokens();
