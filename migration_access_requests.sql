-- =========================================================================
-- ACCESS REQUESTS & WORKFLOW MIGRATION
-- =========================================================================

-- Create access_requests Table
CREATE TABLE IF NOT EXISTS public.access_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    full_name VARCHAR(255) NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    requested_role VARCHAR(50) NOT NULL CHECK (requested_role IN ('guest', 'intern', 'admin')),
    justification TEXT,
    status VARCHAR(50) DEFAULT 'pending' NOT NULL CHECK (status IN ('pending', 'approved', 'rejected')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Enable Row Level Security (RLS)
ALTER TABLE public.access_requests ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if any
DROP POLICY IF EXISTS "Allow public insert on access_requests" ON public.access_requests;
DROP POLICY IF EXISTS "Allow admins all on access_requests" ON public.access_requests;

-- Create Policies
-- 1. Allow anyone (public/anonymous) to submit an access request
CREATE POLICY "Allow public insert on access_requests" ON public.access_requests 
    FOR INSERT WITH CHECK (true);

-- 2. Allow only administrators to view, update, or delete access requests
CREATE POLICY "Allow admins all on access_requests" ON public.access_requests 
    FOR ALL USING (public.check_is_admin());

-- Bind update trigger for updated_at column
DROP TRIGGER IF EXISTS update_access_requests_updated_at ON public.access_requests;
CREATE TRIGGER update_access_requests_updated_at BEFORE UPDATE ON public.access_requests FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();
