-- Composite observation identity and reusable import membership.
-- Requires migrations 001-007. This migration preserves all existing rows.

begin;

-- The old global FK allowed a structurally cross-owner reference even though
-- Wildex's triggers never create one. Refuse to migrate if remote data does.
do $$
begin
  if exists (
    select 1
    from public.user_species_discoveries discoveries
    join public.observations observations on observations.id = discoveries.first_observation_id
    where discoveries.user_id <> observations.user_id
  ) or exists (
    select 1
    from public.user_variant_discoveries discoveries
    join public.observations observations on observations.id = discoveries.first_observation_id
    where discoveries.user_id <> observations.user_id
  ) or exists (
    select 1
    from public.xp_events events
    join public.observations observations on observations.id = events.observation_id
    where events.user_id <> observations.user_id
  ) then
    raise exception using errcode = '23503', message = 'cross_owner_observation_reference_detected';
  end if;
end;
$$;

-- Child references must include the owner before observations.id stops being
-- globally unique. SET NULL targets only the nullable observation column.
alter table public.user_species_discoveries
  drop constraint user_species_discoveries_first_observation_id_fkey;

alter table public.user_variant_discoveries
  drop constraint user_variant_discoveries_first_observation_id_fkey;

alter table public.xp_events
  drop constraint xp_events_observation_id_fkey;

alter table public.observations
  drop constraint observations_pkey,
  drop constraint observations_user_id_id_key;

alter table public.observations
  add constraint observations_pkey primary key (user_id, id);

alter table public.user_species_discoveries
  add constraint user_species_discoveries_first_observation_fkey
  foreign key (user_id, first_observation_id)
  references public.observations(user_id, id)
  on delete set null (first_observation_id);

alter table public.user_variant_discoveries
  add constraint user_variant_discoveries_first_observation_fkey
  foreign key (user_id, first_observation_id)
  references public.observations(user_id, id)
  on delete set null (first_observation_id);

alter table public.xp_events
  add constraint xp_events_observation_fkey
  foreign key (user_id, observation_id)
  references public.observations(user_id, id)
  on delete set null (observation_id);

create index user_species_discoveries_first_observation_idx
  on public.user_species_discoveries (user_id, first_observation_id)
  where first_observation_id is not null;

create index user_variant_discoveries_first_observation_idx
  on public.user_variant_discoveries (user_id, first_observation_id)
  where first_observation_id is not null;

create index xp_events_observation_idx
  on public.xp_events (user_id, observation_id)
  where observation_id is not null;

create table public.sync_import_observations (
  user_id uuid not null,
  import_id uuid not null,
  observation_id uuid not null,
  legacy_source_id text,
  confirmed_at timestamptz not null default now(),
  constraint sync_import_observations_pkey
    primary key (user_id, import_id, observation_id),
  constraint sync_import_observations_user_fkey
    foreign key (user_id) references auth.users(id) on delete cascade,
  constraint sync_import_observations_import_fkey
    foreign key (user_id, import_id)
    references public.sync_imports(user_id, id)
    on delete restrict,
  constraint sync_import_observations_observation_fkey
    foreign key (user_id, observation_id)
    references public.observations(user_id, id)
    on delete restrict,
  constraint sync_import_observations_legacy_length_check
    check (legacy_source_id is null or char_length(legacy_source_id) between 1 and 240)
);

create unique index sync_import_observations_legacy_key
  on public.sync_import_observations (user_id, import_id, legacy_source_id)
  where legacy_source_id is not null;

create index sync_import_observations_observation_idx
  on public.sync_import_observations (user_id, observation_id);

alter table public.sync_import_observations enable row level security;

create policy sync_import_observations_select_own
on public.sync_import_observations for select
to authenticated
using ((select auth.uid()) = user_id);

-- A stable mapping spans manifests for the same local dataset. It prevents a
-- legacy row from being rebound to another observation on a later retry.
create table public.sync_legacy_observation_map (
  user_id uuid not null,
  dataset_id uuid not null,
  legacy_source_id text not null,
  observation_id uuid not null,
  created_at timestamptz not null default now(),
  constraint sync_legacy_observation_map_pkey
    primary key (user_id, dataset_id, legacy_source_id),
  constraint sync_legacy_observation_map_user_fkey
    foreign key (user_id) references auth.users(id) on delete cascade,
  constraint sync_legacy_observation_map_observation_key
    unique (user_id, dataset_id, observation_id),
  constraint sync_legacy_observation_map_observation_fkey
    foreign key (user_id, observation_id)
    references public.observations(user_id, id)
    on delete restrict,
  constraint sync_legacy_observation_map_legacy_length_check
    check (char_length(legacy_source_id) between 1 and 240)
);

create index sync_legacy_observation_map_observation_idx
  on public.sync_legacy_observation_map (user_id, observation_id);

alter table public.sync_legacy_observation_map enable row level security;

create policy sync_legacy_observation_map_select_own
on public.sync_legacy_observation_map for select
to authenticated
using ((select auth.uid()) = user_id);

-- Abort rather than guessing if historical provenance is internally
-- contradictory. Under migration 006 these queries should return no rows.
do $$
begin
  if exists (
    select 1
    from public.observations observations
    join public.sync_imports imports
      on imports.user_id = observations.user_id
     and imports.id = observations.import_id
    where observations.legacy_source_id is not null
    group by observations.user_id, imports.dataset_id, observations.legacy_source_id
    having count(distinct observations.id) > 1
  ) then
    raise exception using errcode = '23505', message = 'legacy_source_maps_to_multiple_observations';
  end if;

  if exists (
    select 1
    from public.observations observations
    join public.sync_imports imports
      on imports.user_id = observations.user_id
     and imports.id = observations.import_id
    where observations.legacy_source_id is not null
    group by observations.user_id, imports.dataset_id, observations.id
    having count(distinct observations.legacy_source_id) > 1
  ) then
    raise exception using errcode = '23505', message = 'observation_maps_to_multiple_legacy_sources';
  end if;
end;
$$;

-- Backfill the original one-import provenance as one membership. No existing
-- observation, import marker, photo reference, discovery, or XP row changes.
insert into public.sync_import_observations (
  user_id,
  import_id,
  observation_id,
  legacy_source_id,
  confirmed_at
)
select
  observations.user_id,
  observations.import_id,
  observations.id,
  observations.legacy_source_id,
  coalesce(imports.created_at, observations.created_at)
from public.observations observations
join public.sync_imports imports
  on imports.user_id = observations.user_id
 and imports.id = observations.import_id
where observations.import_id is not null
on conflict (user_id, import_id, observation_id) do nothing;

insert into public.sync_legacy_observation_map (
  user_id,
  dataset_id,
  legacy_source_id,
  observation_id,
  created_at
)
select distinct
  observations.user_id,
  imports.dataset_id,
  observations.legacy_source_id,
  observations.id,
  coalesce(imports.created_at, observations.created_at)
from public.observations observations
join public.sync_imports imports
  on imports.user_id = observations.user_id
 and imports.id = observations.import_id
where observations.legacy_source_id is not null
on conflict (user_id, dataset_id, legacy_source_id) do nothing;

update public.sync_imports imports
set processed_observation_count = (
      select count(*)::integer
      from public.sync_import_observations links
      where links.user_id = imports.user_id
        and links.import_id = imports.id
    ),
    processed_photo_count = (
      select count(*)::integer
      from public.sync_import_observations links
      join public.observations observations
        on observations.user_id = links.user_id
       and observations.id = links.observation_id
      where links.user_id = imports.user_id
        and links.import_id = imports.id
        and observations.photo_path is not null
    );

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
  import_row public.sync_imports%rowtype;
  association_row public.sync_import_observations%rowtype;
  mapped_observation_id uuid;
  mapped_legacy_source_id text;
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
    select * into import_row
    from public.sync_imports imports
    where imports.user_id = current_user_id
      and imports.id = p_import_id
    for update;

    if not found then
      raise exception using errcode = 'P0001', message = 'sync_import_not_found';
    end if;
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('observation:' || current_user_id::text || ':' || p_observation_id::text, 0)
  );

  select * into observation_row
  from public.observations observations
  where observations.user_id = current_user_id
    and observations.id = p_observation_id
  for update;

  if found then
    if observation_row.species_id <> p_species_id
      or observation_row.variant_id is distinct from p_variant_id
      or observation_row.observed_at <> p_observed_at
      or observation_row.identification_method <> p_identification_method
    then
      raise exception using errcode = 'P0001', message = 'observation_identity_conflict';
    end if;

    if observation_row.species_confidence is distinct from p_species_confidence
      or observation_row.variant_confidence is distinct from p_variant_confidence
      or observation_row.notes is distinct from nullif(btrim(p_notes), '')
      or observation_row.custom_name is distinct from nullif(btrim(p_custom_name), '')
      or observation_row.client_created_at is distinct from p_client_created_at
      or observation_row.client_updated_at is distinct from p_client_updated_at
    then
      if p_import_id is not null and import_row.status = 'completed' then
        raise exception using errcode = 'P0001', message = 'sync_import_already_completed';
      end if;
      if p_expected_revision is null or observation_row.sync_revision <> p_expected_revision then
        raise exception using errcode = 'P0001', message = 'observation_revision_conflict';
      end if;

      update public.observations observations
      set species_confidence = p_species_confidence,
          variant_confidence = p_variant_confidence,
          notes = nullif(btrim(p_notes), ''),
          custom_name = nullif(btrim(p_custom_name), ''),
          client_created_at = p_client_created_at,
          client_updated_at = p_client_updated_at
      where observations.user_id = current_user_id
        and observations.id = p_observation_id
      returning * into observation_row;
    end if;
  else
    if p_import_id is not null and import_row.status <> 'pending' then
      raise exception using errcode = 'P0001', message = 'sync_import_already_completed';
    end if;

    insert into public.observations (
      id, user_id, species_id, variant_id, observed_at, identification_method,
      species_confidence, variant_confidence, notes, custom_name,
      client_created_at, client_updated_at, import_id, legacy_source_id
    ) values (
      p_observation_id, current_user_id, p_species_id, p_variant_id, p_observed_at,
      p_identification_method, p_species_confidence, p_variant_confidence,
      nullif(btrim(p_notes), ''), nullif(btrim(p_custom_name), ''),
      p_client_created_at, p_client_updated_at, p_import_id, p_legacy_source_id
    )
    returning * into observation_row;
  end if;

  if p_import_id is not null then
    perform pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended(
        'legacy-key:' || current_user_id::text || ':' || import_row.dataset_id::text || ':' || coalesce(p_legacy_source_id, ''),
        0
      )
    );
    perform pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended(
        'legacy-observation:' || current_user_id::text || ':' || import_row.dataset_id::text || ':' || p_observation_id::text,
        0
      )
    );

    if p_legacy_source_id is not null then
      select mappings.observation_id into mapped_observation_id
      from public.sync_legacy_observation_map mappings
      where mappings.user_id = current_user_id
        and mappings.dataset_id = import_row.dataset_id
        and mappings.legacy_source_id = p_legacy_source_id;

      if found and mapped_observation_id <> p_observation_id then
        raise exception using errcode = 'P0001', message = 'legacy_source_identity_conflict';
      end if;

      select mappings.legacy_source_id into mapped_legacy_source_id
      from public.sync_legacy_observation_map mappings
      where mappings.user_id = current_user_id
        and mappings.dataset_id = import_row.dataset_id
        and mappings.observation_id = p_observation_id;

      if found and mapped_legacy_source_id <> p_legacy_source_id then
        raise exception using errcode = 'P0001', message = 'observation_legacy_identity_conflict';
      end if;

      insert into public.sync_legacy_observation_map (
        user_id, dataset_id, legacy_source_id, observation_id
      ) values (
        current_user_id, import_row.dataset_id, p_legacy_source_id, p_observation_id
      )
      on conflict (user_id, dataset_id, legacy_source_id) do nothing;
    end if;

    select * into association_row
    from public.sync_import_observations links
    where links.user_id = current_user_id
      and links.import_id = p_import_id
      and links.observation_id = p_observation_id;

    if found and association_row.legacy_source_id is distinct from p_legacy_source_id then
      raise exception using errcode = 'P0001', message = 'sync_import_observation_conflict';
    end if;

    if not found then
      if import_row.status <> 'pending' then
        raise exception using errcode = 'P0001', message = 'sync_import_already_completed';
      end if;

      insert into public.sync_import_observations (
        user_id, import_id, observation_id, legacy_source_id
      ) values (
        current_user_id, p_import_id, p_observation_id, p_legacy_source_id
      );
    end if;

    update public.sync_imports imports
    set processed_observation_count = (
      select count(*)::integer
      from public.sync_import_observations links
      where links.user_id = current_user_id
        and links.import_id = p_import_id
    )
    where imports.user_id = current_user_id
      and imports.id = p_import_id;
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
  from public.observations observations
  where observations.user_id = current_user_id
    and observations.id = p_observation_id
  for update;

  if not found or observation_row.deleted_at is not null then
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

  update public.observations observations
  set photo_path = p_photo_path,
      photo_mime_type = p_photo_mime_type,
      photo_size_bytes = p_photo_size_bytes,
      photo_sha256 = p_photo_sha256
  where observations.user_id = current_user_id
    and observations.id = p_observation_id
  returning * into observation_row;

  update public.sync_imports imports
  set processed_photo_count = (
    select count(*)::integer
    from public.sync_import_observations links
    join public.observations linked_observations
      on linked_observations.user_id = links.user_id
     and linked_observations.id = links.observation_id
    where links.user_id = imports.user_id
      and links.import_id = imports.id
      and linked_observations.photo_path is not null
  )
  where imports.user_id = current_user_id
    and imports.status = 'pending'
    and exists (
      select 1
      from public.sync_import_observations links
      where links.user_id = current_user_id
        and links.import_id = imports.id
        and links.observation_id = p_observation_id
    );

  return observation_row;
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
  from public.sync_imports imports
  where imports.user_id = current_user_id
    and imports.id = p_import_id
  for update;

  if not found then
    raise exception using errcode = 'P0001', message = 'sync_import_not_found';
  end if;
  if import_row.status = 'completed' then
    return import_row;
  end if;

  select count(*)::integer,
         count(*) filter (where observations.photo_path is not null)::integer
    into observation_count, photo_count
  from public.sync_import_observations links
  join public.observations observations
    on observations.user_id = links.user_id
   and observations.id = links.observation_id
  where links.user_id = current_user_id
    and links.import_id = p_import_id;

  if observation_count <> import_row.expected_observation_count
    or photo_count <> import_row.expected_photo_count
    or import_row.processed_challenge_claim_count <> import_row.expected_challenge_claim_count
    or (import_row.expects_profile and import_row.profile_synced_at is null)
  then
    raise exception using errcode = 'P0001', message = 'sync_import_incomplete';
  end if;

  update public.sync_imports imports
  set processed_observation_count = observation_count,
      processed_photo_count = photo_count,
      status = 'completed',
      completed_at = now()
  where imports.user_id = current_user_id
    and imports.id = p_import_id
  returning * into import_row;

  return import_row;
end;
$$;

revoke all on table public.sync_import_observations from anon, authenticated;
revoke all on table public.sync_legacy_observation_map from anon, authenticated;

revoke all on function public.sync_observation(uuid, text, timestamptz, text, text, double precision, double precision, text, text, timestamptz, timestamptz, uuid, text, bigint) from public, anon, authenticated;
revoke all on function public.attach_observation_photo(uuid, text, text, bigint, text, bigint) from public, anon, authenticated;
revoke all on function public.complete_sync_import(uuid) from public, anon, authenticated;

grant execute on function public.sync_observation(uuid, text, timestamptz, text, text, double precision, double precision, text, text, timestamptz, timestamptz, uuid, text, bigint) to authenticated;
grant execute on function public.attach_observation_photo(uuid, text, text, bigint, text, bigint) to authenticated;
grant execute on function public.complete_sync_import(uuid) to authenticated;

commit;
