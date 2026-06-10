-- =========================================================================
-- SERVER-SIDE DATA INTEGRITY AND SECURITY VALIDATION MIGRATION
-- =========================================================================

-- 1. Enforce validation constraints on the categories table
-- Check that category name is not empty or pure whitespace
ALTER TABLE public.categories 
    DROP CONSTRAINT IF EXISTS chk_category_name,
    ADD CONSTRAINT chk_category_name CHECK (char_length(trim(name)) > 0);

-- 2. Enforce validation constraints on the motors table
-- Check that motor name, company/manufacturer, and max thrust strings are not empty
ALTER TABLE public.motors 
    DROP CONSTRAINT IF EXISTS chk_motor_name,
    DROP CONSTRAINT IF EXISTS chk_company,
    DROP CONSTRAINT IF EXISTS chk_max_thrust,
    ADD CONSTRAINT chk_motor_name CHECK (char_length(trim(motor_name)) > 0),
    ADD CONSTRAINT chk_company CHECK (char_length(trim(company)) > 0),
    ADD CONSTRAINT chk_max_thrust CHECK (char_length(trim(max_thrust)) > 0);

-- 3. Enforce validation constraints on the motor_test_runs table
-- Check that propeller model is not empty
ALTER TABLE public.motor_test_runs 
    DROP CONSTRAINT IF EXISTS chk_propeller_model,
    ADD CONSTRAINT chk_propeller_model CHECK (char_length(trim(propeller_model)) > 0);

-- 4. Enforce validation constraints on the motor_test_data_points table
-- Check ranges and logical bounds for physical telemetry parameters
ALTER TABLE public.motor_test_data_points 
    DROP CONSTRAINT IF EXISTS chk_throttle_range,
    DROP CONSTRAINT IF EXISTS chk_positive_voltage,
    DROP CONSTRAINT IF EXISTS chk_positive_current,
    DROP CONSTRAINT IF EXISTS chk_positive_power,
    DROP CONSTRAINT IF EXISTS chk_positive_thrust,
    DROP CONSTRAINT IF EXISTS chk_positive_rpm,
    DROP CONSTRAINT IF EXISTS chk_positive_efficiency,
    ADD CONSTRAINT chk_throttle_range CHECK (throttle >= 0 AND throttle <= 100),
    ADD CONSTRAINT chk_positive_voltage CHECK (voltage >= 0),
    ADD CONSTRAINT chk_positive_current CHECK (current >= 0),
    ADD CONSTRAINT chk_positive_power CHECK (power >= 0),
    ADD CONSTRAINT chk_positive_thrust CHECK (thrust_g >= 0),
    ADD CONSTRAINT chk_positive_rpm CHECK (rpm >= 0),
    ADD CONSTRAINT chk_positive_efficiency CHECK (efficiency >= 0);

-- 5. Enforce URL constraints on the motors table
-- Validate that reference links start with http:// or https:// (or are empty/null)
ALTER TABLE public.motors 
    DROP CONSTRAINT IF EXISTS chk_link_motor,
    DROP CONSTRAINT IF EXISTS chk_link_esc,
    DROP CONSTRAINT IF EXISTS chk_link_propeller,
    ADD CONSTRAINT chk_link_motor CHECK (link_motor IS NULL OR link_motor = '' OR link_motor ~* '^https?://'),
    ADD CONSTRAINT chk_link_esc CHECK (link_esc IS NULL OR link_esc = '' OR link_esc ~* '^https?://'),
    ADD CONSTRAINT chk_link_propeller CHECK (link_propeller IS NULL OR link_propeller = '' OR link_propeller ~* '^https?://');

