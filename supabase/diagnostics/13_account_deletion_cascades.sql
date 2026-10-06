-- Read-only verification for migration 009.
with expected(
  constraint_name,
  table_name,
  expected_delete_action,
  expected_deferrable,
  expected_initially_deferred
) as (
  values
    ('observations_import_owner_fkey', 'observations', 'a', true, true),
    ('challenge_claims_user_id_xp_event_id_fkey', 'challenge_claims', 'a', true, true),
    ('sync_import_challenge_claims_user_id_import_id_fkey', 'sync_import_challenge_claims', 'c', false, false),
    ('sync_import_challenge_claims_user_id_challenge_id_fkey', 'sync_import_challenge_claims', 'c', false, false),
    ('sync_import_observations_import_fkey', 'sync_import_observations', 'c', false, false),
    ('sync_import_observations_observation_fkey', 'sync_import_observations', 'c', false, false),
    ('sync_legacy_observation_map_observation_fkey', 'sync_legacy_observation_map', 'c', false, false)
), actual as (
  select
    constraints.conname::text as constraint_name,
    relations.relname::text as table_name,
    constraints.confdeltype::text as actual_delete_action,
    constraints.condeferrable as actual_deferrable,
    constraints.condeferred as actual_initially_deferred
  from pg_catalog.pg_constraint constraints
  join pg_catalog.pg_class relations on relations.oid = constraints.conrelid
  join pg_catalog.pg_namespace namespaces on namespaces.oid = relations.relnamespace
  where namespaces.nspname = 'public' and constraints.contype = 'f'
), checks as (
  select
    expected.constraint_name,
    actual.constraint_name is not null
      and actual.table_name = expected.table_name
      and actual.actual_delete_action = expected.expected_delete_action
      and actual.actual_deferrable = expected.expected_deferrable
      and actual.actual_initially_deferred = expected.expected_initially_deferred as passed,
    coalesce(
      actual.table_name || ': delete=' || actual.actual_delete_action || ', deferrable=' || actual.actual_deferrable::text || ', deferred=' || actual.actual_initially_deferred::text,
      'missing'
    ) as details
  from expected
  left join actual using (constraint_name)
), auth_owned(table_name) as (
  values
    ('profiles'), ('observations'), ('user_species_discoveries'), ('user_variant_discoveries'),
    ('xp_events'), ('challenge_claims'), ('user_badges'), ('sync_imports'),
    ('sync_import_challenge_claims'), ('sync_import_observations'), ('sync_legacy_observation_map')
), auth_checks as (
  select
    'auth.users cascade: ' || auth_owned.table_name as constraint_name,
    exists (
      select 1
      from pg_catalog.pg_constraint constraints
      join pg_catalog.pg_class relations on relations.oid = constraints.conrelid
      join pg_catalog.pg_namespace namespaces on namespaces.oid = relations.relnamespace
      where namespaces.nspname = 'public'
        and relations.relname = auth_owned.table_name
        and constraints.contype = 'f'
        and constraints.confrelid = 'auth.users'::regclass
        and constraints.confdeltype = 'c'
    ) as passed,
    'direct owner FK must use ON DELETE CASCADE' as details
  from auth_owned
), indirect_checks as (
  select
    'profile_featured_badges cascades through profiles and user_badges' as constraint_name,
    count(*) = 2 and bool_and(constraints.confdeltype = 'c') as passed,
    'both private parent relationships must use ON DELETE CASCADE' as details
  from pg_catalog.pg_constraint constraints
  join pg_catalog.pg_class relations on relations.oid = constraints.conrelid
  join pg_catalog.pg_namespace namespaces on namespaces.oid = relations.relnamespace
  where namespaces.nspname = 'public'
    and relations.relname = 'profile_featured_badges'
    and constraints.contype = 'f'
    and constraints.confrelid in ('public.profiles'::regclass, 'public.user_badges'::regclass)
)
select * from checks
union all
select * from auth_checks
union all
select * from indirect_checks
union all
select
  'all_account_deletion_checks_pass' as constraint_name,
  bool_and(passed) as passed,
  count(*) filter (where passed)::text || '/' || count(*)::text || ' checks passed' as details
from (
  select passed from checks
  union all
  select passed from auth_checks
  union all
  select passed from indirect_checks
) combined;
