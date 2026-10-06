-- Read-only verification for migration 008.
-- Run after 202610050008_composite_observation_identity.sql.

with
observation_pk as (
  select
    constraints.conname,
    pg_catalog.pg_get_constraintdef(constraints.oid, true) as definition
  from pg_catalog.pg_constraint constraints
  where constraints.conrelid = 'public.observations'::regclass
    and constraints.contype = 'p'
),
observation_uniques as (
  select pg_catalog.pg_get_constraintdef(constraints.oid, true) as definition
  from pg_catalog.pg_constraint constraints
  where constraints.conrelid = 'public.observations'::regclass
    and constraints.contype in ('p', 'u')
),
observation_fk_inventory as (
  select
    source_ns.nspname || '.' || source.relname as source_table,
    constraints.conname,
    pg_catalog.pg_get_constraintdef(constraints.oid, true) as definition
  from pg_catalog.pg_constraint constraints
  join pg_catalog.pg_class source on source.oid = constraints.conrelid
  join pg_catalog.pg_namespace source_ns on source_ns.oid = source.relnamespace
  where constraints.contype = 'f'
    and constraints.confrelid = 'public.observations'::regclass
),
expected_observation_fks(source_table, constraint_name, expected_fragment) as (
  values
    ('public.user_species_discoveries', 'user_species_discoveries_first_observation_fkey', 'FOREIGN KEY (user_id, first_observation_id) REFERENCES observations(user_id, id) ON DELETE SET NULL (first_observation_id)'),
    ('public.user_variant_discoveries', 'user_variant_discoveries_first_observation_fkey', 'FOREIGN KEY (user_id, first_observation_id) REFERENCES observations(user_id, id) ON DELETE SET NULL (first_observation_id)'),
    ('public.xp_events', 'xp_events_observation_fkey', 'FOREIGN KEY (user_id, observation_id) REFERENCES observations(user_id, id) ON DELETE SET NULL (observation_id)'),
    ('public.sync_import_observations', 'sync_import_observations_observation_fkey', 'FOREIGN KEY (user_id, observation_id) REFERENCES observations(user_id, id) ON DELETE RESTRICT'),
    ('public.sync_legacy_observation_map', 'sync_legacy_observation_map_observation_fkey', 'FOREIGN KEY (user_id, observation_id) REFERENCES observations(user_id, id) ON DELETE RESTRICT')
),
expected_identity_constraints(table_name, constraint_name, expected_definition) as (
  values
    ('sync_import_observations', 'sync_import_observations_pkey', 'PRIMARY KEY (user_id, import_id, observation_id)'),
    ('sync_import_observations', 'sync_import_observations_user_fkey', 'FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE'),
    ('sync_import_observations', 'sync_import_observations_import_fkey', 'FOREIGN KEY (user_id, import_id) REFERENCES sync_imports(user_id, id) ON DELETE RESTRICT'),
    ('sync_import_observations', 'sync_import_observations_observation_fkey', 'FOREIGN KEY (user_id, observation_id) REFERENCES observations(user_id, id) ON DELETE RESTRICT'),
    ('sync_import_observations', 'sync_import_observations_legacy_length_check', 'CHECK (legacy_source_id IS NULL OR char_length(legacy_source_id) >= 1 AND char_length(legacy_source_id) <= 240)'),
    ('sync_legacy_observation_map', 'sync_legacy_observation_map_pkey', 'PRIMARY KEY (user_id, dataset_id, legacy_source_id)'),
    ('sync_legacy_observation_map', 'sync_legacy_observation_map_user_fkey', 'FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE'),
    ('sync_legacy_observation_map', 'sync_legacy_observation_map_observation_key', 'UNIQUE (user_id, dataset_id, observation_id)'),
    ('sync_legacy_observation_map', 'sync_legacy_observation_map_observation_fkey', 'FOREIGN KEY (user_id, observation_id) REFERENCES observations(user_id, id) ON DELETE RESTRICT'),
    ('sync_legacy_observation_map', 'sync_legacy_observation_map_legacy_length_check', 'CHECK (char_length(legacy_source_id) >= 1 AND char_length(legacy_source_id) <= 240)')
),
identity_constraint_state as (
  select
    expected.table_name,
    expected.constraint_name,
    expected.expected_definition,
    pg_catalog.pg_get_constraintdef(constraints.oid, true) as actual_definition
  from expected_identity_constraints expected
  left join pg_catalog.pg_constraint constraints
    on constraints.conrelid = pg_catalog.to_regclass('public.' || expected.table_name)
   and constraints.conname = expected.constraint_name
),
expected_tables(table_name) as (
  values ('sync_import_observations'), ('sync_legacy_observation_map')
),
expected_indexes(index_name) as (
  values
    ('sync_import_observations_pkey'),
    ('sync_import_observations_legacy_key'),
    ('sync_import_observations_observation_idx'),
    ('sync_legacy_observation_map_pkey'),
    ('sync_legacy_observation_map_observation_key'),
    ('sync_legacy_observation_map_observation_idx'),
    ('user_species_discoveries_first_observation_idx'),
    ('user_variant_discoveries_first_observation_idx'),
    ('xp_events_observation_idx')
),
expected_policies(table_name, policy_name) as (
  values
    ('sync_import_observations', 'sync_import_observations_select_own'),
    ('sync_legacy_observation_map', 'sync_legacy_observation_map_select_own')
),
expected_functions(function_name, identity_arguments, required_fragments) as (
  values
    (
      'sync_observation',
      'uuid, text, timestamp with time zone, text, text, double precision, double precision, text, text, timestamp with time zone, timestamp with time zone, uuid, text, bigint',
      array[
        'observations.user_id = current_user_id',
        'observations.id = p_observation_id',
        'insert into public.sync_import_observations',
        'insert into public.sync_legacy_observation_map',
        'legacy_source_identity_conflict'
      ]::text[]
    ),
    (
      'attach_observation_photo',
      'uuid, text, text, bigint, text, bigint',
      array[
        'observations.user_id = current_user_id',
        'observations.id = p_observation_id',
        'from public.sync_import_observations links'
      ]::text[]
    ),
    (
      'complete_sync_import',
      'uuid',
      array[
        'imports.user_id = current_user_id',
        'from public.sync_import_observations links',
        'observations.user_id = links.user_id',
        'observations.id = links.observation_id'
      ]::text[]
    )
),
function_state as (
  select
    expected.function_name,
    expected.identity_arguments,
    functions.oid,
    functions.prosecdef,
    functions.proconfig,
    functions.prosrc,
    expected.required_fragments,
    pg_catalog.has_function_privilege(
      'anon',
      functions.oid,
      'EXECUTE'
    ) as anon_execute,
    pg_catalog.has_function_privilege(
      'authenticated',
      functions.oid,
      'EXECUTE'
    ) as authenticated_execute
  from expected_functions expected
  left join pg_catalog.pg_proc functions
    on functions.pronamespace = 'public'::regnamespace
   and functions.proname = expected.function_name
   and pg_catalog.pg_get_function_identity_arguments(functions.oid) = expected.identity_arguments
),
checks(check_name, passed, details) as (
  select
    'observations_composite_primary_key',
    count(*) = 1
      and bool_and(definition = 'PRIMARY KEY (user_id, id)'),
    coalesce(string_agg(conname || ': ' || definition, '; '), 'missing')
  from observation_pk

  union all

  select
    'observations_has_no_global_id_unique',
    not exists (
      select 1 from observation_uniques
      where definition in ('PRIMARY KEY (id)', 'UNIQUE (id)')
    ) and not exists (
      select 1
      from pg_catalog.pg_index indexes
      where indexes.indrelid = 'public.observations'::regclass
        and indexes.indisunique
        and indexes.indnkeyatts = 1
        and pg_catalog.pg_get_indexdef(indexes.indexrelid, 0, true) ~ '\(id\)$'
    ),
    coalesce(string_agg(definition, '; '), 'no primary/unique constraints') ||
      '; standalone_id_unique_indexes=' || (
        select count(*)::text
        from pg_catalog.pg_index indexes
        where indexes.indrelid = 'public.observations'::regclass
          and indexes.indisunique
          and indexes.indnkeyatts = 1
          and pg_catalog.pg_get_indexdef(indexes.indexrelid, 0, true) ~ '\(id\)$'
      )
  from observation_uniques

  union all

  select
    'all_observation_fks_are_expected_and_composite',
    (select count(*) from observation_fk_inventory) = (select count(*) from expected_observation_fks)
      and not exists (
        select 1
        from expected_observation_fks expected
        left join observation_fk_inventory actual
          on actual.source_table = expected.source_table
         and actual.conname = expected.constraint_name
        where actual.conname is null
          or actual.definition <> expected.expected_fragment
      )
      and not exists (
        select 1
        from observation_fk_inventory actual
        left join expected_observation_fks expected
          on expected.source_table = actual.source_table
         and expected.constraint_name = actual.conname
        where expected.constraint_name is null
      ),
    coalesce((
      select string_agg(source_table || '.' || conname || ': ' || definition, E'\n' order by source_table, conname)
      from observation_fk_inventory
    ), 'no foreign keys found')

  union all

  select
    'sync_identity_tables_exist',
    bool_and(pg_catalog.to_regclass('public.' || table_name) is not null),
    string_agg(table_name || '=' || (pg_catalog.to_regclass('public.' || table_name) is not null)::text, ', ')
  from expected_tables

  union all

  select
    'sync_identity_tables_have_rls',
    bool_and(classes.relrowsecurity),
    string_agg(expected.table_name || '=' || coalesce(classes.relrowsecurity::text, 'missing'), ', ')
  from expected_tables expected
  left join pg_catalog.pg_class classes
    on classes.relnamespace = 'public'::regnamespace
   and classes.relname = expected.table_name

  union all

  select
    'sync_identity_constraints_match',
    count(*) = 10 and bool_and(actual_definition = expected_definition),
    string_agg(table_name || '.' || constraint_name || '=' ||
      coalesce(actual_definition, 'missing') || ' expected=' || expected_definition, E'\n')
  from identity_constraint_state

  union all

  select
    'sync_identity_indexes_exist',
    bool_and(indexes.indexname is not null),
    string_agg(expected.index_name || '=' || (indexes.indexname is not null)::text, ', ')
  from expected_indexes expected
  left join pg_catalog.pg_indexes indexes
    on indexes.schemaname = 'public'
   and indexes.indexname = expected.index_name

  union all

  select
    'sync_identity_select_policies_exist',
    bool_and(policies.policyname is not null and policies.cmd = 'SELECT'
      and policies.roles = array['authenticated']::name[]
      and policies.qual like '%auth.uid()%user_id%'),
    string_agg(expected.table_name || '.' || expected.policy_name || '=' ||
      coalesce(policies.cmd || ':' || policies.qual, 'missing'), E'\n')
  from expected_policies expected
  left join pg_catalog.pg_policies policies
    on policies.schemaname = 'public'
   and policies.tablename = expected.table_name
   and policies.policyname = expected.policy_name

  union all

  select
    'sync_identity_tables_have_no_client_table_privileges',
    not exists (
      select 1
      from expected_tables expected
      cross join (values ('anon'), ('authenticated')) roles(role_name)
      cross join (values ('SELECT'), ('INSERT'), ('UPDATE'), ('DELETE'), ('TRUNCATE'), ('REFERENCES'), ('TRIGGER')) privileges(privilege_name)
      where pg_catalog.has_table_privilege(
        roles.role_name,
        'public.' || expected.table_name,
        privileges.privilege_name
      )
    ),
    'anon/authenticated have no effective direct table privileges'

  union all

  select
    'preexisting_private_tables_keep_rls',
    count(*) = 4 and bool_and(classes.relrowsecurity),
    coalesce(string_agg(classes.relname || '=' || classes.relrowsecurity, ', '), 'missing')
  from pg_catalog.pg_class classes
  where classes.relnamespace = 'public'::regnamespace
    and classes.relname in (
      'observations',
      'user_species_discoveries',
      'user_variant_discoveries',
      'xp_events'
    )

  union all

  select
    'observations_keep_read_only_client_grants',
    pg_catalog.has_table_privilege('authenticated', 'public.observations', 'SELECT')
      and not pg_catalog.has_table_privilege('anon', 'public.observations', 'SELECT')
      and not pg_catalog.has_table_privilege('authenticated', 'public.observations', 'INSERT')
      and not pg_catalog.has_table_privilege('authenticated', 'public.observations', 'UPDATE')
      and not pg_catalog.has_table_privilege('authenticated', 'public.observations', 'DELETE'),
    'authenticated select only; anon none'

  union all

  select
    'replaced_rpcs_are_security_definer_with_empty_search_path',
    count(*) = 3
      and bool_and(oid is not null and prosecdef and proconfig = array['search_path=']::text[]),
    string_agg(function_name || '=' || coalesce('security_definer:' || prosecdef::text || ',config:' || proconfig::text, 'missing'), E'\n')
  from function_state

  union all

  select
    'replaced_rpcs_have_expected_execute_permissions',
    count(*) = 3
      and bool_and(oid is not null and not anon_execute and authenticated_execute),
    string_agg(function_name || '=anon:' || coalesce(anon_execute::text, 'missing') ||
      ',authenticated:' || coalesce(authenticated_execute::text, 'missing'), E'\n')
  from function_state

  union all

  select
    'replaced_rpcs_use_owner_scoped_observation_identity',
    count(*) = 3
      and bool_and(
        oid is not null
        and not (prosrc ~ E'where\\s+(?:[a-z_]+\\.)?id\\s*=\\s*p_observation_id')
        and not exists (
          select 1 from unnest(required_fragments) fragments(fragment)
          where position(fragment in prosrc) = 0
        )
      ),
    string_agg(function_name || '=' || coalesce((
      select bool_and(position(fragment in function_state.prosrc) > 0)::text
      from unnest(function_state.required_fragments) fragments(fragment)
    ), 'missing'), ', ')
  from function_state

  union all

  select
    'historical_import_observations_were_backfilled',
    not exists (
      select 1
      from public.observations observations
      where observations.import_id is not null
        and not exists (
          select 1
          from public.sync_import_observations links
          where links.user_id = observations.user_id
            and links.import_id = observations.import_id
            and links.observation_id = observations.id
            and links.legacy_source_id is not distinct from observations.legacy_source_id
        )
    ),
    'missing=' || (
      select count(*)::text
      from public.observations observations
      where observations.import_id is not null
        and not exists (
          select 1 from public.sync_import_observations links
          where links.user_id = observations.user_id
            and links.import_id = observations.import_id
            and links.observation_id = observations.id
            and links.legacy_source_id is not distinct from observations.legacy_source_id
        )
    )

  union all

  select
    'historical_legacy_mappings_were_backfilled',
    not exists (
      select 1
      from public.observations observations
      join public.sync_imports imports
        on imports.user_id = observations.user_id
       and imports.id = observations.import_id
      where observations.legacy_source_id is not null
        and not exists (
          select 1 from public.sync_legacy_observation_map mappings
          where mappings.user_id = observations.user_id
            and mappings.dataset_id = imports.dataset_id
            and mappings.legacy_source_id = observations.legacy_source_id
            and mappings.observation_id = observations.id
        )
    ),
    'missing=' || (
      select count(*)::text
      from public.observations observations
      join public.sync_imports imports
        on imports.user_id = observations.user_id
       and imports.id = observations.import_id
      where observations.legacy_source_id is not null
        and not exists (
          select 1 from public.sync_legacy_observation_map mappings
          where mappings.user_id = observations.user_id
            and mappings.dataset_id = imports.dataset_id
            and mappings.legacy_source_id = observations.legacy_source_id
            and mappings.observation_id = observations.id
        )
    )

  union all

  select
    'import_processed_counts_match_memberships',
    not exists (
      select 1
      from public.sync_imports imports
      where imports.processed_observation_count <> (
          select count(*) from public.sync_import_observations links
          where links.user_id = imports.user_id and links.import_id = imports.id
        )
        or imports.processed_photo_count <> (
          select count(*)
          from public.sync_import_observations links
          join public.observations observations
            on observations.user_id = links.user_id and observations.id = links.observation_id
          where links.user_id = imports.user_id
            and links.import_id = imports.id
            and observations.photo_path is not null
        )
    ),
    'mismatched_imports=' || (
      select count(*)::text
      from public.sync_imports imports
      where imports.processed_observation_count <> (
          select count(*) from public.sync_import_observations links
          where links.user_id = imports.user_id and links.import_id = imports.id
        )
        or imports.processed_photo_count <> (
          select count(*)
          from public.sync_import_observations links
          join public.observations observations
            on observations.user_id = links.user_id and observations.id = links.observation_id
          where links.user_id = imports.user_id
            and links.import_id = imports.id
            and observations.photo_path is not null
        )
    )

  union all

  select
    'original_observation_triggers_remain_enabled',
    count(*) = 4 and bool_and(triggers.tgenabled = 'O'),
    coalesce(string_agg(triggers.tgname || '=' || triggers.tgenabled, ', '), 'missing')
  from pg_catalog.pg_trigger triggers
  where triggers.tgrelid = 'public.observations'::regclass
    and not triggers.tgisinternal
    and triggers.tgname in (
      'observations_protect_identity',
      'observations_award_discoveries',
      'observations_bump_sync_revision',
      'observations_protect_sync_identity'
    )

  union all

  select
    'observation_trigger_functions_not_client_executable',
    count(*) = 3 and bool_and(
      not pg_catalog.has_function_privilege('anon', functions.oid, 'EXECUTE')
      and not pg_catalog.has_function_privilege('authenticated', functions.oid, 'EXECUTE')
    ),
    coalesce(string_agg(functions.proname, ', '), 'missing')
  from pg_catalog.pg_proc functions
  where functions.pronamespace = 'private'::regnamespace
    and functions.proname in (
      'protect_observation_identity',
      'protect_observation_sync_identity',
      'award_observation_discoveries'
    )

  union all

  select
    'storage_policies_remain_owner_and_observation_scoped',
    count(*) = 2
      and bool_and(
        policies.roles = array['authenticated']::name[]
        and coalesce(policies.qual, policies.with_check) like '%observations.user_id%auth.uid()%'
        and coalesce(policies.qual, policies.with_check) like '%observations.id%split_part%'
      ),
    coalesce(string_agg(policies.policyname || ':' || coalesce(policies.qual, policies.with_check), E'\n'), 'missing')
  from pg_catalog.pg_policies policies
  where policies.schemaname = 'storage'
    and policies.tablename = 'objects'
    and policies.policyname in ('observation_photos_select_own', 'observation_photos_insert_own')
)
select check_name, passed, details
from checks
order by check_name;

