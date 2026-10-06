-- Read-only reconciliation against the final state expected by migration 008.
-- Safe for both a fully applied 008 and a rolled-back/partial-looking catalog.

with
relations as (
  select classes.oid, namespaces.nspname, classes.relname, classes.relkind,
         classes.relrowsecurity, classes.relforcerowsecurity
  from pg_catalog.pg_class classes
  join pg_catalog.pg_namespace namespaces on namespaces.oid = classes.relnamespace
  where namespaces.nspname::text in ('public', 'storage')
),
constraint_inventory as (
  select
    constraints.oid,
    source_namespace.nspname as source_schema,
    source_table.relname as source_table,
    constraints.conname,
    constraints.contype,
    coalesce((
      select array_agg(attributes.attname::text order by keys.ordinality)
      from unnest(constraints.conkey) with ordinality keys(attnum, ordinality)
      join pg_catalog.pg_attribute attributes
        on attributes.attrelid = constraints.conrelid
       and attributes.attnum = keys.attnum
    ), array[]::text[]) as local_columns,
    referenced_namespace.nspname as referenced_schema,
    referenced_table.relname as referenced_table,
    coalesce((
      select array_agg(attributes.attname::text order by keys.ordinality)
      from unnest(constraints.confkey) with ordinality keys(attnum, ordinality)
      join pg_catalog.pg_attribute attributes
        on attributes.attrelid = constraints.confrelid
       and attributes.attnum = keys.attnum
    ), array[]::text[]) as referenced_columns,
    constraints.confdeltype,
    constraints.confupdtype,
    coalesce((
      select array_agg(attributes.attname::text order by keys.ordinality)
      from unnest(constraints.confdelsetcols) with ordinality keys(attnum, ordinality)
      join pg_catalog.pg_attribute attributes
        on attributes.attrelid = constraints.conrelid
       and attributes.attnum = keys.attnum
    ), array[]::text[]) as delete_set_columns,
    constraints.convalidated,
    pg_catalog.pg_get_constraintdef(constraints.oid, true) as definition
  from pg_catalog.pg_constraint constraints
  join pg_catalog.pg_class source_table on source_table.oid = constraints.conrelid
  join pg_catalog.pg_namespace source_namespace on source_namespace.oid = source_table.relnamespace
  left join pg_catalog.pg_class referenced_table on referenced_table.oid = constraints.confrelid
  left join pg_catalog.pg_namespace referenced_namespace on referenced_namespace.oid = referenced_table.relnamespace
),
expected_observation_fks(
  source_table, conname, local_columns, referenced_columns, delete_action, delete_set_columns
) as (
  values
    ('user_species_discoveries', 'user_species_discoveries_first_observation_fkey', array['user_id', 'first_observation_id']::text[], array['user_id', 'id']::text[], 'n'::"char", array['first_observation_id']::text[]),
    ('user_variant_discoveries', 'user_variant_discoveries_first_observation_fkey', array['user_id', 'first_observation_id']::text[], array['user_id', 'id']::text[], 'n'::"char", array['first_observation_id']::text[]),
    ('xp_events', 'xp_events_observation_fkey', array['user_id', 'observation_id']::text[], array['user_id', 'id']::text[], 'n'::"char", array['observation_id']::text[]),
    ('sync_import_observations', 'sync_import_observations_observation_fkey', array['user_id', 'observation_id']::text[], array['user_id', 'id']::text[], 'r'::"char", array[]::text[]),
    ('sync_legacy_observation_map', 'sync_legacy_observation_map_observation_fkey', array['user_id', 'observation_id']::text[], array['user_id', 'id']::text[], 'r'::"char", array[]::text[])
),
actual_observation_fks as (
  select inventory.*
  from constraint_inventory inventory
  where inventory.contype = 'f'::"char"
    and inventory.referenced_schema = 'public'
    and inventory.referenced_table = 'observations'
),
expected_new_constraints(
  source_table, conname, contype, local_columns,
  referenced_schema, referenced_table, referenced_columns, delete_action, definition_fragment
) as (
  values
    ('sync_import_observations', 'sync_import_observations_pkey', 'p'::"char", array['user_id', 'import_id', 'observation_id']::text[], null, null, array[]::text[], ' '::"char", null),
    ('sync_import_observations', 'sync_import_observations_user_fkey', 'f'::"char", array['user_id']::text[], 'auth', 'users', array['id']::text[], 'c'::"char", null),
    ('sync_import_observations', 'sync_import_observations_import_fkey', 'f'::"char", array['user_id', 'import_id']::text[], 'public', 'sync_imports', array['user_id', 'id']::text[], 'r'::"char", null),
    ('sync_import_observations', 'sync_import_observations_observation_fkey', 'f'::"char", array['user_id', 'observation_id']::text[], 'public', 'observations', array['user_id', 'id']::text[], 'r'::"char", null),
    ('sync_import_observations', 'sync_import_observations_legacy_length_check', 'c'::"char", array['legacy_source_id']::text[], null, null, array[]::text[], ' '::"char", '240'),
    ('sync_legacy_observation_map', 'sync_legacy_observation_map_pkey', 'p'::"char", array['user_id', 'dataset_id', 'legacy_source_id']::text[], null, null, array[]::text[], ' '::"char", null),
    ('sync_legacy_observation_map', 'sync_legacy_observation_map_user_fkey', 'f'::"char", array['user_id']::text[], 'auth', 'users', array['id']::text[], 'c'::"char", null),
    ('sync_legacy_observation_map', 'sync_legacy_observation_map_observation_key', 'u'::"char", array['user_id', 'dataset_id', 'observation_id']::text[], null, null, array[]::text[], ' '::"char", null),
    ('sync_legacy_observation_map', 'sync_legacy_observation_map_observation_fkey', 'f'::"char", array['user_id', 'observation_id']::text[], 'public', 'observations', array['user_id', 'id']::text[], 'r'::"char", null),
    ('sync_legacy_observation_map', 'sync_legacy_observation_map_legacy_length_check', 'c'::"char", array['legacy_source_id']::text[], null, null, array[]::text[], ' '::"char", '240')
),
new_constraint_comparison as (
  select
    expected.*,
    actual.oid as actual_oid,
    actual.contype as actual_contype,
    actual.local_columns as actual_local_columns,
    actual.referenced_schema as actual_referenced_schema,
    actual.referenced_table as actual_referenced_table,
    actual.referenced_columns as actual_referenced_columns,
    actual.confdeltype as actual_delete_action,
    actual.convalidated,
    actual.definition,
    actual.oid is not null
      and actual.contype = expected.contype
      and actual.local_columns = expected.local_columns
      and (
        expected.contype <> 'f'::"char"
        or (
          actual.referenced_schema::text = expected.referenced_schema
          and actual.referenced_table::text = expected.referenced_table
          and actual.referenced_columns = expected.referenced_columns
          and actual.confdeltype = expected.delete_action
          and actual.confupdtype = 'a'::"char"
        )
      )
      and (expected.definition_fragment is null or position(expected.definition_fragment in actual.definition) > 0)
      and actual.convalidated as matches
  from expected_new_constraints expected
  left join constraint_inventory actual
    on actual.source_schema::text = 'public'
   and actual.source_table::text = expected.source_table
   and actual.conname::text = expected.conname
),
expected_columns(table_name, column_name, data_type, not_null, ordinal_position, has_default) as (
  values
    ('sync_import_observations', 'user_id', 'uuid', true, 1, false),
    ('sync_import_observations', 'import_id', 'uuid', true, 2, false),
    ('sync_import_observations', 'observation_id', 'uuid', true, 3, false),
    ('sync_import_observations', 'legacy_source_id', 'text', false, 4, false),
    ('sync_import_observations', 'confirmed_at', 'timestamp with time zone', true, 5, true),
    ('sync_legacy_observation_map', 'user_id', 'uuid', true, 1, false),
    ('sync_legacy_observation_map', 'dataset_id', 'uuid', true, 2, false),
    ('sync_legacy_observation_map', 'legacy_source_id', 'text', true, 3, false),
    ('sync_legacy_observation_map', 'observation_id', 'uuid', true, 4, false),
    ('sync_legacy_observation_map', 'created_at', 'timestamp with time zone', true, 5, true)
),
actual_columns as (
  select
    tables.relname as table_name,
    attributes.attname as column_name,
    pg_catalog.format_type(attributes.atttypid, attributes.atttypmod) as data_type,
    attributes.attnotnull as not_null,
    attributes.attnum as ordinal_position,
    defaults.oid is not null as has_default,
    pg_catalog.pg_get_expr(defaults.adbin, defaults.adrelid) as default_expression
  from pg_catalog.pg_attribute attributes
  join pg_catalog.pg_class tables on tables.oid = attributes.attrelid
  join pg_catalog.pg_namespace namespaces on namespaces.oid = tables.relnamespace
  left join pg_catalog.pg_attrdef defaults
    on defaults.adrelid = attributes.attrelid
   and defaults.adnum = attributes.attnum
  where namespaces.nspname::text = 'public'
    and tables.relname::text in ('sync_import_observations', 'sync_legacy_observation_map')
    and attributes.attnum > 0
    and not attributes.attisdropped
),
column_comparison as (
  select
    expected.*,
    actual.data_type as actual_data_type,
    actual.not_null as actual_not_null,
    actual.ordinal_position as actual_ordinal_position,
    actual.has_default as actual_has_default,
    actual.default_expression,
    actual.column_name is not null
      and actual.data_type = expected.data_type
      and actual.not_null = expected.not_null
      and actual.ordinal_position = expected.ordinal_position
      and actual.has_default = expected.has_default
      and (not expected.has_default or actual.default_expression = 'now()') as matches
  from expected_columns expected
  left join actual_columns actual
    on actual.table_name::text = expected.table_name
   and actual.column_name::text = expected.column_name
),
expected_indexes(index_name) as (
  values
    ('user_species_discoveries_first_observation_idx'),
    ('user_variant_discoveries_first_observation_idx'),
    ('xp_events_observation_idx'),
    ('sync_import_observations_pkey'),
    ('sync_import_observations_legacy_key'),
    ('sync_import_observations_observation_idx'),
    ('sync_legacy_observation_map_pkey'),
    ('sync_legacy_observation_map_observation_key'),
    ('sync_legacy_observation_map_observation_idx')
),
index_comparison as (
  select
    expected.index_name,
    indexes.indexrelid,
    indexes.indisvalid,
    indexes.indisready,
    pg_catalog.pg_get_indexdef(indexes.indexrelid, 0, true) as definition
  from expected_indexes expected
  left join pg_catalog.pg_class index_classes
    on index_classes.relnamespace = 'public'::regnamespace
   and index_classes.relname::text = expected.index_name
   and index_classes.relkind = 'i'::"char"
  left join pg_catalog.pg_index indexes on indexes.indexrelid = index_classes.oid
),
expected_policies(table_schema, table_name, policy_name, command) as (
  values
    ('public', 'sync_import_observations', 'sync_import_observations_select_own', 'SELECT'),
    ('public', 'sync_legacy_observation_map', 'sync_legacy_observation_map_select_own', 'SELECT')
),
policy_comparison as (
  select
    expected.*,
    policies.policyname is not null
      and policies.roles = array['authenticated']::name[]
      and policies.cmd = expected.command
      and policies.qual like '%auth.uid()%user_id%' as matches,
    policies.roles,
    policies.qual,
    policies.with_check
  from expected_policies expected
  left join pg_catalog.pg_policies policies
    on policies.schemaname::text = expected.table_schema
   and policies.tablename::text = expected.table_name
   and policies.policyname::text = expected.policy_name
),
expected_functions(function_name, identity_arguments, return_type, body_md5) as (
  values
    ('sync_observation', 'uuid, text, timestamp with time zone, text, text, double precision, double precision, text, text, timestamp with time zone, timestamp with time zone, uuid, text, bigint', 'observations', '8a664859ff573cf7d7937d262d961461'),
    ('attach_observation_photo', 'uuid, text, text, bigint, text, bigint', 'observations', '5420a1904d3bbd578859ff5fd18c8a23'),
    ('complete_sync_import', 'uuid', 'sync_imports', '71e8f71756e0c65578f5c1db94403bb1')
),
function_comparison as (
  select
    expected.*,
    functions.oid,
    functions.prosecdef,
    functions.proconfig,
    returns.relname as actual_return_type,
    pg_catalog.md5(pg_catalog.btrim(pg_catalog.regexp_replace(functions.prosrc, '\s+', ' ', 'g'))) as actual_body_md5,
    functions.oid is not null
      and functions.prosecdef
      and functions.proconfig = array['search_path=']::text[]
      and returns.relname::text = expected.return_type
      and pg_catalog.md5(pg_catalog.btrim(pg_catalog.regexp_replace(functions.prosrc, '\s+', ' ', 'g'))) = expected.body_md5
      as definition_matches,
    case when functions.oid is null then false else
      pg_catalog.has_function_privilege('authenticated', functions.oid, 'EXECUTE')
    end as authenticated_execute,
    case when functions.oid is null then false else
      pg_catalog.has_function_privilege('anon', functions.oid, 'EXECUTE')
    end as anon_execute,
    case when functions.oid is null then false else not exists (
      select 1
      from pg_catalog.aclexplode(
        coalesce(functions.proacl, pg_catalog.acldefault('f'::"char", functions.proowner))
      ) acl
      where acl.grantee = 0 and acl.privilege_type = 'EXECUTE'
    ) end as public_execute_revoked
  from expected_functions expected
  left join pg_catalog.pg_proc functions
    on functions.pronamespace = 'public'::regnamespace
   and functions.proname::text = expected.function_name
   and pg_catalog.oidvectortypes(functions.proargtypes) = expected.identity_arguments
  left join pg_catalog.pg_type return_types on return_types.oid = functions.prorettype
  left join pg_catalog.pg_class returns on returns.oid = return_types.typrelid
),
function_overloads as (
  select functions.proname, count(*) as overload_count
  from pg_catalog.pg_proc functions
  where functions.pronamespace = 'public'::regnamespace
    and functions.proname::text in ('sync_observation', 'attach_observation_photo', 'complete_sync_import')
  group by functions.proname
),
dynamic_data_xml as (
  select case
    when pg_catalog.to_regclass('public.sync_import_observations') is not null
     and pg_catalog.to_regclass('public.sync_legacy_observation_map') is not null
     and pg_catalog.to_regclass('public.sync_imports') is not null
     and pg_catalog.to_regclass('public.observations') is not null
    then pg_catalog.query_to_xml($query$
      select
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
        ) as associations_backfilled,
        not exists (
          select 1
          from public.observations observations
          join public.sync_imports imports
            on imports.user_id = observations.user_id
           and imports.id = observations.import_id
          where observations.legacy_source_id is not null
            and not exists (
              select 1
              from public.sync_legacy_observation_map mappings
              where mappings.user_id = observations.user_id
                and mappings.dataset_id = imports.dataset_id
                and mappings.legacy_source_id = observations.legacy_source_id
                and mappings.observation_id = observations.id
            )
        ) as legacy_mappings_backfilled,
        not exists (
          select 1
          from public.sync_imports imports
          where imports.processed_observation_count <> (
              select count(*)
              from public.sync_import_observations links
              where links.user_id = imports.user_id and links.import_id = imports.id
            )
             or imports.processed_photo_count <> (
              select count(*)
              from public.sync_import_observations links
              join public.observations observations
                on observations.user_id = links.user_id
               and observations.id = links.observation_id
              where links.user_id = imports.user_id
                and links.import_id = imports.id
                and observations.photo_path is not null
            )
        ) as counters_match,
        not exists (
          select 1
          from public.sync_import_observations links
          left join public.sync_imports imports
            on imports.user_id = links.user_id and imports.id = links.import_id
          left join public.observations observations
            on observations.user_id = links.user_id and observations.id = links.observation_id
          where imports.id is null or observations.id is null
        ) as associations_have_no_orphans,
        not exists (
          select 1
          from public.sync_legacy_observation_map mappings
          left join public.observations observations
            on observations.user_id = mappings.user_id and observations.id = mappings.observation_id
          where observations.id is null
        ) as legacy_mappings_have_no_orphans,
        (select count(*) from public.observations) as observation_count,
        (select count(*) from public.sync_imports) as import_count,
        (select count(*) from public.sync_import_observations) as association_count,
        (select count(*) from public.sync_legacy_observation_map) as legacy_mapping_count
    $query$, true, false, '')
    else null::xml
  end as result
),
dynamic_data_state as (
  select
    result is not null as query_available,
    case when result is null then false else
      coalesce(((xpath('//*[local-name()="associations_backfilled"]/text()', result))[1]::text)::boolean, false)
    end as associations_backfilled,
    case when result is null then false else
      coalesce(((xpath('//*[local-name()="legacy_mappings_backfilled"]/text()', result))[1]::text)::boolean, false)
    end as legacy_mappings_backfilled,
    case when result is null then false else
      coalesce(((xpath('//*[local-name()="counters_match"]/text()', result))[1]::text)::boolean, false)
    end as counters_match,
    case when result is null then false else
      coalesce(((xpath('//*[local-name()="associations_have_no_orphans"]/text()', result))[1]::text)::boolean, false)
    end as associations_have_no_orphans,
    case when result is null then false else
      coalesce(((xpath('//*[local-name()="legacy_mappings_have_no_orphans"]/text()', result))[1]::text)::boolean, false)
    end as legacy_mappings_have_no_orphans,
    case when result is null then null else
      (xpath('//*[local-name()="observation_count"]/text()', result))[1]::text
    end as observation_count,
    case when result is null then null else
      (xpath('//*[local-name()="import_count"]/text()', result))[1]::text
    end as import_count,
    case when result is null then null else
      (xpath('//*[local-name()="association_count"]/text()', result))[1]::text
    end as association_count,
    case when result is null then null else
      (xpath('//*[local-name()="legacy_mapping_count"]/text()', result))[1]::text
    end as legacy_mapping_count
  from dynamic_data_xml
),
base_checks(check_name, passed, details) as (
  select
    'observations_pk_is_user_id_id',
    count(*) = 1 and bool_and(local_columns = array['user_id', 'id']::text[]),
    coalesce(string_agg(conname::text || ':' || definition, '; '), 'missing')
  from constraint_inventory
  where source_schema::text = 'public' and source_table::text = 'observations' and contype = 'p'::"char"

  union all

  select
    'observations_has_no_global_id_unique',
    not exists (
      select 1 from constraint_inventory
      where source_schema::text = 'public' and source_table::text = 'observations'
        and contype in ('p'::"char", 'u'::"char") and local_columns = array['id']::text[]
    ) and not exists (
      select 1
      from pg_catalog.pg_index indexes
      join relations observations on observations.oid = indexes.indrelid
      where observations.nspname::text = 'public' and observations.relname::text = 'observations'
        and indexes.indisunique and indexes.indnkeyatts = 1
        and pg_catalog.pg_get_indexdef(indexes.indexrelid, 0, true) ~ '\(id\)$'
    ),
    'global id-only primary/unique constraints and indexes must be absent'

  union all

  select
    'observation_foreign_keys_match_final_008',
    (select count(*) from actual_observation_fks) = 5
      and count(*) = 5
      and bool_and(
        actual.oid is not null
        and actual.local_columns = expected.local_columns
        and actual.referenced_columns = expected.referenced_columns
        and actual.confdeltype = expected.delete_action
        and actual.delete_set_columns = expected.delete_set_columns
        and actual.confupdtype = 'a'::"char"
        and actual.convalidated
      ),
    string_agg(
      expected.source_table || '.' || expected.conname || '=' ||
      coalesce(actual.definition, 'missing'), E'\n'
    )
  from expected_observation_fks expected
  left join actual_observation_fks actual
    on actual.source_schema::text = 'public'
   and actual.source_table::text = expected.source_table
   and actual.conname::text = expected.conname

  union all

  select
    'new_tables_have_exact_columns',
    count(*) = 10
      and bool_and(matches)
      and (select count(*) from actual_columns) = 10,
    string_agg(
      table_name || '.' || column_name || '=' || matches::text ||
      ' actual:' || coalesce(actual_data_type, 'missing') ||
      ',default:' || coalesce(default_expression, 'none'), E'\n'
    )
  from column_comparison

  union all

  select
    'new_table_constraints_match_final_008',
    count(*) = 10 and bool_and(matches),
    string_agg(source_table::text || '.' || conname::text || '=' || matches::text ||
      ' actual:' || coalesce(definition, 'missing'), E'\n')
  from new_constraint_comparison

  union all

  select
    'expected_indexes_exist_and_are_valid',
    count(*) = 9 and bool_and(indexrelid is not null and indisvalid and indisready),
    string_agg(index_name || '=' || coalesce(definition, 'missing'), E'\n')
  from index_comparison

  union all

  select
    'new_tables_have_rls_enabled',
    count(*) = 2 and bool_and(relrowsecurity),
    coalesce(string_agg(relname::text || '=rls:' || relrowsecurity::text, ', '), 'missing')
  from relations
  where nspname::text = 'public'
    and relname::text in ('sync_import_observations', 'sync_legacy_observation_map')
    and relkind = 'r'::"char"

  union all

  select
    'preexisting_observation_tables_keep_rls',
    count(*) = 4 and bool_and(relrowsecurity),
    coalesce(string_agg(relname::text || '=rls:' || relrowsecurity::text, ', '), 'missing')
  from relations
  where nspname::text = 'public'
    and relname::text in (
      'observations',
      'user_species_discoveries',
      'user_variant_discoveries',
      'xp_events'
    )
    and relkind = 'r'::"char"

  union all

  select
    'observations_keep_read_only_client_grants',
    count(*) = 1 and bool_and(
      pg_catalog.has_table_privilege('authenticated', oid, 'SELECT')
      and not pg_catalog.has_table_privilege('anon', oid, 'SELECT')
      and not pg_catalog.has_table_privilege('authenticated', oid, 'INSERT,UPDATE,DELETE')
    ),
    'authenticated must retain SELECT only; anon must have no SELECT'
  from relations
  where nspname::text = 'public' and relname::text = 'observations' and relkind = 'r'::"char"

  union all

  select
    'new_table_policies_match_final_008',
    count(*) = 2 and bool_and(matches),
    string_agg(table_name || '.' || policy_name || '=' || matches::text ||
      ' using:' || coalesce(qual, 'missing'), E'\n')
  from policy_comparison

  union all

  select
    'new_tables_have_no_direct_client_grants',
    count(*) = 2 and bool_and(
      not pg_catalog.has_table_privilege('anon', oid, 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
      and not pg_catalog.has_table_privilege('authenticated', oid, 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
    ),
    coalesce(string_agg(relname::text, ', '), 'missing')
  from relations
  where nspname::text = 'public'
    and relname::text in ('sync_import_observations', 'sync_legacy_observation_map')
    and relkind = 'r'::"char"

  union all

  select
    'rpc_definitions_match_current_008',
    count(*) = 3
      and bool_and(definition_matches)
      and not exists (
        select 1 from function_overloads where overload_count <> 1
      )
      and (select count(*) from function_overloads) = 3,
    string_agg(function_name || '=' || coalesce(actual_body_md5, 'missing') ||
      ' expected:' || body_md5, E'\n')
  from function_comparison

  union all

  select
    'rpc_execute_grants_match_final_008',
    count(*) = 3 and bool_and(authenticated_execute and not anon_execute and public_execute_revoked),
    string_agg(function_name || '=authenticated:' || authenticated_execute::text ||
      ',anon:' || anon_execute::text || ',public_revoked:' || public_execute_revoked::text, E'\n')
  from function_comparison

  union all

  select
    'observation_triggers_remain_enabled',
    count(*) = 4 and bool_and(triggers.tgenabled = 'O'::"char"),
    coalesce(string_agg(triggers.tgname::text || '=' || triggers.tgenabled::text, ', '), 'missing')
  from pg_catalog.pg_trigger triggers
  join relations observations on observations.oid = triggers.tgrelid
  where observations.nspname::text = 'public' and observations.relname::text = 'observations'
    and not triggers.tgisinternal
    and triggers.tgname::text in (
      'observations_protect_identity',
      'observations_award_discoveries',
      'observations_bump_sync_revision',
      'observations_protect_sync_identity'
    )

  union all

  select
    'observation_trigger_functions_remain_private',
    count(*) = 3 and bool_and(
      not pg_catalog.has_function_privilege('anon', functions.oid, 'EXECUTE')
      and not pg_catalog.has_function_privilege('authenticated', functions.oid, 'EXECUTE')
    ),
    coalesce(string_agg(functions.proname::text, ', '), 'missing')
  from pg_catalog.pg_proc functions
  where functions.pronamespace = 'private'::regnamespace
    and functions.proname::text in (
      'protect_observation_identity',
      'protect_observation_sync_identity',
      'award_observation_discoveries'
    )

  union all

  select
    'storage_policies_still_scope_owner_and_observation',
    count(*) = 2 and bool_and(
      policies.roles = array['authenticated']::name[]
      and coalesce(policies.qual, policies.with_check) like '%observations.user_id%auth.uid()%'
      and coalesce(policies.qual, policies.with_check) like '%observations.id%split_part%'
    ),
    coalesce(string_agg(policies.policyname::text, ', '), 'missing')
  from pg_catalog.pg_policies policies
  where policies.schemaname::text = 'storage' and policies.tablename::text = 'objects'
    and policies.policyname::text in ('observation_photos_select_own', 'observation_photos_insert_own')

  union all

  select
    'historical_associations_backfilled',
    query_available and associations_backfilled,
    'query_available=' || query_available::text ||
      ', observations=' || coalesce(observation_count, 'unknown') ||
      ', associations=' || coalesce(association_count, 'unknown')
  from dynamic_data_state

  union all

  select
    'historical_legacy_mappings_backfilled',
    query_available and legacy_mappings_backfilled,
    'query_available=' || query_available::text ||
      ', legacy_mappings=' || coalesce(legacy_mapping_count, 'unknown')
  from dynamic_data_state

  union all

  select
    'import_counters_match_associations',
    query_available and counters_match,
    'query_available=' || query_available::text ||
      ', imports=' || coalesce(import_count, 'unknown')
  from dynamic_data_state

  union all

  select
    'associations_have_no_orphans',
    query_available and associations_have_no_orphans and legacy_mappings_have_no_orphans,
    'batch_links=' || associations_have_no_orphans::text ||
      ', legacy_links=' || legacy_mappings_have_no_orphans::text
  from dynamic_data_state
),
final_report as (
  select check_name, passed, details from base_checks
  union all
  select
    'all_final_008_checks_pass',
    bool_and(passed),
    count(*) filter (where passed)::text || '/' || count(*)::text || ' checks passed'
  from base_checks
)
select check_name, passed, details
from final_report
order by case when check_name = 'all_final_008_checks_pass' then 1 else 0 end, check_name;

