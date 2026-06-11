-- Migration: Fix User Deletion Cascade and Orphaned Profiles
-- Run this script in the Supabase SQL Editor to resolve user deletion bugs.

-- 1. Clean up orphaned user profiles (profiles that don't have a matching user in auth.users)
DELETE FROM public.user_profiles 
WHERE id NOT IN (SELECT id FROM auth.users);

-- 2. Clean up orphaned user onboarding records
DELETE FROM public.user_onboarding 
WHERE user_id NOT IN (SELECT id FROM auth.users);

-- 3. Recreate the foreign key constraints on public.user_profiles with ON DELETE CASCADE
ALTER TABLE public.user_profiles
    DROP CONSTRAINT IF EXISTS user_profiles_id_fkey;

ALTER TABLE public.user_profiles
    ADD CONSTRAINT user_profiles_id_fkey 
    FOREIGN KEY (id) 
    REFERENCES auth.users(id) 
    ON DELETE CASCADE;

-- 4. Recreate the foreign key constraints on public.user_onboarding with ON DELETE CASCADE
ALTER TABLE public.user_onboarding
    DROP CONSTRAINT IF EXISTS user_onboarding_user_id_fkey;

ALTER TABLE public.user_onboarding
    ADD CONSTRAINT user_onboarding_user_id_fkey 
    FOREIGN KEY (user_id) 
    REFERENCES auth.users(id) 
    ON DELETE CASCADE;

-- 5. Update delete_vault_user function to explicitly delete profile and onboarding records first
CREATE OR REPLACE FUNCTION public.delete_vault_user(user_id UUID) RETURNS VOID AS $$
BEGIN
    -- Verify the caller is an administrator
    IF NOT EXISTS (
        SELECT 1 FROM public.user_profiles 
        WHERE id = auth.uid() AND role = 'admin'
    ) THEN
        RAISE EXCEPTION 'Only administrators can delete user accounts.';
    END IF;

    -- Explicitly delete dependent onboarding and profiles
    DELETE FROM public.user_onboarding WHERE user_id = delete_vault_user.user_id;
    DELETE FROM public.user_profiles WHERE id = delete_vault_user.user_id;

    -- Delete the authentication user
    DELETE FROM auth.users WHERE id = delete_vault_user.user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
