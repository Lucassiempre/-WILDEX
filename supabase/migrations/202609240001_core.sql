create schema if not exists private;

revoke all on schema private from public, anon, authenticated;
alter default privileges in schema private
  revoke execute on functions from public, anon, authenticated;

create table public.species (
  id text primary key,
  common_name text not null,
  scientific_name text not null,
  category text not null,
  exploration text not null check (exploration in ('urbana', 'silvestre', 'ambas')),
  exploration_types text[] not null default '{}',
  description text not null,
  habitat text not null,
  diet text not null,
  curiosity text not null,
  image_url text not null,
  source_url text not null,
  science_source_url text,
  conservation_status text,
  rarity text not null check (rarity in ('comun', 'notable', 'especial')),
  regions text[] not null default '{}',
  distribution text,
  where_to_find text,
  fun_facts text[] not null default '{}',
  keywords text[] not null default '{}',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.species_variants (
  species_id text not null references public.species(id) on update cascade on delete cascade,
  id text not null,
  name text not null,
  kind text not null check (kind in ('raza', 'tipo', 'color', 'patron')),
  description text,
  image_url text,
  source_url text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (species_id, id)
);

create table public.thematic_collections (
  id text primary key,
  title text not null,
  description text not null,
  progress_mode text not null check (progress_mode in ('species', 'variants')),
  variant_species_id text references public.species(id) on update cascade on delete restrict,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.thematic_collection_species (
  collection_id text not null references public.thematic_collections(id) on update cascade on delete cascade,
  species_id text not null references public.species(id) on update cascade on delete restrict,
  position integer not null check (position >= 0),
  primary key (collection_id, species_id),
  unique (collection_id, position)
);

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text,
  display_name text,
  bio text,
  avatar_config jsonb not null default '{}'::jsonb check (jsonb_typeof(avatar_config) = 'object'),
  favorite_species_id text references public.species(id) on update cascade on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index profiles_username_lower_key
  on public.profiles (lower(username))
  where username is not null;

create table public.observations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  species_id text not null references public.species(id) on update cascade on delete restrict,
  variant_id text,
  observed_at timestamptz not null default now(),
  identification_method text not null check (
    identification_method in ('demo-manual', 'demo-filename', 'legacy', 'model')
  ),
  species_confidence double precision check (species_confidence between 0 and 1),
  variant_confidence double precision check (variant_confidence between 0 and 1),
  notes text,
  custom_name text,
  photo_path text,
  photo_mime_type text,
  photo_size_bytes bigint check (photo_size_bytes is null or photo_size_bytes >= 0),
  photo_sha256 text check (photo_sha256 is null or photo_sha256 ~ '^[0-9a-f]{64}$'),
  client_created_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  check (photo_path is null or photo_path like user_id::text || '/%'),
  unique (user_id, id),
  foreign key (species_id, variant_id)
    references public.species_variants(species_id, id)
    on update cascade
    on delete restrict
);

create index observations_user_observed_at_idx
  on public.observations (user_id, observed_at desc)
  where deleted_at is null;

create index observations_user_species_idx
  on public.observations (user_id, species_id)
  where deleted_at is null;

-- Enable RLS as soon as tables exist. Policies and grants are added only after
-- all schema and seed migrations complete.
alter table public.species enable row level security;
alter table public.species_variants enable row level security;
alter table public.thematic_collections enable row level security;
alter table public.thematic_collection_species enable row level security;
alter table public.profiles enable row level security;
alter table public.observations enable row level security;

create or replace function private.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

revoke all on function private.set_updated_at() from public, anon, authenticated;

create trigger species_set_updated_at
before update on public.species
for each row execute function private.set_updated_at();

create trigger species_variants_set_updated_at
before update on public.species_variants
for each row execute function private.set_updated_at();

create trigger thematic_collections_set_updated_at
before update on public.thematic_collections
for each row execute function private.set_updated_at();

create trigger profiles_set_updated_at
before update on public.profiles
for each row execute function private.set_updated_at();

create trigger observations_set_updated_at
before update on public.observations
for each row execute function private.set_updated_at();

create or replace function private.create_profile_for_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id) values (new.id)
  on conflict (id) do nothing;
  return new;
end;
$$;

revoke all on function private.create_profile_for_new_user() from public, anon, authenticated;

create trigger create_profile_after_signup
after insert on auth.users
for each row execute function private.create_profile_for_new_user();
