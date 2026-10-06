-- Read-only preflight for the failed first execution of migration 008.
-- This query discovers real object names and columns from PostgreSQL catalogs.

with
target_relations as (
  select classes.oid, namespaces.nspname, classes.relname, classes.relkind
  from pg_catalog.pg_class classes
  join pg_catalog.pg_namespace namespaces on namespaces.oid = classes.relnamespace
  where namespaces.nspname = 'public'
    and classes.relname in (
      'observations',
      'user_species_discoveries',
      'user_variant_discoveries',
      'xp_events',
      'sync_import_observations',
      'sync_legacy_observation_map'
    )
),
observations_relation as (
  select oid from target_relations where relname = 'observations'
),
constraint_inventory as (
  select
    constraints.oid,
    source_namespace.nspname as source_schema,
    source_table.relname as source_table,
    constraints.conname as constraint_name,
    constraints.contype,
    case constraints.contype
      when 'p' then 'primary-key'
      when 'u' then 'unique'
      when 'f' then 'foreign-key'
      when 'c' then 'check'
      when 'x' then 'exclusion'
      else constraints.contype::text
    end as constraint_type,
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
    case constraints.confdeltype
      when 'a' then 'NO ACTION'
      when 'r' then 'RESTRICT'
      when 'c' then 'CASCADE'
      when 'n' then 'SET NULL'
      when 'd' then 'SET DEFAULT'
      else null
    end as on_delete,
    case constraints.confupdtype
      when 'a' then 'NO ACTION'
      when 'r' then 'RESTRICT'
      when 'c' then 'CASCADE'
      when 'n' then 'SET NULL'
      when 'd' then 'SET DEFAULT'
      else null
    end as on_update,
    constraints.convalidated,
    constraints.condeferrable,
    constraints.condeferred,
    pg_catalog.pg_get_constraintdef(constraints.oid, true) as definition
  from pg_catalog.pg_constraint constraints
  join pg_catalog.pg_class source_table on source_table.oid = constraints.conrelid
  join pg_catalog.pg_namespace source_namespace on source_namespace.oid = source_table.relnamespace
  left join pg_catalog.pg_class referenced_table on referenced_table.oid = constraints.confrelid
  left join pg_catalog.pg_namespace referenced_namespace on referenced_namespace.oid = referenced_table.relnamespace
),
observation_keys as (
  select *
  from constraint_inventory
  where source_schema = 'public'
    and source_table = 'observations'
    and contype in ('p', 'u')
),
inbound_observation_fks as (
  select inventory.*
  from constraint_inventory inventory
  join observations_relation observations
    on inventory.referenced_schema = 'public'
   and inventory.referenced_table = 'observations'
  where inventory.contype = 'f'
),
related_constraints as (
  select *
  from constraint_inventory
  where source_schema = 'public'
    and source_table in (
      'user_species_discoveries',
      'user_variant_discoveries',
      'xp_events'
    )
),
observation_indexes as (
  select
    index_namespace.nspname as index_schema,
    index_class.relname as index_name,
    indexes.indisprimary,
    indexes.indisunique,
    indexes.indisvalid,
    indexes.indisready,
    pg_catalog.pg_get_indexdef(indexes.indexrelid, 0, true) as definition
  from pg_catalog.pg_index indexes
  join pg_catalog.pg_class table_class on table_class.oid = indexes.indrelid
  join pg_catalog.pg_namespace table_namespace on table_namespace.oid = table_class.relnamespace
  join pg_catalog.pg_class index_class on index_class.oid = indexes.indexrelid
  join pg_catalog.pg_namespace index_namespace on index_namespace.oid = index_class.relnamespace
  where table_namespace.nspname = 'public'
    and table_class.relname = 'observations'
),
observation_triggers as (
  select
    triggers.tgname as trigger_name,
    triggers.tgenabled,
    function_namespace.nspname as function_schema,
    functions.proname as function_name,
    pg_catalog.pg_get_triggerdef(triggers.oid, true) as definition
  from pg_catalog.pg_trigger triggers
  join pg_catalog.pg_class tables on tables.oid = triggers.tgrelid
  join pg_catalog.pg_namespace table_namespace on table_namespace.oid = tables.relnamespace
  join pg_catalog.pg_proc functions on functions.oid = triggers.tgfoid
  join pg_catalog.pg_namespace function_namespace on function_namespace.oid = functions.pronamespace
  where table_namespace.nspname = 'public'
    and tables.relname = 'observations'
    and not triggers.tgisinternal
),
observation_related_policies as (
  select
    policies.schemaname,
    policies.tablename,
    policies.policyname,
    policies.permissive,
    policies.roles,
    policies.cmd,
    policies.qual,
    policies.with_check
  from pg_catalog.pg_policies policies
  where (policies.schemaname = 'public' and policies.tablename = 'observations')
     or coalesce(policies.qual, '') ilike '%observations%'
     or coalesce(policies.with_check, '') ilike '%observations%'
),
observation_related_functions as (
  select
    namespaces.nspname as function_schema,
    functions.proname as function_name,
    pg_catalog.pg_get_function_identity_arguments(functions.oid) as identity_arguments,
    functions.prosecdef as security_definer,
    functions.proconfig,
    pg_catalog.md5(pg_catalog.btrim(pg_catalog.regexp_replace(functions.prosrc, '\s+', ' ', 'g'))) as body_md5,
    position('sync_import_observations' in functions.prosrc) > 0 as uses_import_observation_links,
    position('sync_legacy_observation_map' in functions.prosrc) > 0 as uses_legacy_observation_map,
    position('observations.user_id = current_user_id' in functions.prosrc) > 0 as has_owner_scoped_observation_lookup,
    position('where id = p_observation_id' in functions.prosrc) > 0 as has_unqualified_observation_lookup
  from pg_catalog.pg_proc functions
  join pg_catalog.pg_namespace namespaces on namespaces.oid = functions.pronamespace
  where namespaces.nspname in ('public', 'private')
    and (
      functions.prosrc ilike '%observations%'
      or functions.proname in ('sync_observation', 'attach_observation_photo', 'complete_sync_import')
    )
),
catalog_dependencies as (
  select distinct
    pg_catalog.pg_describe_object(dependencies.classid, dependencies.objid, dependencies.objsubid) as dependent_object,
    pg_catalog.pg_describe_object(dependencies.refclassid, dependencies.refobjid, dependencies.refobjsubid) as referenced_object,
    dependencies.deptype
  from pg_catalog.pg_depend dependencies
  join observations_relation observations
    on dependencies.refobjid = observations.oid
  where dependencies.classid <> 'pg_catalog.pg_type'::regclass
),
intended_008_relations(object_kind, object_schema, object_name, expected_relkind) as (
  values
    ('table', 'public', 'sync_import_observations', 'r'::"char"),
    ('table', 'public', 'sync_legacy_observation_map', 'r'::"char"),
    ('index', 'public', 'user_species_discoveries_first_observation_idx', 'i'::"char"),
    ('index', 'public', 'user_variant_discoveries_first_observation_idx', 'i'::"char"),
    ('index', 'public', 'xp_events_observation_idx', 'i'::"char"),
    ('index', 'public', 'sync_import_observations_legacy_key', 'i'::"char"),
    ('index', 'public', 'sync_import_observations_observation_idx', 'i'::"char"),
    ('index', 'public', 'sync_legacy_observation_map_observation_idx', 'i'::"char")
),
intended_008_relation_state as (
  select
    expected.object_kind,
    expected.object_schema,
    expected.object_name,
    classes.oid,
    classes.relkind
  from intended_008_relations expected
  left join pg_catalog.pg_namespace namespaces on namespaces.nspname = expected.object_schema
  left join pg_catalog.pg_class classes
    on classes.relnamespace = namespaces.oid
   and classes.relname = expected.object_name
   and classes.relkind = expected.expected_relkind
),
intended_008_policy_state as (
  select expected.table_name, expected.policy_name, policies.policyname is not null as exists_now
  from (values
    ('sync_import_observations', 'sync_import_observations_select_own'),
    ('sync_legacy_observation_map', 'sync_legacy_observation_map_select_own')
  ) expected(table_name, policy_name)
  left join pg_catalog.pg_policies policies
    on policies.schemaname = 'public'
   and policies.tablename = expected.table_name
   and policies.policyname = expected.policy_name
),
rollback_assessment as (
  select
    (
      (select count(*) = 1 and bool_and(local_columns = array['id']::text[])
       from observation_keys where contype = 'p')
      and exists (
        select 1 from observation_keys
        where contype = 'u' and local_columns = array['user_id', 'id']::text[]
      )
      and not exists (select 1 from intended_008_relation_state where oid is not null)
      and not exists (select 1 from intended_008_policy_state where exists_now)
      and not exists (
        select 1 from observation_related_functions
        where uses_import_observation_links or uses_legacy_observation_map
      )
    ) as consistent_with_full_transaction_rollback,
    (select count(*) from inbound_observation_fks) as inbound_observation_fk_count,
    (select count(*) from intended_008_relation_state where oid is not null) as present_008_relation_count,
    (select count(*) from intended_008_policy_state where exists_now) as present_008_policy_count
),
report(section, object_schema, object_name, object_type, details) as (
  select
    '01-observations-keys',
    source_schema,
    constraint_name,
    constraint_type,
    jsonb_build_object(
      'local_columns', local_columns,
      'validated', convalidated,
      'deferrable', condeferrable,
      'initially_deferred', condeferred,
      'definition', definition
    )
  from observation_keys

  union all

  select
    '02-inbound-observation-fks',
    source_schema,
    source_table || '.' || constraint_name,
    constraint_type,
    jsonb_build_object(
      'local_columns', local_columns,
      'referenced_schema', referenced_schema,
      'referenced_table', referenced_table,
      'referenced_columns', referenced_columns,
      'on_delete', on_delete,
      'on_update', on_update,
      'validated', convalidated,
      'definition', definition
    )
  from inbound_observation_fks

  union all

  select
    '03-related-table-constraints',
    source_schema,
    source_table || '.' || constraint_name,
    constraint_type,
    jsonb_build_object(
      'local_columns', local_columns,
      'referenced_schema', referenced_schema,
      'referenced_table', referenced_table,
      'referenced_columns', referenced_columns,
      'on_delete', on_delete,
      'on_update', on_update,
      'validated', convalidated,
      'definition', definition
    )
  from related_constraints

  union all

  select
    '04-observations-indexes',
    index_schema,
    index_name,
    'index',
    jsonb_build_object(
      'primary', indisprimary,
      'unique', indisunique,
      'valid', indisvalid,
      'ready', indisready,
      'definition', definition
    )
  from observation_indexes

  union all

  select
    '05-observations-triggers',
    function_schema,
    trigger_name,
    'trigger',
    jsonb_build_object(
      'enabled_code', tgenabled,
      'function', function_schema || '.' || function_name,
      'definition', definition
    )
  from observation_triggers

  union all

  select
    '06-observation-related-policies',
    schemaname,
    tablename || '.' || policyname,
    'policy',
    jsonb_build_object(
      'permissive', permissive,
      'roles', roles,
      'command', cmd,
      'using', qual,
      'with_check', with_check
    )
  from observation_related_policies

  union all

  select
    '07-observation-related-functions',
    function_schema,
    function_name || '(' || identity_arguments || ')',
    'function',
    jsonb_build_object(
      'security_definer', security_definer,
      'config', proconfig,
      'body_md5', body_md5,
      'uses_import_observation_links', uses_import_observation_links,
      'uses_legacy_observation_map', uses_legacy_observation_map,
      'has_owner_scoped_observation_lookup', has_owner_scoped_observation_lookup,
      'has_unqualified_observation_lookup', has_unqualified_observation_lookup
    )
  from observation_related_functions

  union all

  select
    '08-catalog-dependencies',
    'pg_catalog',
    dependent_object,
    'dependency',
    jsonb_build_object(
      'referenced_object', referenced_object,
      'dependency_type_code', deptype
    )
  from catalog_dependencies

  union all

  select
    '09-intended-008-object-state',
    object_schema,
    object_name,
    object_kind,
    jsonb_build_object(
      'exists_now', oid is not null,
      'actual_relkind', relkind
    )
  from intended_008_relation_state

  union all

  select
    '09-intended-008-object-state',
    'public',
    table_name || '.' || policy_name,
    'policy',
    jsonb_build_object('exists_now', exists_now)
  from intended_008_policy_state

  union all

  select
    '10-rollback-assessment',
    'public',
    'migration-008-first-attempt',
    'assessment',
    jsonb_build_object(
      'consistent_with_full_transaction_rollback', consistent_with_full_transaction_rollback,
      'inbound_observation_fk_count', inbound_observation_fk_count,
      'present_008_relation_count', present_008_relation_count,
      'present_008_policy_count', present_008_policy_count,
      'interpretation', case
        when consistent_with_full_transaction_rollback
          then 'The catalog is structurally consistent with the failed transaction having rolled back completely.'
        else 'One or more structural markers differ from the expected pre-008 state; inspect all preceding sections before any repair.'
      end
    )
  from rollback_assessment
)
select section, object_schema, object_name, object_type, details
from report
order by section, object_schema, object_name;

