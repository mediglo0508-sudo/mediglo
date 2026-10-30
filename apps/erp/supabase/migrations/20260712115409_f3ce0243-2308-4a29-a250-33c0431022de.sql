-- =========================================================
-- Clinic Operating System (COS) additive extension layer
-- Fully idempotent. Does NOT alter existing tables.
-- =========================================================

-- 1. TABLES ------------------------------------------------

CREATE TABLE IF NOT EXISTS public.cos_appointments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    branch_id UUID NOT NULL,
    patient_id UUID NOT NULL,
    doctor_id UUID NOT NULL,
    counsellor_id UUID,
    room_id UUID,
    appointment_date DATE NOT NULL,
    start_time TIME NOT NULL,
    end_time TIME NOT NULL,
    patient_concern TEXT,
    discussion_notes TEXT,
    followup_details TEXT,
    offer_applied_id UUID,
    status VARCHAR(50) DEFAULT 'Booked',
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.cos_treatment_packages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    invoice_id UUID UNIQUE,
    patient_id UUID NOT NULL,
    package_name VARCHAR(255) NOT NULL,
    total_sessions INT NOT NULL,
    sessions_completed INT DEFAULT 0,
    outstanding_balance NUMERIC(15, 2) DEFAULT 0.00,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.cos_scheduled_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    package_id UUID REFERENCES public.cos_treatment_packages(id) ON DELETE CASCADE,
    patient_id UUID NOT NULL,
    session_number INT NOT NULL,
    scheduled_date DATE NOT NULL,
    gap_days_applied INT NOT NULL,
    status VARCHAR(50) DEFAULT 'Pending',
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.cos_service_gap_rules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    service_id UUID UNIQUE NOT NULL,
    service_name VARCHAR(255) NOT NULL,
    default_gap_days INT DEFAULT 20,
    custom_gap_days INT NOT NULL,
    updated_by UUID,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.cos_room_assets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    room_identifier VARCHAR(100) NOT NULL,
    assigned_treatments TEXT[],
    equipment_status VARCHAR(50) DEFAULT 'Available',
    branch_id UUID NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.cos_notifications_hub (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    target_role VARCHAR(50) NOT NULL,
    notification_type VARCHAR(100) NOT NULL,
    title VARCHAR(255) NOT NULL,
    message TEXT NOT NULL,
    is_read BOOLEAN DEFAULT FALSE,
    action_url VARCHAR(255),
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- 2. GRANTS (required for Data API access) -----------------

GRANT SELECT, INSERT, UPDATE, DELETE ON public.cos_appointments TO authenticated;
GRANT ALL ON public.cos_appointments TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.cos_treatment_packages TO authenticated;
GRANT ALL ON public.cos_treatment_packages TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.cos_scheduled_sessions TO authenticated;
GRANT ALL ON public.cos_scheduled_sessions TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.cos_service_gap_rules TO authenticated;
GRANT ALL ON public.cos_service_gap_rules TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.cos_room_assets TO authenticated;
GRANT ALL ON public.cos_room_assets TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.cos_notifications_hub TO authenticated;
GRANT ALL ON public.cos_notifications_hub TO service_role;

-- 3. INDEXES -----------------------------------------------

CREATE INDEX IF NOT EXISTS idx_cos_appointments_lookup ON public.cos_appointments (branch_id, appointment_date, start_time, doctor_id, room_id);
CREATE INDEX IF NOT EXISTS idx_cos_sessions_cascade ON public.cos_scheduled_sessions (package_id, scheduled_date);
CREATE INDEX IF NOT EXISTS idx_cos_notifications_role ON public.cos_notifications_hub (target_role, is_read);

-- 4. ROW LEVEL SECURITY ------------------------------------

ALTER TABLE public.cos_appointments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cos_treatment_packages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cos_scheduled_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cos_service_gap_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cos_room_assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cos_notifications_hub ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS cos_appointments_auth_access ON public.cos_appointments;
CREATE POLICY cos_appointments_auth_access ON public.cos_appointments FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS cos_packages_auth_access ON public.cos_treatment_packages;
CREATE POLICY cos_packages_auth_access ON public.cos_treatment_packages FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS cos_sessions_auth_access ON public.cos_scheduled_sessions;
CREATE POLICY cos_sessions_auth_access ON public.cos_scheduled_sessions FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS cos_gap_rules_auth_access ON public.cos_service_gap_rules;
CREATE POLICY cos_gap_rules_auth_access ON public.cos_service_gap_rules FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS cos_room_assets_auth_access ON public.cos_room_assets;
CREATE POLICY cos_room_assets_auth_access ON public.cos_room_assets FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS cos_notifications_auth_access ON public.cos_notifications_hub;
CREATE POLICY cos_notifications_auth_access ON public.cos_notifications_hub FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- 5. updated_at TRIGGERS (reuse existing helper) -----------

DROP TRIGGER IF EXISTS trg_cos_appointments_updated_at ON public.cos_appointments;
CREATE TRIGGER trg_cos_appointments_updated_at BEFORE UPDATE ON public.cos_appointments FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS trg_cos_scheduled_sessions_updated_at ON public.cos_scheduled_sessions;
CREATE TRIGGER trg_cos_scheduled_sessions_updated_at BEFORE UPDATE ON public.cos_scheduled_sessions FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS trg_cos_service_gap_rules_updated_at ON public.cos_service_gap_rules;
CREATE TRIGGER trg_cos_service_gap_rules_updated_at BEFORE UPDATE ON public.cos_service_gap_rules FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();