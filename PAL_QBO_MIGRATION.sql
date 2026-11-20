-- Run in the existing PAL private Supabase project's SQL editor.
-- Service-role access ONLY. Never expose these tables to authenticated browser clients.
create table if not exists public.pal_qbo_connections (
 tenant text primary key check (tenant = 'born-again-air'),
 realm_id text unique,
 encrypted_realm_id text,
 encrypted_tokens text not null,
 updated_at timestamptz not null default now()
);
create table if not exists public.pal_qbo_oauth_states (
 state_hash text primary key,
 tenant text not null check (tenant = 'born-again-air'),
 clerk_user_id text not null,
 expires_at timestamptz not null,
 created_at timestamptz not null default now()
);
alter table public.pal_qbo_connections enable row level security;
alter table public.pal_qbo_oauth_states enable row level security;
revoke all on public.pal_qbo_connections from anon, authenticated;
revoke all on public.pal_qbo_oauth_states from anon, authenticated;
-- Supabase service_role bypasses RLS. No end-user RLS policies are created.

-- Upgrade existing BAA table without touching any accounting data.
alter table public.pal_qbo_connections add column if not exists encrypted_realm_id text;
-- Do not drop legacy realm_id until any previously connected rows have been migrated.
-- The application writes only encrypted_realm_id for all new connections.
-- Existing installs created realm_id NOT NULL; remove that legacy constraint so
-- newly authorized connections can store only encrypted_realm_id.
alter table public.pal_qbo_connections alter column realm_id drop not null;

-- Restricted, minimal Intuit API diagnostics. No tokens or QuickBooks content.
create table if not exists public.pal_qbo_error_logs (
 id bigint generated always as identity primary key,
 tenant text not null check (tenant = 'born-again-air'),
 category text not null check (category in ('oauth_token','oauth_callback','oauth_revoke','api_query','api_validation','api_syntax','network')),
 http_status integer check (http_status between 100 and 599),
 intuit_tid text check (intuit_tid ~ '^[a-zA-Z0-9_-]{1,128}$'),
 created_at timestamptz not null default now()
);
alter table public.pal_qbo_error_logs enable row level security;
revoke all on public.pal_qbo_error_logs from anon, authenticated;
create index if not exists pal_qbo_error_logs_created_at_idx on public.pal_qbo_error_logs (created_at desc);
-- Remove older diagnostics after 90 days with an operator-scheduled maintenance task.
