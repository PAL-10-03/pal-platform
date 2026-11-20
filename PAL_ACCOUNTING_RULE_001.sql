-- Apply once in Supabase SQL Editor. Service-role only. No QBO changes.
CREATE TABLE IF NOT EXISTS public.pal_accounting_rules (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant TEXT NOT NULL CHECK (tenant IN ('born-again-air','newstart')),
 merchant_pattern TEXT NOT NULL,
 category TEXT NOT NULL,
 qbo_account_id TEXT NOT NULL,
 conditions TEXT NOT NULL DEFAULT '',
 approved_by TEXT NOT NULL,
 approved_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 active BOOLEAN NOT NULL DEFAULT true
);
CREATE INDEX IF NOT EXISTS pal_accounting_rules_tenant_idx ON public.pal_accounting_rules(tenant,active);
ALTER TABLE public.pal_accounting_rules ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.pal_accounting_rules FROM anon, authenticated;
-- Dispatch ledger prevents customer resend when the owner copy fails.
CREATE TABLE IF NOT EXISTS public.pal_ceo_email_dispatch (
 tenant TEXT NOT NULL CHECK (tenant IN ('born-again-air','newstart')),
 dispatch_key TEXT NOT NULL,
 customer_name TEXT NOT NULL,
 customer_email TEXT NOT NULL,
 owner_email TEXT NOT NULL,
 customer_sent_at TIMESTAMPTZ,
 owner_copy_sent_at TIMESTAMPTZ,
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 PRIMARY KEY (tenant,dispatch_key)
);
ALTER TABLE public.pal_ceo_email_dispatch ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.pal_ceo_email_dispatch FROM anon, authenticated;
