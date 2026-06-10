-- =========================================================================
-- SECURE AUDIT LOGGING DATABASE SCHEMA
-- Execute this script in the SQL Editor of your SECONDARY Supabase database.
-- =========================================================================

-- 1. Create audit_logs Table
CREATE TABLE IF NOT EXISTS public.audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    email VARCHAR(255) NOT NULL,
    role VARCHAR(50) NOT NULL,
    route TEXT NOT NULL,
    method VARCHAR(10) NOT NULL,
    status INTEGER NOT NULL,
    ip_address VARCHAR(100),
    user_agent TEXT,
    location VARCHAR(255),
    risk_level VARCHAR(50) DEFAULT 'info' CHECK (risk_level IN ('info', 'warning', 'suspicious')),
    details TEXT
);

-- Indexing for fast search and filtering
CREATE INDEX IF NOT EXISTS idx_audit_logs_timestamp ON public.audit_logs(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_email ON public.audit_logs(email);
CREATE INDEX IF NOT EXISTS idx_audit_logs_risk_level ON public.audit_logs(risk_level);

-- 2. Enable Row Level Security (RLS)
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- 3. Create RLS Policies
-- Flask backend accesses the database using the Anon Key. Since these keys are 
-- kept server-side only and never exposed to the browser, we can allow full access.
DROP POLICY IF EXISTS "Allow anon access" ON public.audit_logs;
CREATE POLICY "Allow anon access" ON public.audit_logs 
    FOR ALL USING (true) WITH CHECK (true);

-- 4. Auto-Pruning Trigger (Keeps last 30 days of logs)
CREATE OR REPLACE FUNCTION public.prune_old_audit_logs() 
RETURNS TRIGGER AS $$
BEGIN
    DELETE FROM public.audit_logs WHERE timestamp < (NOW() - INTERVAL '30 days');
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trigger_prune_audit_logs ON public.audit_logs;
CREATE TRIGGER trigger_prune_audit_logs
    AFTER INSERT ON public.audit_logs
    FOR EACH ROW
    EXECUTE FUNCTION public.prune_old_audit_logs();
