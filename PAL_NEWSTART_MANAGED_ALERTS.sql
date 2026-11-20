-- Run ONCE in Supabase SQL Editor before deploying this release. Newstart only.
create table if not exists public.pal_ns_managed_alerts (
 id uuid primary key default gen_random_uuid(),
 tenant text not null default 'newstart' check (tenant = 'newstart'),
 title text not null check (length(title) between 1 and 180),
 description text not null default '',
 start_date date not null,
 recurrence text not null default 'One Time' check (recurrence in ('One Time','Weekly','Monthly')),
 last_completed_at timestamptz,
 last_completed_by text,
 created_at timestamptz not null default now(),
 created_by text,
 completed_at timestamptz,
 completed_by text
);
create index if not exists pal_ns_managed_alerts_tenant_start on public.pal_ns_managed_alerts(tenant,start_date);
alter table public.pal_ns_managed_alerts enable row level security;
revoke all on public.pal_ns_managed_alerts from anon, authenticated;
-- Backend uses the existing Supabase service role; never expose that key in the browser.

-- Safe upgrade for a table created by the earlier release.
alter table public.pal_ns_managed_alerts add column if not exists recurrence text not null default 'One Time';
alter table public.pal_ns_managed_alerts add column if not exists last_completed_at timestamptz;
alter table public.pal_ns_managed_alerts add column if not exists last_completed_by text;

-- Add Now: safely adds an immediate-activation flag to Newstart alerts only.
alter table public.pal_ns_managed_alerts add column if not exists activate_immediately boolean not null default false;
