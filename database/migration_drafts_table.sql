-- Create draft_test_runs Table
CREATE TABLE IF NOT EXISTS public.draft_test_runs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    motor_model VARCHAR(255) NOT NULL,
    propeller_model VARCHAR(255),
    esc_model VARCHAR(255),
    battery_info VARCHAR(255),
    test_conducted_by VARCHAR(255),
    tested_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    data_points JSONB DEFAULT '[]'::jsonb NOT NULL
);

-- Enable RLS
ALTER TABLE public.draft_test_runs ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if any
DROP POLICY IF EXISTS "Allow select for authenticated users" ON public.draft_test_runs;
DROP POLICY IF EXISTS "Allow write for admins and interns" ON public.draft_test_runs;

-- Create policies
CREATE POLICY "Allow select for authenticated users" ON public.draft_test_runs 
    FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY "Allow write for admins and interns" ON public.draft_test_runs 
    FOR ALL USING (public.get_my_role() IN ('admin', 'intern'));
