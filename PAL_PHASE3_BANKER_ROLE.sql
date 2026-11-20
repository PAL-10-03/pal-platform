-- Phase 3: Banker replaces the legacy reconciler job role.
-- Apply ONLY together with the updated PAL backend deployment.
-- Confirmed no rows in pal_automation_jobs on 2026-10-30.
BEGIN;
DO $$
BEGIN
 IF EXISTS (SELECT 1 FROM public.pal_automation_jobs WHERE role = 'reconciler') THEN
   RAISE EXCEPTION 'Legacy reconciler jobs exist: stop and migrate them before changing the constraint';
 END IF;
END $$;
ALTER TABLE public.pal_automation_jobs DROP CONSTRAINT IF EXISTS pal_automation_jobs_role_check;
ALTER TABLE public.pal_automation_jobs ADD CONSTRAINT pal_automation_jobs_role_check
CHECK (role = ANY (ARRAY['ceo','reader','bookkeeper','banker','sales','negotiator','reporter','cleanup']));
COMMIT;
