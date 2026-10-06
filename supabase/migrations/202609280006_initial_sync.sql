-- Initial account import and synchronization API.
-- This migration is incremental and requires migrations 001-005.

create table public.sync_imports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  dataset_id uuid not null,
  manifest_sha256 text not null check (manifest_sha256 ~ '^[0-9a-f]{64}$'),
  schema_version integer not null check (schema_version > 0),
  expected_observation_count integer not null check (expected_observation_count >= 0),
  expected_photo_count integer not null check (
    expected_photo_count >= 0
    and expected_photo_count <= expected_observation_count
  ),
  expected_challenge_claim_count integer not null check (expected_challenge_claim_count >= 0),
  expects_profile boolean not null default true,
  processed_observation_count integer not null default 0 check (
    processed_observation_count >= 0
    and processed_observation_count <= expected_observation_count
  ),
  processed_photo_count integer not null default 0 check (
    processed_photo_count >= 0
    and processed_photo_count <= expected_photo_count
  ),
  processed_challenge_claim_count integer not null default 0 check (
    processed_challenge_claim_count >= 0
    and processed_challenge_claim_count <= expected_challenge_claim_count
  ),
  profile_synced_at timestamptz,
  local_xp_snapshot integer check (local_xp_snapshot is null or local_xp_snapshot >= 0),
  status text not null default 'pending' check (status in ('pending', 'completed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz,
  unique (user_id, dataset_id, manifest_sha256),
  unique (user_id, id),
  check (
    (status = 'pending' and completed_at is null)
    or (status = 'completed' and completed_at is not null)
  )
);

alter table public.sync_imports enable row level security;

create table public.sync_import_challenge_claims (
  user_id uuid not null references auth.users(id) on delete cascade,
  import_id uuid not null,
  challenge_id text not null,
  created_at timestamptz not null default now(),
  primary key (user_id, import_id, challenge_id),
  foreign key (user_id, import_id)
    references public.sync_imports(user_id, id)
    on delete restrict,
  foreign key (user_id, challenge_id)
    references public.challenge_claims(user_id, challenge_id)
    on delete restrict
);

alter table public.sync_import_challenge_claims enable row level security;

alter table public.profiles
  add column sync_revision bigint not null default 1 check (sync_revision > 0),
  add column client_updated_at timestamptz;

alter table public.profiles
  add constraint profiles_username_length_check
    check (username is null or char_length(username) between 3 and 20),
  add constraint profiles_display_name_length_check
    check (display_name is null or char_length(display_name) between 1 and 40),
  add constraint profiles_bio_length_check
    check (bio is null or char_length(bio) <= 160);

alter table public.profile_featured_badges
  add column removed_at timestamptz;

alter table public.profile_featured_badges
  drop constraint profile_featured_badges_user_id_position_key;

create unique index profile_featured_badges_active_position_key
  on public.profile_featured_badges (user_id, position)
  where removed_at is null;

alter table public.observations
  add column sync_revision bigint not null default 1 check (sync_revision > 0),
  add column client_updated_at timestamptz,
  add column import_id uuid,
  add column legacy_source_id text,
  add constraint observations_import_owner_fkey
    foreign key (user_id, import_id)
    references public.sync_imports(user_id, id)
    on delete restrict,
  add constraint observations_legacy_source_requires_import_check
    check (legacy_source_id is null or (import_id is not null and char_length(legacy_source_id) between 1 and 240)),
  add constraint observations_photo_metadata_complete_check
    check (
      (
        photo_path is null
        and photo_mime_type is null
        and photo_size_bytes is null
        and photo_sha256 is null
      )
      or (
        photo_path is not null
        and photo_mime_type in ('image/jpeg', 'image/png', 'image/webp')
        and photo_size_bytes is not null
        and photo_size_bytes > 0
        and photo_sha256 is not null
        and photo_path = user_id::text || '/' || id::text || '/' || photo_sha256 ||
          case photo_mime_type
            when 'image/jpeg' then '.jpg'
            when 'image/png' then '.png'
            when 'image/webp' then '.webp'
          end
      )
    );

create unique index observations_import_legacy_source_key
  on public.observations (user_id, import_id, legacy_source_id)
  where import_id is not null and legacy_source_id is not null;

create index observations_user_updated_at_idx
  on public.observations (user_id, updated_at, id);

create index sync_imports_user_updated_at_idx
  on public.sync_imports (user_id, updated_at desc);

create or replace function private.bump_sync_revision()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.sync_revision = old.sync_revision + 1;
  return new;
end;
$$;

revoke all on function private.bump_sync_revision() from public, anon, authenticated;

create trigger profiles_bump_sync_revision
before update on public.profiles
for each row execute function private.bump_sync_revision();

create trigger observations_bump_sync_revision
before update on public.observations
for each row execute function private.bump_sync_revision();

create trigger sync_imports_set_updated_at
before update on public.sync_imports
for each row execute function private.set_updated_at();

create or replace function private.protect_observation_sync_identity()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.import_id is distinct from old.import_id
    or new.legacy_source_id is distinct from old.legacy_source_id
  then
    raise exception using
      errcode = 'P0001',
      message = 'observation_sync_identity_conflict';
  end if;

  return new;
end;
$$;

revoke all on function private.protect_observation_sync_identity() from public, anon, authenticated;

create trigger observations_protect_sync_identity
before update on public.observations
for each row execute function private.protect_observation_sync_identity();

create or replace function private.challenge_objective_progress(
  p_user_id uuid,
  p_challenge_id text,
  p_objective_id text
)
returns integer
language plpgsql
stable
set search_path = ''
as $$
declare
  challenge_row public.challenges%rowtype;
  objective_row public.challenge_objectives%rowtype;
  progress integer;
begin
  select * into challenge_row
  from public.challenges
  where id = p_challenge_id;

  select * into objective_row
  from public.challenge_objectives
  where challenge_id = p_challenge_id
    and id = p_objective_id;

  if not found then
    raise exception using errcode = 'P0001', message = 'challenge_objective_not_found';
  end if;

  if objective_row.objective_type = 'observation-count' then
    select count(*)::integer into progress
    from public.observations observations
    where observations.user_id = p_user_id
      and observations.deleted_at is null
      and (
        challenge_row.kind = 'fixed'
        or observations.observed_at between challenge_row.start_at and challenge_row.end_at
      );
  elsif objective_row.objective_type = 'unique-species' then
    select count(distinct observations.species_id)::integer into progress
    from public.observations observations
    where observations.user_id = p_user_id
      and observations.deleted_at is null
      and (
        challenge_row.kind = 'fixed'
        or observations.observed_at between challenge_row.start_at and challenge_row.end_at
      );
  elsif objective_row.objective_type = 'unique-variants' then
    select count(distinct (observations.species_id, observations.variant_id))::integer into progress
    from public.observations observations
    where observations.user_id = p_user_id
      and observations.deleted_at is null
      and observations.variant_id is not null
      and (objective_row.species_id is null or observations.species_id = objective_row.species_id)
      and (
        challenge_row.kind = 'fixed'
        or observations.observed_at between challenge_row.start_at and challenge_row.end_at
      );
  elsif objective_row.objective_type = 'category-species' then
    select count(distinct observations.species_id)::integer into progress
    from public.observations observations
    join public.species species on species.id = observations.species_id
    where observations.user_id = p_user_id
      and observations.deleted_at is null
      and species.category = objective_row.category
      and (
        challenge_row.kind = 'fixed'
        or observations.observed_at between challenge_row.start_at and challenge_row.end_at
      );
  elsif objective_row.objective_type = 'collection-species' then
    select count(distinct observations.species_id)::integer into progress
    from public.observations observations
    join public.thematic_collection_species members
      on members.species_id = observations.species_id
     and members.collection_id = objective_row.collection_id
    where observations.user_id = p_user_id
      and observations.deleted_at is null
      and (
        challenge_row.kind = 'fixed'
        or observations.observed_at between challenge_row.start_at and challenge_row.end_at
      );
  elsif objective_row.objective_type = 'new-species' then
    select count(*)::integer into progress
    from public.user_species_discoveries discoveries
    where discoveries.user_id = p_user_id
      and (
        challenge_row.kind = 'fixed'
        or discoveries.first_observed_at between challenge_row.start_at and challenge_row.end_at
      );
  else
    raise exception using errcode = 'P0001', message = 'unsupported_challenge_objective';
  end if;

  return coalesce(progress, 0);
end;
$$;

revoke all on function private.challenge_objective_progress(uuid, text, text) from public, anon, authenticated;

create or replace function public.begin_sync_import(
  p_dataset_id uuid,
  p_manifest_sha256 text,
  p_schema_version integer,
  p_expected_observation_count integer,
  p_expected_photo_count integer,
  p_expected_challenge_claim_count integer,
  p_expects_profile boolean default true,
  p_local_xp_snapshot integer default null
)
returns public.sync_imports
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  import_row public.sync_imports%rowtype;
begin
  if current_user_id is null then
    raise exception using errcode = '42501', message = 'authentication_required';
  end if;
  if p_manifest_sha256 is null or p_manifest_sha256 !~ '^[0-9a-f]{64}$'
    or p_schema_version <= 0
    or p_expected_observation_count < 0
    or p_expected_photo_count < 0
    or p_expected_photo_count > p_expected_observation_count
    or p_expected_challenge_claim_count < 0
    or (p_local_xp_snapshot is not null and p_local_xp_snapshot < 0)
  then
    raise exception using errcode = '22023', message = 'invalid_sync_manifest';
  end if;

  insert into public.sync_imports (
    user_id,
    dataset_id,
    manifest_sha256,
    schema_version,
    expected_observation_count,
    expected_photo_count,
    expected_challenge_claim_count,
    expects_profile,
    local_xp_snapshot
  ) values (
    current_user_id,
    p_dataset_id,
    p_manifest_sha256,
    p_schema_version,
    p_expected_observation_count,
    p_expected_photo_count,
    p_expected_challenge_claim_count,
    p_expects_profile,
    p_local_xp_snapshot
  )
  on conflict (user_id, dataset_id, manifest_sha256) do nothing
  returning * into import_row;

  if not found then
    select * into import_row
    from public.sync_imports
    where user_id = current_user_id
      and dataset_id = p_dataset_id
      and manifest_sha256 = p_manifest_sha256
    for update;

    if import_row.schema_version <> p_schema_version
      or import_row.expected_observation_count <> p_expected_observation_count
      or import_row.expected_photo_count <> p_expected_photo_count
      or import_row.expected_challenge_claim_count <> p_expected_challenge_claim_count
      or import_row.expects_profile <> p_expects_profile
      or import_row.local_xp_snapshot is distinct from p_local_xp_snapshot
    then
      raise exception using errcode = 'P0001', message = 'sync_manifest_conflict';
    end if;
  end if;

  return import_row;
end;
$$;

create or replace function public.sync_observation(
  p_observation_id uuid,
  p_species_id text,
  p_observed_at timestamptz,
  p_identification_method text,
  p_variant_id text default null,
  p_species_confidence double precision default null,
  p_variant_confidence double precision default null,
  p_notes text default null,
  p_custom_name text default null,
  p_client_created_at timestamptz default null,
  p_client_updated_at timestamptz default null,
  p_import_id uuid default null,
  p_legacy_source_id text default null,
  p_expected_revision bigint default null
)
returns public.observations
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  observation_row public.observations%rowtype;
  import_status text;
begin
  if current_user_id is null then
    raise exception using errcode = '42501', message = 'authentication_required';
  end if;
  if p_import_id is null and p_legacy_source_id is not null then
    raise exception using errcode = '22023', message = 'legacy_source_requires_import';
  end if;
  if p_legacy_source_id is not null and char_length(p_legacy_source_id) not between 1 and 240 then
    raise exception using errcode = '22023', message = 'invalid_legacy_source_id';
  end if;
  if p_client_updated_at is not null and p_client_updated_at > now() + interval '5 minutes' then
    raise exception using errcode = '22023', message = 'client_timestamp_in_future';
  end if;

  if p_import_id is not null then
    select imports.status into import_status
    from public.sync_imports imports
    where imports.id = p_import_id
      and imports.user_id = current_user_id;

    if not found then
      raise exception using errcode = 'P0001', message = 'sync_import_not_found';
    end if;
  end if;

  select * into observation_row
  from public.observations
  where id = p_observation_id
  for update;

  if found then
    if observation_row.user_id <> current_user_id
      or observation_row.species_id <> p_species_id
      or observation_row.variant_id is distinct from p_variant_id
      or observation_row.observed_at <> p_observed_at
      or observation_row.identification_method <> p_identification_method
      or observation_row.import_id is distinct from p_import_id
      or observation_row.legacy_source_id is distinct from p_legacy_source_id
    then
      raise exception using errcode = 'P0001', message = 'observation_identity_conflict';
    end if;

    if observation_row.species_confidence is not distinct from p_species_confidence
      and observation_row.variant_confidence is not distinct from p_variant_confidence
      and observation_row.notes is not distinct from nullif(btrim(p_notes), '')
      and observation_row.custom_name is not distinct from nullif(btrim(p_custom_name), '')
      and observation_row.client_created_at is not distinct from p_client_created_at
      and observation_row.client_updated_at is not distinct from p_client_updated_at
    then
      return observation_row;
    end if;

    if import_status = 'completed' then
      raise exception using errcode = 'P0001', message = 'sync_import_already_completed';
    end if;

    if p_expected_revision is null or observation_row.sync_revision <> p_expected_revision then
      raise exception using errcode = 'P0001', message = 'observation_revision_conflict';
    end if;

    update public.observations
    set species_confidence = p_species_confidence,
        variant_confidence = p_variant_confidence,
        notes = nullif(btrim(p_notes), ''),
        custom_name = nullif(btrim(p_custom_name), ''),
        client_created_at = p_client_created_at,
        client_updated_at = p_client_updated_at
    where id = p_observation_id
      and user_id = current_user_id
    returning * into observation_row;
  else
    if p_import_id is not null and import_status <> 'pending' then
      raise exception using errcode = 'P0001', message = 'sync_import_already_completed';
    end if;

    insert into public.observations (
      id,
      user_id,
      species_id,
      variant_id,
      observed_at,
      identification_method,
      species_confidence,
      variant_confidence,
      notes,
      custom_name,
      client_created_at,
      client_updated_at,
      import_id,
      legacy_source_id
    ) values (
      p_observation_id,
      current_user_id,
      p_species_id,
      p_variant_id,
      p_observed_at,
      p_identification_method,
      p_species_confidence,
      p_variant_confidence,
      nullif(btrim(p_notes), ''),
      nullif(btrim(p_custom_name), ''),
      p_client_created_at,
      p_client_updated_at,
      p_import_id,
      p_legacy_source_id
    )
    returning * into observation_row;
  end if;

  if p_import_id is not null then
    update public.sync_imports imports
    set processed_observation_count = (
      select count(*)::integer
      from public.observations observations
      where observations.user_id = current_user_id
        and observations.import_id = p_import_id
    )
    where imports.id = p_import_id
      and imports.user_id = current_user_id;
  end if;

  return observation_row;
end;
$$;

create or replace function public.attach_observation_photo(
  p_observation_id uuid,
  p_photo_path text,
  p_photo_mime_type text,
  p_photo_size_bytes bigint,
  p_photo_sha256 text,
  p_expected_revision bigint default null
)
returns public.observations
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  observation_row public.observations%rowtype;
  expected_path text;
begin
  if current_user_id is null then
    raise exception using errcode = '42501', message = 'authentication_required';
  end if;
  if p_photo_mime_type not in ('image/jpeg', 'image/png', 'image/webp')
    or p_photo_size_bytes <= 0
    or p_photo_sha256 !~ '^[0-9a-f]{64}$'
  then
    raise exception using errcode = '22023', message = 'invalid_photo_metadata';
  end if;

  expected_path := current_user_id::text || '/' || p_observation_id::text || '/' || p_photo_sha256 ||
    case p_photo_mime_type
      when 'image/jpeg' then '.jpg'
      when 'image/png' then '.png'
      when 'image/webp' then '.webp'
    end;

  if p_photo_path <> expected_path then
    raise exception using errcode = '22023', message = 'invalid_photo_path';
  end if;

  select * into observation_row
  from public.observations
  where id = p_observation_id
  for update;

  if not found or observation_row.user_id <> current_user_id or observation_row.deleted_at is not null then
    raise exception using errcode = 'P0001', message = 'observation_not_found';
  end if;

  if observation_row.photo_path is not distinct from p_photo_path
    and observation_row.photo_mime_type is not distinct from p_photo_mime_type
    and observation_row.photo_size_bytes is not distinct from p_photo_size_bytes
    and observation_row.photo_sha256 is not distinct from p_photo_sha256
  then
    return observation_row;
  end if;

  if p_expected_revision is null or observation_row.sync_revision <> p_expected_revision then
    raise exception using errcode = 'P0001', message = 'observation_revision_conflict';
  end if;

  if not exists (
    select 1
    from storage.objects objects
    where objects.bucket_id = 'observation-photos'
      and objects.name = p_photo_path
      and objects.owner_id = current_user_id::text
      and objects.metadata ->> 'size' = p_photo_size_bytes::text
      and objects.metadata ->> 'mimetype' = p_photo_mime_type
  ) then
    raise exception using errcode = 'P0001', message = 'stored_photo_not_found_or_mismatched';
  end if;

  update public.observations
  set photo_path = p_photo_path,
      photo_mime_type = p_photo_mime_type,
      photo_size_bytes = p_photo_size_bytes,
      photo_sha256 = p_photo_sha256
  where id = p_observation_id
    and user_id = current_user_id
  returning * into observation_row;

  if observation_row.import_id is not null then
    update public.sync_imports imports
    set processed_photo_count = (
      select count(*)::integer
      from public.observations observations
      where observations.user_id = current_user_id
        and observations.import_id = observation_row.import_id
        and observations.photo_path is not null
    )
    where imports.id = observation_row.import_id
      and imports.user_id = current_user_id;
  end if;

  return observation_row;
end;
$$;

create or replace function public.sync_profile(
  p_username text,
  p_display_name text,
  p_bio text,
  p_avatar_config jsonb,
  p_favorite_species_id text,
  p_featured_badge_ids text[],
  p_client_updated_at timestamptz,
  p_import_id uuid default null,
  p_expected_revision bigint default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  profile_row public.profiles%rowtype;
  current_featured text[];
  normalized_featured text[] := coalesce(p_featured_badge_ids, '{}'::text[]);
  profile_is_blank boolean;
  import_status text;
begin
  if current_user_id is null then
    raise exception using errcode = '42501', message = 'authentication_required';
  end if;
  if p_username is not null and char_length(btrim(p_username)) not between 3 and 20 then
    raise exception using errcode = '22023', message = 'invalid_username';
  end if;
  if p_display_name is not null and char_length(btrim(p_display_name)) not between 1 and 40 then
    raise exception using errcode = '22023', message = 'invalid_display_name';
  end if;
  if p_bio is not null and char_length(btrim(p_bio)) > 160 then
    raise exception using errcode = '22023', message = 'invalid_bio';
  end if;
  if p_avatar_config is null or jsonb_typeof(p_avatar_config) <> 'object' then
    raise exception using errcode = '22023', message = 'invalid_avatar_config';
  end if;
  if cardinality(normalized_featured) > 3
    or cardinality(normalized_featured) <> (
      select count(distinct requested.badge_id)::integer
      from unnest(normalized_featured) as requested(badge_id)
    )
    or exists (
      select 1 from unnest(normalized_featured) as requested(badge_id)
      where not exists (
        select 1 from public.user_badges earned
        where earned.user_id = current_user_id and earned.badge_id = requested.badge_id
      )
    )
  then
    raise exception using errcode = '22023', message = 'invalid_featured_badges';
  end if;
  if p_client_updated_at is not null and p_client_updated_at > now() + interval '5 minutes' then
    raise exception using errcode = '22023', message = 'client_timestamp_in_future';
  end if;
  if p_favorite_species_id is not null and not exists (
    select 1 from public.user_species_discoveries discoveries
    where discoveries.user_id = current_user_id
      and discoveries.species_id = p_favorite_species_id
  ) then
    raise exception using errcode = '22023', message = 'favorite_species_not_discovered';
  end if;
  if p_import_id is not null then
    select imports.status into import_status
    from public.sync_imports imports
    where imports.id = p_import_id
      and imports.user_id = current_user_id;

    if not found then
      raise exception using errcode = 'P0001', message = 'sync_import_not_found';
    end if;
  end if;

  select * into profile_row
  from public.profiles
  where id = current_user_id
  for update;

  if not found then
    if import_status = 'completed' then
      raise exception using errcode = 'P0001', message = 'sync_import_already_completed';
    end if;

    insert into public.profiles (
      id, username, display_name, bio, avatar_config, favorite_species_id, client_updated_at
    ) values (
      current_user_id,
      nullif(btrim(p_username), ''),
      nullif(btrim(p_display_name), ''),
      nullif(btrim(p_bio), ''),
      p_avatar_config,
      p_favorite_species_id,
      p_client_updated_at
    ) returning * into profile_row;
  else
    select coalesce(array_agg(featured.badge_id order by featured.position), '{}'::text[])
      into current_featured
    from public.profile_featured_badges featured
    where featured.user_id = current_user_id
      and featured.removed_at is null;

    if profile_row.username is not distinct from nullif(btrim(p_username), '')
      and profile_row.display_name is not distinct from nullif(btrim(p_display_name), '')
      and profile_row.bio is not distinct from nullif(btrim(p_bio), '')
      and profile_row.avatar_config = p_avatar_config
      and profile_row.favorite_species_id is not distinct from p_favorite_species_id
      and profile_row.client_updated_at is not distinct from p_client_updated_at
      and current_featured = normalized_featured
    then
      if p_import_id is not null and import_status = 'pending' then
        update public.sync_imports
        set profile_synced_at = coalesce(profile_synced_at, now())
        where id = p_import_id and user_id = current_user_id;
      end if;
      return jsonb_build_object('profile', to_jsonb(profile_row), 'featuredBadgeIds', to_jsonb(current_featured));
    end if;

    profile_is_blank := profile_row.username is null
      and profile_row.display_name is null
      and profile_row.bio is null
      and profile_row.avatar_config = '{}'::jsonb
      and profile_row.favorite_species_id is null
      and current_featured = '{}'::text[];

    if not profile_is_blank
      and (p_expected_revision is null or profile_row.sync_revision <> p_expected_revision)
    then
      raise exception using errcode = 'P0001', message = 'profile_revision_conflict';
    end if;
    if import_status = 'completed' then
      raise exception using errcode = 'P0001', message = 'sync_import_already_completed';
    end if;

    update public.profiles
    set username = nullif(btrim(p_username), ''),
        display_name = nullif(btrim(p_display_name), ''),
        bio = nullif(btrim(p_bio), ''),
        avatar_config = p_avatar_config,
        favorite_species_id = p_favorite_species_id,
        client_updated_at = p_client_updated_at
    where id = current_user_id
    returning * into profile_row;
  end if;

  update public.profile_featured_badges
  set removed_at = now()
  where user_id = current_user_id
    and removed_at is null;

  insert into public.profile_featured_badges (user_id, badge_id, position)
  select current_user_id, badge_id, ordinal::smallint
  from unnest(normalized_featured) with ordinality featured(badge_id, ordinal)
  on conflict (user_id, badge_id) do update
  set position = excluded.position,
      removed_at = null;

  if p_import_id is not null then
    update public.sync_imports
    set profile_synced_at = coalesce(profile_synced_at, now())
    where id = p_import_id
      and user_id = current_user_id;
  end if;

  return jsonb_build_object('profile', to_jsonb(profile_row), 'featuredBadgeIds', to_jsonb(normalized_featured));
end;
$$;

create or replace function public.claim_challenge(
  p_challenge_id text,
  p_import_id uuid default null,
  p_client_claimed_at timestamptz default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  challenge_row public.challenges%rowtype;
  xp_event_row public.xp_events%rowtype;
  claim_row public.challenge_claims%rowtype;
  effective_claimed_at timestamptz := coalesce(p_client_claimed_at, now());
  import_status text;
begin
  if current_user_id is null then
    raise exception using errcode = '42501', message = 'authentication_required';
  end if;
  if effective_claimed_at > now() + interval '5 minutes' then
    raise exception using errcode = '22023', message = 'claim_timestamp_in_future';
  end if;
  if p_import_id is not null then
    select imports.status into import_status
    from public.sync_imports imports
    where imports.id = p_import_id
      and imports.user_id = current_user_id;

    if not found then
      raise exception using errcode = 'P0001', message = 'sync_import_not_found';
    end if;
  end if;

  select * into challenge_row
  from public.challenges
  where id = p_challenge_id
  for share;

  if not found or challenge_row.status not in ('published', 'archived') then
    raise exception using errcode = 'P0001', message = 'challenge_not_claimable';
  end if;
  if challenge_row.xp_reward <= 0 then
    raise exception using errcode = 'P0001', message = 'challenge_reward_invalid';
  end if;
  if challenge_row.kind = 'weekly'
    and (now() < challenge_row.start_at or effective_claimed_at < challenge_row.start_at)
  then
    raise exception using errcode = 'P0001', message = 'challenge_not_started';
  end if;

  select * into claim_row
  from public.challenge_claims
  where user_id = current_user_id
    and challenge_id = p_challenge_id;

  if found then
    if p_import_id is not null then
      if import_status = 'completed' and not exists (
        select 1 from public.sync_import_challenge_claims imported
        where imported.user_id = current_user_id
          and imported.import_id = p_import_id
          and imported.challenge_id = p_challenge_id
      ) then
        raise exception using errcode = 'P0001', message = 'sync_import_already_completed';
      end if;

      insert into public.sync_import_challenge_claims (user_id, import_id, challenge_id)
      values (current_user_id, p_import_id, p_challenge_id)
      on conflict (user_id, import_id, challenge_id) do nothing;

      update public.sync_imports imports
      set processed_challenge_claim_count = (
        select count(*)::integer
        from public.sync_import_challenge_claims imported
        where imported.user_id = current_user_id
          and imported.import_id = p_import_id
      )
      where imports.id = p_import_id
        and imports.user_id = current_user_id;
    end if;

    return jsonb_build_object(
      'claimed', true,
      'alreadyClaimed', true,
      'challengeId', claim_row.challenge_id,
      'xpEventId', claim_row.xp_event_id
    );
  end if;
  if not exists (
    select 1 from public.challenge_objectives objectives
    where objectives.challenge_id = p_challenge_id
  ) then
    raise exception using errcode = 'P0001', message = 'challenge_has_no_objectives';
  end if;
  if exists (
    select 1
    from public.challenge_objectives objectives
    where objectives.challenge_id = p_challenge_id
      and private.challenge_objective_progress(
        current_user_id,
        objectives.challenge_id,
        objectives.id
      ) < objectives.target
  ) then
    raise exception using errcode = 'P0001', message = 'challenge_not_completed';
  end if;
  if import_status = 'completed' then
    raise exception using errcode = 'P0001', message = 'sync_import_already_completed';
  end if;

  insert into public.xp_events (
    user_id, event_key, event_type, amount, challenge_id, created_at
  ) values (
    current_user_id,
    'challenge:' || p_challenge_id,
    'challenge-reward',
    challenge_row.xp_reward,
    p_challenge_id,
    effective_claimed_at
  )
  on conflict (user_id, event_key) do nothing
  returning * into xp_event_row;

  if not found then
    select * into xp_event_row
    from public.xp_events
    where user_id = current_user_id
      and event_key = 'challenge:' || p_challenge_id;

    if xp_event_row.event_type <> 'challenge-reward'
      or xp_event_row.challenge_id is distinct from p_challenge_id
      or xp_event_row.amount <> challenge_row.xp_reward
    then
      raise exception using errcode = 'P0001', message = 'challenge_reward_conflict';
    end if;
  end if;

  insert into public.challenge_claims (user_id, challenge_id, xp_event_id, claimed_at)
  values (current_user_id, p_challenge_id, xp_event_row.id, effective_claimed_at)
  on conflict (user_id, challenge_id) do nothing
  returning * into claim_row;

  if not found then
    select * into claim_row
    from public.challenge_claims
    where user_id = current_user_id
      and challenge_id = p_challenge_id;
  end if;

  if challenge_row.badge_id is not null then
    insert into public.user_badges (user_id, badge_id, challenge_id, earned_at)
    values (current_user_id, challenge_row.badge_id, p_challenge_id, effective_claimed_at)
    on conflict (user_id, badge_id) do nothing;
  end if;

  if p_import_id is not null then
    insert into public.sync_import_challenge_claims (user_id, import_id, challenge_id)
    values (current_user_id, p_import_id, p_challenge_id)
    on conflict (user_id, import_id, challenge_id) do nothing;

    update public.sync_imports imports
    set processed_challenge_claim_count = (
      select count(*)::integer
      from public.sync_import_challenge_claims imported
      where imported.user_id = current_user_id
        and imported.import_id = p_import_id
    )
    where imports.id = p_import_id
      and imports.user_id = current_user_id;
  end if;

  return jsonb_build_object(
    'claimed', true,
    'alreadyClaimed', false,
    'challengeId', claim_row.challenge_id,
    'xpEventId', claim_row.xp_event_id,
    'xpAwarded', challenge_row.xp_reward,
    'badgeId', challenge_row.badge_id
  );
end;
$$;

create or replace function public.complete_sync_import(p_import_id uuid)
returns public.sync_imports
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  import_row public.sync_imports%rowtype;
  observation_count integer;
  photo_count integer;
begin
  if current_user_id is null then
    raise exception using errcode = '42501', message = 'authentication_required';
  end if;

  select * into import_row
  from public.sync_imports
  where id = p_import_id
  for update;

  if not found or import_row.user_id <> current_user_id then
    raise exception using errcode = 'P0001', message = 'sync_import_not_found';
  end if;
  if import_row.status = 'completed' then
    return import_row;
  end if;

  select count(*)::integer,
         count(*) filter (where observations.photo_path is not null)::integer
    into observation_count, photo_count
  from public.observations observations
  where observations.user_id = current_user_id
    and observations.import_id = p_import_id;

  if observation_count <> import_row.expected_observation_count
    or photo_count <> import_row.expected_photo_count
    or import_row.processed_challenge_claim_count <> import_row.expected_challenge_claim_count
    or (import_row.expects_profile and import_row.profile_synced_at is null)
  then
    raise exception using errcode = 'P0001', message = 'sync_import_incomplete';
  end if;

  update public.sync_imports
  set processed_observation_count = observation_count,
      processed_photo_count = photo_count,
      status = 'completed',
      completed_at = now()
  where id = p_import_id
    and user_id = current_user_id
  returning * into import_row;

  return import_row;
end;
$$;

create or replace function public.get_account_snapshot()
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
begin
  if current_user_id is null then
    raise exception using errcode = '42501', message = 'authentication_required';
  end if;

  return jsonb_build_object(
    'schemaVersion', 1,
    'serverTime', now(),
    'profile', (
      select to_jsonb(profiles) from public.profiles profiles where profiles.id = current_user_id
    ),
    'featuredBadgeIds', coalesce((
      select jsonb_agg(featured.badge_id order by featured.position)
      from public.profile_featured_badges featured
      where featured.user_id = current_user_id
        and featured.removed_at is null
    ), '[]'::jsonb),
    'observations', coalesce((
      select jsonb_agg(to_jsonb(observations) order by observations.observed_at, observations.id)
      from public.observations observations
      where observations.user_id = current_user_id
    ), '[]'::jsonb),
    'speciesDiscoveries', coalesce((
      select jsonb_agg(to_jsonb(discoveries) order by discoveries.first_observed_at, discoveries.species_id)
      from public.user_species_discoveries discoveries
      where discoveries.user_id = current_user_id
    ), '[]'::jsonb),
    'variantDiscoveries', coalesce((
      select jsonb_agg(to_jsonb(discoveries) order by discoveries.first_observed_at, discoveries.species_id, discoveries.variant_id)
      from public.user_variant_discoveries discoveries
      where discoveries.user_id = current_user_id
    ), '[]'::jsonb),
    'xpEvents', coalesce((
      select jsonb_agg(to_jsonb(events) order by events.created_at, events.id)
      from public.xp_events events
      where events.user_id = current_user_id
    ), '[]'::jsonb),
    'xpTotal', coalesce((
      select sum(events.amount) from public.xp_events events where events.user_id = current_user_id
    ), 0),
    'challengeClaims', coalesce((
      select jsonb_agg(to_jsonb(claims) order by claims.claimed_at, claims.challenge_id)
      from public.challenge_claims claims
      where claims.user_id = current_user_id
    ), '[]'::jsonb),
    'badges', coalesce((
      select jsonb_agg(to_jsonb(badges) order by badges.earned_at, badges.badge_id)
      from public.user_badges badges
      where badges.user_id = current_user_id
    ), '[]'::jsonb),
    'imports', coalesce((
      select jsonb_agg(to_jsonb(imports) order by imports.created_at, imports.id)
      from public.sync_imports imports
      where imports.user_id = current_user_id
    ), '[]'::jsonb)
  );
end;
$$;

-- Direct client writes are replaced by narrowly scoped RPCs. Internal triggers
-- continue to run as the table owner and retain access to derived tables.
revoke insert, update, delete on public.profiles from authenticated;
revoke insert, update, delete on public.observations from authenticated;
revoke insert, update, delete on public.profile_featured_badges from authenticated;
revoke all on public.sync_imports from anon, authenticated;
revoke all on public.sync_import_challenge_claims from anon, authenticated;

grant select on public.sync_imports to authenticated;

drop policy profiles_insert_own on public.profiles;
drop policy profiles_update_own on public.profiles;
drop policy profiles_delete_own on public.profiles;
drop policy observations_insert_own on public.observations;
drop policy observations_update_own on public.observations;
drop policy observations_delete_own on public.observations;
drop policy featured_badges_insert_own on public.profile_featured_badges;
drop policy featured_badges_update_own on public.profile_featured_badges;
drop policy featured_badges_delete_own on public.profile_featured_badges;

create policy sync_imports_select_own
on public.sync_imports for select
to authenticated
using ((select auth.uid()) = user_id);

create policy sync_import_challenge_claims_select_own
on public.sync_import_challenge_claims for select
to authenticated
using ((select auth.uid()) = user_id);

drop policy observation_photos_select_own on storage.objects;
drop policy observation_photos_insert_own on storage.objects;
drop policy observation_photos_update_own on storage.objects;
drop policy observation_photos_delete_own on storage.objects;

create policy observation_photos_select_own
on storage.objects for select
to authenticated
using (
  bucket_id = 'observation-photos'
  and owner_id = (select auth.uid())::text
  and name ~ ('^' || (select auth.uid())::text || '/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/[0-9a-f]{64}\.(jpg|png|webp)$')
  and exists (
    select 1 from public.observations observations
    where observations.user_id = (select auth.uid())
      and observations.id = case
        when name ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/' then split_part(name, '/', 2)::uuid
        else null
      end
      and observations.deleted_at is null
  )
);

create policy observation_photos_insert_own
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'observation-photos'
  and name ~ ('^' || (select auth.uid())::text || '/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/[0-9a-f]{64}\.(jpg|png|webp)$')
  and exists (
    select 1 from public.observations observations
    where observations.user_id = (select auth.uid())
      and observations.id = case
        when name ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/' then split_part(name, '/', 2)::uuid
        else null
      end
      and observations.deleted_at is null
  )
);

revoke all on function public.begin_sync_import(uuid, text, integer, integer, integer, integer, boolean, integer) from public, anon, authenticated;
revoke all on function public.sync_observation(uuid, text, timestamptz, text, text, double precision, double precision, text, text, timestamptz, timestamptz, uuid, text, bigint) from public, anon, authenticated;
revoke all on function public.attach_observation_photo(uuid, text, text, bigint, text, bigint) from public, anon, authenticated;
revoke all on function public.sync_profile(text, text, text, jsonb, text, text[], timestamptz, uuid, bigint) from public, anon, authenticated;
revoke all on function public.claim_challenge(text, uuid, timestamptz) from public, anon, authenticated;
revoke all on function public.complete_sync_import(uuid) from public, anon, authenticated;
revoke all on function public.get_account_snapshot() from public, anon, authenticated;

grant execute on function public.begin_sync_import(uuid, text, integer, integer, integer, integer, boolean, integer) to authenticated;
grant execute on function public.sync_observation(uuid, text, timestamptz, text, text, double precision, double precision, text, text, timestamptz, timestamptz, uuid, text, bigint) to authenticated;
grant execute on function public.attach_observation_photo(uuid, text, text, bigint, text, bigint) to authenticated;
grant execute on function public.sync_profile(text, text, text, jsonb, text, text[], timestamptz, uuid, bigint) to authenticated;
grant execute on function public.claim_challenge(text, uuid, timestamptz) to authenticated;
grant execute on function public.complete_sync_import(uuid) to authenticated;
grant execute on function public.get_account_snapshot() to authenticated;

revoke all on all functions in schema private from public, anon, authenticated;
