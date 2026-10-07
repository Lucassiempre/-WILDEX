create table if not exists public.beta_testers (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  consented boolean not null default false,
  created_at timestamptz not null default now(),
  constraint beta_testers_email_lowercase check (email = lower(email)),
  constraint beta_testers_email_length check (length(email) between 3 and 254),
  constraint beta_testers_consent_required check (consented is true),
  constraint beta_testers_email_unique unique (email)
);

alter table public.beta_testers enable row level security;

revoke all on table public.beta_testers from public;
revoke all on table public.beta_testers from anon, authenticated;
