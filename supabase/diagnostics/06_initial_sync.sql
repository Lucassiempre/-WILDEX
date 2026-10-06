-- READ ONLY. Run after applying 202609280006_initial_sync.sql.
with expected_rpcs(function_name, security_definer) as (
  values
    ('begin_sync_import', true),
    ('sync_observation', true),
    ('attach_observation_photo', true),
    ('sync_profile', true),
    ('claim_challenge', true),
    ('complete_sync_import', true),
    ('get_account_snapshot', false)
), rpc_state as (
  select
    expected.function_name,
    expected.security_definer as expected_security_definer,
    functions.oid,
    functions.prosecdef as actual_security_definer,
    pg_get_function_identity_arguments(functions.oid) as identity_arguments,
    pg_get_functiondef(functions.oid) as definition,
    case when functions.oid is null then false
      else has_function_privilege('anon', functions.oid, 'execute') end as anon_can_execute,
    case when functions.oid is null then false
      else has_function_privilege('authenticated', functions.oid, 'execute') end as authenticated_can_execute
  from expected_rpcs expected
  left join pg_catalog.pg_namespace namespaces on namespaces.nspname = 'public'
  left join pg_catalog.pg_proc functions
    on functions.pronamespace = namespaces.oid
   and functions.proname = expected.function_name
), private_function_state as (
  select
    functions.proname as function_name,
    pg_get_function_identity_arguments(functions.oid) as identity_arguments,
    has_function_privilege('anon', functions.oid, 'execute') as anon_can_execute,
    has_function_privilege('authenticated', functions.oid, 'execute') as authenticated_can_execute,
    pg_get_functiondef(functions.oid) as definition
  from pg_catalog.pg_proc functions
  join pg_catalog.pg_namespace namespaces on namespaces.oid = functions.pronamespace
  where namespaces.nspname = 'private'
), table_state as (
  select
    tables.relname as table_name,
    tables.relrowsecurity as rls_enabled,
    tables.relforcerowsecurity as rls_forced
  from pg_catalog.pg_class tables
  join pg_catalog.pg_namespace namespaces on namespaces.oid = tables.relnamespace
  where namespaces.nspname = 'public'
    and tables.relkind = 'r'
), column_state as (
  select
    tables.relname as table_name,
    columns.attname as column_name,
    format_type(columns.atttypid, columns.atttypmod) as data_type,
    columns.attnotnull as not_null
  from pg_catalog.pg_attribute columns
  join pg_catalog.pg_class tables on tables.oid = columns.attrelid
  join pg_catalog.pg_namespace namespaces on namespaces.oid = tables.relnamespace
  where namespaces.nspname = 'public'
    and not columns.attisdropped
    and columns.attnum > 0
), constraint_state as (
  select
    tables.relname as table_name,
    constraints.conname as constraint_name,
    constraints.contype as constraint_type,
    pg_get_constraintdef(constraints.oid, true) as definition
  from pg_catalog.pg_constraint constraints
  join pg_catalog.pg_class tables on tables.oid = constraints.conrelid
  join pg_catalog.pg_namespace namespaces on namespaces.oid = tables.relnamespace
  where namespaces.nspname = 'public'
), index_state as (
  select schemaname, tablename, indexname, indexdef
  from pg_catalog.pg_indexes
  where schemaname = 'public'
), policy_state as (
  select
    schemaname,
    tablename,
    policyname,
    lower(cmd) as command,
    lower(coalesce(qual, '')) as using_expression,
    lower(coalesce(with_check, '')) as check_expression
  from pg_catalog.pg_policies
), original_tables(table_name) as (
  values
    ('species'), ('species_variants'), ('thematic_collections'),
    ('thematic_collection_species'), ('profiles'), ('observations'),
    ('badges'), ('challenges'), ('challenge_objectives'),
    ('user_species_discoveries'), ('user_variant_discoveries'), ('xp_events'),
    ('challenge_claims'), ('user_badges'), ('profile_featured_badges')
), original_functions(function_name) as (
  values
    ('set_updated_at'),
    ('create_profile_for_new_user'),
    ('protect_observation_identity'),
    ('award_observation_discoveries')
), original_triggers(trigger_name) as (
  values
    ('species_set_updated_at'),
    ('species_variants_set_updated_at'),
    ('thematic_collections_set_updated_at'),
    ('profiles_set_updated_at'),
    ('observations_set_updated_at'),
    ('create_profile_after_signup'),
    ('challenges_set_updated_at'),
    ('observations_protect_identity'),
    ('observations_award_discoveries')
), expected_new_constraints(constraint_name) as (
  values
    ('profiles_username_length_check'),
    ('profiles_display_name_length_check'),
    ('profiles_bio_length_check'),
    ('observations_import_owner_fkey'),
    ('observations_legacy_source_requires_import_check'),
    ('observations_photo_metadata_complete_check')
), expected_new_indexes(index_name) as (
  values
    ('observations_import_legacy_source_key'),
    ('observations_user_updated_at_idx'),
    ('sync_imports_user_updated_at_idx'),
    ('profile_featured_badges_active_position_key')
), executable_public_functions as (
  select
    functions.proname as function_name,
    pg_get_function_identity_arguments(functions.oid) as identity_arguments
  from pg_catalog.pg_proc functions
  join pg_catalog.pg_namespace namespaces on namespaces.oid = functions.pronamespace
  where namespaces.nspname = 'public'
    and has_function_privilege('authenticated', functions.oid, 'execute')
), direct_write_grants as (
  select grantee, table_name, privilege_type
  from information_schema.role_table_grants
  where grantee in ('anon', 'authenticated')
    and table_schema = 'public'
    and table_name in ('profiles', 'observations', 'profile_featured_badges', 'sync_imports', 'sync_import_challenge_claims')
    and privilege_type in ('INSERT', 'UPDATE', 'DELETE', 'TRUNCATE')
), original_trigger_state as (
  select
    expected.trigger_name,
    triggers.oid,
    triggers.tgenabled
  from original_triggers expected
  left join pg_catalog.pg_trigger triggers
    on triggers.tgname = expected.trigger_name
   and not triggers.tgisinternal
), checks(check_name, passed, details) as (
  select
    'sync_imports_created',
    to_regclass('public.sync_imports') is not null
      and to_regclass('public.sync_import_challenge_claims') is not null,
    coalesce((
      select string_agg(row_to_json(state)::text, E'\n' order by table_name)
      from table_state state
      where table_name in ('sync_imports', 'sync_import_challenge_claims')
    ), 'Tablas ausentes')

  union all

  select
    'sync_columns_created',
    (
      select count(*) = 12
      from column_state
      where (table_name, column_name) in (
        ('profiles', 'sync_revision'),
        ('profiles', 'client_updated_at'),
        ('observations', 'sync_revision'),
        ('observations', 'client_updated_at'),
        ('observations', 'import_id'),
        ('observations', 'legacy_source_id'),
        ('profile_featured_badges', 'removed_at'),
        ('sync_imports', 'manifest_sha256'),
        ('sync_imports', 'expected_challenge_claim_count'),
        ('sync_imports', 'processed_challenge_claim_count'),
        ('sync_imports', 'expects_profile'),
        ('sync_imports', 'profile_synced_at')
      )
    ),
    coalesce((
      select string_agg(table_name || '.' || column_name || ':' || data_type, ', ' order by table_name, column_name)
      from column_state
      where table_name in ('profiles', 'observations', 'profile_featured_badges', 'sync_imports')
        and column_name in (
          'sync_revision', 'client_updated_at', 'import_id', 'legacy_source_id',
          'removed_at', 'manifest_sha256', 'expected_challenge_claim_count',
          'processed_challenge_claim_count', 'expects_profile', 'profile_synced_at'
        )
    ), 'Columnas ausentes')

  union all

  select
    'sync_imports_rls_enabled',
    coalesce((
      select count(*) = 2 and bool_and(rls_enabled)
      from table_state
      where table_name in ('sync_imports', 'sync_import_challenge_claims')
    ), false),
    coalesce((
      select string_agg(table_name || ': rls=' || rls_enabled::text || ', forced=' || rls_forced::text, E'\n' order by table_name)
      from table_state
      where table_name in ('sync_imports', 'sync_import_challenge_claims')
    ), 'Tablas ausentes')

  union all

  select
    'sync_imports_select_policy_scoped',
    (
      select count(*) = 2 and bool_and(using_expression like '%auth.uid()%' and using_expression like '%user_id%')
      from policy_state
      where schemaname = 'public'
        and tablename in ('sync_imports', 'sync_import_challenge_claims')
        and policyname in ('sync_imports_select_own', 'sync_import_challenge_claims_select_own')
        and command = 'select'
    ),
    coalesce((
      select string_agg(policyname || ': ' || using_expression, E'\n' order by policyname)
      from policy_state
      where schemaname = 'public'
        and policyname in ('sync_imports_select_own', 'sync_import_challenge_claims_select_own')
    ), 'Políticas ausentes')

  union all

  select
    'sync_constraints_created',
    not exists (
      select 1 from expected_new_constraints expected
      where not exists (select 1 from constraint_state actual where actual.constraint_name = expected.constraint_name)
    ),
    coalesce((
      select string_agg(constraint_name || ': ' || definition, E'\n' order by constraint_name)
      from constraint_state
      where constraint_name in (select constraint_name from expected_new_constraints)
    ), 'Constraints ausentes')

  union all

  select
    'sync_indexes_created',
    not exists (
      select 1 from expected_new_indexes expected
      where not exists (select 1 from index_state actual where actual.indexname = expected.index_name)
    ),
    coalesce((
      select string_agg(indexname || ': ' || indexdef, E'\n' order by indexname)
      from index_state
      where indexname in (select index_name from expected_new_indexes)
    ), 'Índices ausentes')

  union all

  select
    'rpc_objects_created',
    count(*) = 7 and bool_and(oid is not null),
    string_agg(function_name || '(' || coalesce(identity_arguments, '') || ')', E'\n' order by function_name)
  from rpc_state

  union all

  select
    'rpc_security_and_search_path',
    bool_and(
      oid is not null
      and actual_security_definer = expected_security_definer
      and lower(definition) like '%set search_path to ''''%'
    ),
    string_agg(
      function_name || ': expected_definer=' || expected_security_definer::text ||
      ', actual_definer=' || coalesce(actual_security_definer::text, 'missing'),
      E'\n' order by function_name
    )
  from rpc_state

  union all

  select
    'anon_cannot_execute_sync_rpcs',
    bool_and(not anon_can_execute),
    string_agg(function_name || ': anon=' || anon_can_execute::text, ', ' order by function_name)
  from rpc_state

  union all

  select
    'authenticated_can_execute_expected_rpcs',
    bool_and(authenticated_can_execute),
    string_agg(function_name || ': authenticated=' || authenticated_can_execute::text, ', ' order by function_name)
  from rpc_state

  union all

  select
    'authenticated_has_no_unexpected_public_rpc',
    not exists (
      select 1 from executable_public_functions executable
      where executable.function_name not in (select function_name from expected_rpcs)
    ),
    coalesce((
      select string_agg(function_name || '(' || identity_arguments || ')', E'\n' order by function_name, identity_arguments)
      from executable_public_functions
    ), 'Sin funciones públicas ejecutables')

  union all

  select
    'private_functions_not_client_executable',
    not exists (
      select 1 from private_function_state
      where anon_can_execute or authenticated_can_execute
    ),
    coalesce((
      select string_agg(
        function_name || '(' || identity_arguments || '): anon=' || anon_can_execute::text || ', authenticated=' || authenticated_can_execute::text,
        E'\n' order by function_name, identity_arguments
      )
      from private_function_state
    ), 'No se encontraron funciones privadas')

  union all

  select
    'direct_client_writes_revoked',
    not exists (select 1 from direct_write_grants),
    coalesce((
      select string_agg(grantee || ':' || table_name || ':' || privilege_type, ', ' order by grantee, table_name, privilege_type)
      from direct_write_grants
    ), 'Sin grants directos de escritura')

  union all

  select
    'storage_policies_require_observation',
    (
      select count(*) = 2
        and bool_and(
          (command = 'select' and using_expression like '%public.observations%' and using_expression like '%owner_id%')
          or (command = 'insert' and check_expression like '%public.observations%')
        )
      from policy_state
      where schemaname = 'storage'
        and tablename = 'objects'
        and policyname in ('observation_photos_select_own', 'observation_photos_insert_own')
    ),
    coalesce((
      select string_agg(policyname || ': ' || command || E'\nUSING=' || using_expression || E'\nCHECK=' || check_expression, E'\n' order by policyname)
      from policy_state
      where schemaname = 'storage' and tablename = 'objects' and policyname like 'observation_photos_%'
    ), 'Políticas ausentes')

  union all

  select
    'storage_has_no_update_or_delete_policy',
    not exists (
      select 1 from policy_state
      where schemaname = 'storage'
        and tablename = 'objects'
        and policyname like 'observation_photos_%'
        and command in ('update', 'delete')
    ),
    coalesce((
      select string_agg(policyname || ':' || command, ', ' order by policyname)
      from policy_state
      where schemaname = 'storage' and tablename = 'objects' and policyname like 'observation_photos_%'
    ), 'Sin políticas de fotografías')

  union all

  select
    'original_tables_001_005_intact',
    not exists (
      select 1 from original_tables expected
      where to_regclass('public.' || expected.table_name) is null
    ),
    string_agg(table_name || '=' || (to_regclass('public.' || table_name) is not null)::text, ', ' order by table_name)
  from original_tables

  union all

  select
    'original_private_functions_001_005_intact',
    not exists (
      select 1 from original_functions expected
      where not exists (
        select 1 from private_function_state actual where actual.function_name = expected.function_name
      )
    ),
    string_agg(function_name, ', ' order by function_name)
  from private_function_state
  where function_name in (select function_name from original_functions)

  union all

  select
    'original_triggers_001_005_enabled',
    count(*) = 9 and bool_and(oid is not null and tgenabled <> 'D'),
    string_agg(trigger_name || '=' || coalesce(tgenabled::text, 'missing'), ', ' order by trigger_name)
  from original_trigger_state

  union all

  select
    'xp_trigger_still_attached',
    exists (
      select 1
      from pg_catalog.pg_trigger triggers
      join pg_catalog.pg_class tables on tables.oid = triggers.tgrelid
      join pg_catalog.pg_namespace namespaces on namespaces.oid = tables.relnamespace
      where namespaces.nspname = 'public'
        and tables.relname = 'observations'
        and triggers.tgname = 'observations_award_discoveries'
        and not triggers.tgisinternal
        and triggers.tgenabled <> 'D'
    ),
    'El trigger observations_award_discoveries debe permanecer habilitado'
)
select check_name, passed, details
from checks
order by check_name;
