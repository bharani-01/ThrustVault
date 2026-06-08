-- =========================================================================
-- MOTOR PERFORMANCE ANALYTICS & CURVES EXTENSION MIGRATION
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
