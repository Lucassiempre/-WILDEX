create table public.badges (
  id text primary key,
  name text not null,
  description text,
  icon_key text,
  created_at timestamptz not null default now()
);

create table public.challenges (
  id text primary key,
  kind text not null check (kind in ('fixed', 'weekly')),
  title text not null,
  description text not null,
  start_at timestamptz,
  end_at timestamptz,
  xp_reward integer not null check (xp_reward >= 0),
  badge_id text references public.badges(id) on update cascade on delete set null,
  status text not null check (status in ('draft', 'scheduled', 'published', 'archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    (kind = 'fixed' and start_at is null and end_at is null)
    or (kind = 'weekly' and start_at is not null and end_at is not null and end_at >= start_at)
  )
);

create table public.challenge_objectives (
  challenge_id text not null references public.challenges(id) on update cascade on delete cascade,
  id text not null,
  objective_type text not null check (
    objective_type in (
      'unique-species',
      'unique-variants',
      'observation-count',
      'category-species',
      'collection-species',
      'new-species'
    )
  ),
  label text not null,
  target integer not null check (target > 0),
  species_id text references public.species(id) on update cascade on delete restrict,
  category text,
  collection_id text references public.thematic_collections(id) on update cascade on delete restrict,
  created_at timestamptz not null default now(),
  primary key (challenge_id, id)
);

create table public.user_species_discoveries (
  user_id uuid not null references auth.users(id) on delete cascade,
  species_id text not null references public.species(id) on update cascade on delete restrict,
  first_observation_id uuid references public.observations(id) on delete set null,
  first_observed_at timestamptz not null,
  created_at timestamptz not null default now(),
  primary key (user_id, species_id)
);

create table public.user_variant_discoveries (
  user_id uuid not null references auth.users(id) on delete cascade,
  species_id text not null,
  variant_id text not null,
  first_observation_id uuid references public.observations(id) on delete set null,
  first_observed_at timestamptz not null,
  created_at timestamptz not null default now(),
  primary key (user_id, species_id, variant_id),
  foreign key (species_id, variant_id)
    references public.species_variants(species_id, id)
    on update cascade
    on delete restrict
);

create table public.xp_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  event_key text not null,
  event_type text not null check (
    event_type in (
      'species-discovery',
      'first-species-bonus',
      'category-bonus',
      'variant-discovery',
      'challenge-reward',
      'legacy-import'
    )
  ),
  amount integer not null check (amount > 0),
  observation_id uuid,
  challenge_id text references public.challenges(id) on update cascade on delete restrict,
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default now(),
  check (
    (event_type = 'species-discovery' and amount = 50)
    or (event_type = 'first-species-bonus' and amount = 50)
    or (event_type = 'category-bonus' and amount = 75)
    or (event_type = 'variant-discovery' and amount = 20)
    or event_type in ('challenge-reward', 'legacy-import')
  ),
  check (
    (event_type in ('species-discovery', 'first-species-bonus', 'category-bonus', 'variant-discovery')
      and observation_id is not null and challenge_id is null)
    or (event_type = 'challenge-reward' and challenge_id is not null and observation_id is null)
    or event_type = 'legacy-import'
  ),
  unique (user_id, event_key),
  unique (user_id, id),
  foreign key (observation_id)
    references public.observations(id)
    on delete set null
);

create index xp_events_user_created_at_idx
  on public.xp_events (user_id, created_at desc);

create table public.challenge_claims (
  user_id uuid not null references auth.users(id) on delete cascade,
  challenge_id text not null references public.challenges(id) on update cascade on delete restrict,
  xp_event_id uuid not null,
  claimed_at timestamptz not null default now(),
  primary key (user_id, challenge_id),
  unique (xp_event_id),
  foreign key (user_id, xp_event_id)
    references public.xp_events(user_id, id)
    on delete restrict
);

create table public.user_badges (
  user_id uuid not null references auth.users(id) on delete cascade,
  badge_id text not null references public.badges(id) on update cascade on delete restrict,
  challenge_id text references public.challenges(id) on update cascade on delete set null,
  earned_at timestamptz not null default now(),
  primary key (user_id, badge_id)
);

create table public.profile_featured_badges (
  user_id uuid not null references public.profiles(id) on delete cascade,
  badge_id text not null,
  position smallint not null check (position between 1 and 3),
  primary key (user_id, badge_id),
  unique (user_id, position),
  foreign key (user_id, badge_id)
    references public.user_badges(user_id, badge_id)
  on delete cascade
);

-- Derived and reward tables stay closed even if a later migration fails.
alter table public.badges enable row level security;
alter table public.challenges enable row level security;
alter table public.challenge_objectives enable row level security;
alter table public.user_species_discoveries enable row level security;
alter table public.user_variant_discoveries enable row level security;
alter table public.xp_events enable row level security;
alter table public.challenge_claims enable row level security;
alter table public.user_badges enable row level security;
alter table public.profile_featured_badges enable row level security;

create trigger challenges_set_updated_at
before update on public.challenges
for each row execute function private.set_updated_at();

create or replace function private.protect_observation_identity()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.id <> old.id
    or new.user_id <> old.user_id
    or new.species_id <> old.species_id
    or new.variant_id is distinct from old.variant_id
    or new.observed_at <> old.observed_at
    or new.identification_method <> old.identification_method
  then
    raise exception 'Observation identity fields are immutable';
  end if;

  return new;
end;
$$;

revoke all on function private.protect_observation_identity() from public, anon, authenticated;

create trigger observations_protect_identity
before update on public.observations
for each row execute function private.protect_observation_identity();

create or replace function private.award_observation_discoveries()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  inserted_rows integer;
  species_category text;
begin
  select species.category
    into species_category
    from public.species
   where species.id = new.species_id;

  insert into public.user_species_discoveries (
    user_id,
    species_id,
    first_observation_id,
    first_observed_at
  ) values (
    new.user_id,
    new.species_id,
    new.id,
    new.observed_at
  )
  on conflict (user_id, species_id) do nothing;

  get diagnostics inserted_rows = row_count;

  if inserted_rows = 1 then
    insert into public.xp_events (
      user_id, event_key, event_type, amount, observation_id
    ) values (
      new.user_id,
      'species:' || new.species_id,
      'species-discovery',
      50,
      new.id
    ) on conflict (user_id, event_key) do nothing;

    insert into public.xp_events (
      user_id, event_key, event_type, amount, observation_id
    ) values (
      new.user_id,
      'first-species-bonus',
      'first-species-bonus',
      50,
      new.id
    ) on conflict (user_id, event_key) do nothing;

    insert into public.xp_events (
      user_id, event_key, event_type, amount, observation_id,
      metadata
    ) values (
      new.user_id,
      'category:' || species_category,
      'category-bonus',
      75,
      new.id,
      jsonb_build_object('category', species_category)
    ) on conflict (user_id, event_key) do nothing;
  end if;

  update public.user_species_discoveries
     set first_observation_id = new.id,
         first_observed_at = new.observed_at
   where user_id = new.user_id
     and species_id = new.species_id
     and new.observed_at < first_observed_at;

  if new.variant_id is not null then
    insert into public.user_variant_discoveries (
      user_id,
      species_id,
      variant_id,
      first_observation_id,
      first_observed_at
    ) values (
      new.user_id,
      new.species_id,
      new.variant_id,
      new.id,
      new.observed_at
    )
    on conflict (user_id, species_id, variant_id) do nothing;

    get diagnostics inserted_rows = row_count;

    if inserted_rows = 1 then
      insert into public.xp_events (
        user_id, event_key, event_type, amount, observation_id
      ) values (
        new.user_id,
        'variant:' || new.species_id || ':' || new.variant_id,
        'variant-discovery',
        20,
        new.id
      ) on conflict (user_id, event_key) do nothing;
    end if;

    update public.user_variant_discoveries
       set first_observation_id = new.id,
           first_observed_at = new.observed_at
     where user_id = new.user_id
       and species_id = new.species_id
       and variant_id = new.variant_id
       and new.observed_at < first_observed_at;
  end if;

  return new;
end;
$$;

revoke all on function private.award_observation_discoveries() from public, anon, authenticated;

create trigger observations_award_discoveries
after insert on public.observations
for each row execute function private.award_observation_discoveries();
