-- =========================================================================
-- USER ONBOARDING STATUS TABLE AND RLS POLICIES
-- =========================================================================

-- Create user_onboarding Table
CREATE TABLE IF NOT EXISTS public.user_onboarding (
    user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    tour_completed BOOLEAN DEFAULT FALSE NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Enable Row Level Security (RLS)
ALTER TABLE public.user_onboarding ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if any
DROP POLICY IF EXISTS "Allow select for own onboarding status" ON public.user_onboarding;
DROP POLICY IF EXISTS "Allow insert/update for own onboarding status" ON public.user_onboarding;
DROP POLICY IF EXISTS "Allow insert for own onboarding status" ON public.user_onboarding;
DROP POLICY IF EXISTS "Allow update for own onboarding status" ON public.user_onboarding;

-- Create Policies
-- Allow users to view their own onboarding status
CREATE POLICY "Allow select for own onboarding status" ON public.user_onboarding
    FOR SELECT USING (auth.uid() = user_id);

-- Allow users to insert their own onboarding status
CREATE POLICY "Allow insert for own onboarding status" ON public.user_onboarding
    FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Allow users to update their own onboarding status
CREATE POLICY "Allow update for own onboarding status" ON public.user_onboarding
    FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Bind update trigger for updated_at column
DROP TRIGGER IF EXISTS update_user_onboarding_updated_at ON public.user_onboarding;
CREATE TRIGGER update_user_onboarding_updated_at BEFORE UPDATE ON public.user_onboarding FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();
