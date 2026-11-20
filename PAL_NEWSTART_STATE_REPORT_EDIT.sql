-- Newstart State Report corrections. Run once in Supabase SQL Editor.
-- Does not touch Born Again Air.
ALTER TABLE public.pal_ns_maintenance ADD COLUMN IF NOT EXISTS report_excluded boolean NOT NULL DEFAULT false;
CREATE TABLE IF NOT EXISTS public.pal_ns_report_edit_audit (id uuid PRIMARY KEY DEFAULT gen_random_uuid(),tenant text NOT NULL DEFAULT 'newstart' CHECK (tenant='newstart'),maintenance_id uuid NOT NULL,action text NOT NULL CHECK(action IN ('edit','remove_from_report')),actor text NOT NULL,before_record jsonb NOT NULL,after_record jsonb,created_at timestamptz NOT NULL DEFAULT now());
ALTER TABLE public.pal_ns_report_edit_audit ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.pal_ns_report_edit_audit FROM anon,authenticated;
