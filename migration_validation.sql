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
