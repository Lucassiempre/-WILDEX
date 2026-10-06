-- READ ONLY. Verify the objects reviewed after migration 007.
-- This query reads PostgreSQL catalogs and does not change schema or data.
with expected_functions(
  schema_name,
  function_name,
  argument_types,
  return_type,
  security_definer,
  volatility,
  body_md5
) as (
  values
    ('private', 'bump_sync_revision', '', 'trigger', false, 'v', 'f3ebec5bed83fa2258135099777f496d'),
    ('private', 'protect_observation_sync_identity', '', 'trigger', false, 'v', 'e6085b8ae1e8d4b1a4bdf5335b8c1ef2'),
    ('private', 'challenge_objective_progress', 'uuid, text, text', 'integer', false, 's', 'd84e7b4aca0f9ee04c95d4d67d288673'),
    ('public', 'begin_sync_import', 'uuid, text, integer, integer, integer, integer, boolean, integer', 'sync_imports', true, 'v', '74c9c1ecfa0fa0ae203f18ef09caf1d6'),
    ('public', 'sync_observation', 'uuid, text, timestamp with time zone, text, text, double precision, double precision, text, text, timestamp with time zone, timestamp with time zone, uuid, text, bigint', 'observations', true, 'v', '1b28895bd594b7ac514d9815bfdb8e3b'),
    ('public', 'attach_observation_photo', 'uuid, text, text, bigint, text, bigint', 'observations', true, 'v', '1bf8b6ba1d2f688e5067e8cfd65735dd'),
    ('public', 'sync_profile', 'text, text, text, jsonb, text, text[], timestamp with time zone, uuid, bigint', 'jsonb', true, 'v', 'a0ab5f975b6d37c7a2d799afbb1c6e22'),
    ('public', 'claim_challenge', 'text, uuid, timestamp with time zone', 'jsonb', true, 'v', '894c8ab69e3806a183f57c40cb4e6559'),
    ('public', 'complete_sync_import', 'uuid', 'sync_imports', true, 'v', 'd1c7b99ec146c2b6490655adb54a0d56'),
    ('public', 'get_account_snapshot', '', 'jsonb', false, 's', '723e14da38601c60ca0beea822a169ac')
), actual_functions as (
  select
    namespaces.nspname as schema_name,
    functions.proname as function_name,
    pg_catalog.oidvectortypes(functions.proargtypes) as argument_types,
    pg_catalog.pg_get_function_result(functions.oid) as return_type,
    functions.prosecdef as security_definer,
    functions.provolatile::text as volatility,
    functions.proconfig as runtime_config,
    md5(
      pg_catalog.btrim(
        pg_catalog.regexp_replace(functions.prosrc, '\s+', ' ', 'g')
      )
    ) as body_md5,
    pg_catalog.has_function_privilege('anon', functions.oid, 'execute') as anon_can_execute,
    pg_catalog.has_function_privilege('authenticated', functions.oid, 'execute') as authenticated_can_execute
  from pg_catalog.pg_proc functions
  join pg_catalog.pg_namespace namespaces
    on namespaces.oid = functions.pronamespace
  where namespaces.nspname in ('public', 'private')
    and functions.proname in (select expected.function_name from expected_functions expected)
), photo_constraint as (
  select lower(pg_catalog.pg_get_constraintdef(constraints.oid, true)) as definition
  from pg_catalog.pg_constraint constraints
  join pg_catalog.pg_class tables on tables.oid = constraints.conrelid
  join pg_catalog.pg_namespace namespaces on namespaces.oid = tables.relnamespace
  where namespaces.nspname = 'public'
    and tables.relname = 'observations'
    and constraints.conname = 'observations_photo_metadata_complete_check'
), featured_badge_index as (
  select
    indexes.indisunique,
    array(
      select attributes.attname
      from unnest(indexes.indkey) with ordinality as keys(attribute_number, ordinality)
      join pg_catalog.pg_attribute attributes
        on attributes.attrelid = indexes.indrelid
       and attributes.attnum = keys.attribute_number
      where keys.ordinality <= indexes.indnkeyatts
      order by keys.ordinality
    ) as key_columns,
    lower(pg_catalog.pg_get_expr(indexes.indpred, indexes.indrelid)) as predicate
  from pg_catalog.pg_index indexes
  join pg_catalog.pg_class index_relations on index_relations.oid = indexes.indexrelid
  join pg_catalog.pg_class tables on tables.oid = indexes.indrelid
  join pg_catalog.pg_namespace namespaces on namespaces.oid = tables.relnamespace
  where namespaces.nspname = 'public'
    and tables.relname = 'profile_featured_badges'
    and index_relations.relname = 'profile_featured_badges_active_position_key'
), report(section, object_name, status, expected, actual) as (
  select
    'function',
    expected.schema_name || '.' || expected.function_name || '(' || expected.argument_types || ')',
    case
      when actual.function_name is null then 'missing'
      when actual.return_type not in (expected.return_type, 'public.' || expected.return_type)
        or actual.security_definer is distinct from expected.security_definer
        or actual.volatility <> expected.volatility
        or actual.body_md5 <> expected.body_md5
        or not exists (
          select 1
          from unnest(coalesce(actual.runtime_config, array[]::text[])) config_entry
          where config_entry in ('search_path=""', 'search_path=')
        )
        or (expected.schema_name = 'public' and (actual.anon_can_execute or not actual.authenticated_can_execute))
        or (expected.schema_name = 'private' and (actual.anon_can_execute or actual.authenticated_can_execute))
      then 'different'
      else 'match'
    end,
    'body_md5=' || expected.body_md5 || '; expected signature/security/ACL from current 006',
    case when actual.function_name is null then 'absent'
      else 'body_md5=' || actual.body_md5 || '; returns=' || actual.return_type ||
        '; security_definer=' || actual.security_definer::text ||
        '; volatility=' || actual.volatility ||
        '; config=' || coalesce(array_to_string(actual.runtime_config, ','), 'none') ||
        '; anon_execute=' || actual.anon_can_execute::text ||
        '; authenticated_execute=' || actual.authenticated_can_execute::text end
  from expected_functions expected
  left join actual_functions actual
    on actual.schema_name = expected.schema_name
   and actual.function_name = expected.function_name
   and actual.argument_types = expected.argument_types

  union all

  select
    'constraint',
    'public.observations.observations_photo_metadata_complete_check',
    case
      when constraint_state.definition is null then 'missing'
      when constraint_state.definition not like '%photo_path =%'
        or constraint_state.definition not like '%user_id::text%'
        or constraint_state.definition not like '%id::text%'
        or constraint_state.definition not like '%photo_sha256%'
        or constraint_state.definition not like '%image/jpeg%'
        or constraint_state.definition not like '%image/png%'
        or constraint_state.definition not like '%image/webp%'
      then 'different'
      else 'match'
    end,
    'photo path is user_id/observation_id/sha256 with an allowed extension',
    coalesce(constraint_state.definition, 'absent')
  from (select max(definition) as definition from photo_constraint) constraint_state

  union all

  select
    'index',
    'public.profile_featured_badges.profile_featured_badges_active_position_key',
    case
      when index_state.key_columns is null then 'missing'
      when not index_state.indisunique
        or index_state.key_columns <> array['user_id', 'position']::name[]
        or index_state.predicate not like '%removed_at is null%'
      then 'different'
      else 'match'
    end,
    'unique (user_id, position) where removed_at is null',
    case when index_state.key_columns is null then 'absent'
      else 'unique=' || index_state.indisunique::text ||
        '; columns=' || index_state.key_columns::text ||
        '; predicate=' || coalesce(index_state.predicate, 'none') end
  from (
    select
      (select indisunique from featured_badge_index limit 1) as indisunique,
      (select key_columns from featured_badge_index limit 1) as key_columns,
      (select predicate from featured_badge_index limit 1) as predicate
  ) index_state
), final_report as (
  select section, object_name, status, expected, actual
  from report

  union all

  select
    'summary',
    'migration-007-reconciliation',
    case when bool_and(status = 'match') then 'match' else 'review-required' end,
    'all 12 reviewed objects match current migration 006',
    count(*) filter (where status = 'match')::text || '/' || count(*)::text || ' checks match'
  from report
)
select section, object_name, status, expected, actual
from final_report
order by
  case status when 'missing' then 1 when 'different' then 2 when 'review-required' then 3 when 'match' then 4 else 5 end,
  section,
  object_name;
