-- Run this once in Supabase SQL Editor before deploying the Add Now update.
-- Newstart alerts only; no BAA tables or policies are changed.
ALTER TABLE public.pal_ns_managed_alerts
ADD COLUMN IF NOT EXISTS activate_immediately BOOLEAN NOT NULL DEFAULT FALSE;
