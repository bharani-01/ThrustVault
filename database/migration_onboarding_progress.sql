-- =========================================================================
-- MIGRATION: Add pages_progress JSONB column to user_onboarding
-- Tracks per-page tour completion as a JSON object, e.g.:
-- {
--   "admin_catalog": true,
--   "performance": true,
--   "audit_logs": false
-- }
-- Run this in the Supabase SQL Editor.
-- =========================================================================

-- Add pages_progress column if it doesn't already exist
ALTER TABLE public.user_onboarding
    ADD COLUMN IF NOT EXISTS pages_progress JSONB DEFAULT '{}'::jsonb NOT NULL;

-- =========================================================================
-- HELPER FUNCTION: Merge-upsert a single page slug into pages_progress
-- Usage: SELECT upsert_page_progress('<user_uuid>', '<slug>', true);
-- (The JS client uses the REST API directly; this function is optional
--  but handy for manual backfills from the SQL editor.)
-- =========================================================================
CREATE OR REPLACE FUNCTION public.upsert_page_progress(
    p_user_id UUID,
    p_slug TEXT,
    p_done BOOLEAN
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    INSERT INTO public.user_onboarding (user_id, pages_progress, updated_at)
    VALUES (p_user_id, jsonb_build_object(p_slug, p_done), now())
    ON CONFLICT (user_id) DO UPDATE
    SET pages_progress = user_onboarding.pages_progress || jsonb_build_object(p_slug, p_done),
        updated_at     = now();
END;
$$;

-- Grant execute to authenticated users (they can only affect their own rows via RLS)
GRANT EXECUTE ON FUNCTION public.upsert_page_progress(UUID, TEXT, BOOLEAN) TO authenticated;
