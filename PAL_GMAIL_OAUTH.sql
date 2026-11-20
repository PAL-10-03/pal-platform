-- Gmail sender OAuth: server-side only. Run once in PAL Supabase SQL Editor.
CREATE TABLE IF NOT EXISTS public.pal_gmail_oauth_states (
 state_hash TEXT PRIMARY KEY,
 expires_at TIMESTAMPTZ NOT NULL
);
CREATE TABLE IF NOT EXISTS public.pal_gmail_connections (
 connection_name TEXT PRIMARY KEY,
 email TEXT NOT NULL,
 encrypted_refresh_token TEXT NOT NULL,
 updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.pal_gmail_oauth_states ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pal_gmail_connections ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.pal_gmail_oauth_states FROM anon, authenticated;
REVOKE ALL ON public.pal_gmail_connections FROM anon, authenticated;
