-- READ ONLY. Run this file first in the Supabase SQL Editor.
with expected_tables(table_name) as (
  values
    ('species'),
    ('species_variants'),
    ('thematic_collections'),
    ('thematic_collection_species'),
    ('profiles'),
    ('observations'),
    ('badges'),
    ('challenges'),
    ('challenge_objectives'),
    ('user_species_discoveries'),
    ('user_variant_discoveries'),
    ('xp_events'),
    ('challenge_claims'),
    ('user_badges'),
    ('profile_featured_badges')
), table_state as (
  select
    expected.table_name,
    tables.oid is not null as exists,
    coalesce(tables.relrowsecurity, false) as rls_enabled,
    coalesce(tables.relforcerowsecurity, false) as force_rls
  from expected_tables expected
  left join pg_catalog.pg_class tables
    on tables.relname = expected.table_name
   and tables.relnamespace = 'public'::regnamespace
   and tables.relkind in ('r', 'p')
), column_state as (
  select
    columns.table_name,
    columns.ordinal_position,
    columns.column_name,
    columns.data_type,
    columns.udt_name,
    columns.is_nullable,
    columns.column_default
  from information_schema.columns
  join expected_tables using (table_name)
  where columns.table_schema = 'public'
), constraint_state as (
  select
    tables.relname as table_name,
    constraints.conname as constraint_name,
    constraints.contype as constraint_type,
    pg_get_constraintdef(constraints.oid, true) as definition
  from pg_catalog.pg_constraint constraints
  join pg_catalog.pg_class tables on tables.oid = constraints.conrelid
  join expected_tables on expected_tables.table_name = tables.relname
  where tables.relnamespace = 'public'::regnamespace
), index_state as (
  select
    indexes.tablename as table_name,
    indexes.indexname as index_name,
    indexes.indexdef as definition
  from pg_catalog.pg_indexes indexes
  join expected_tables on expected_tables.table_name = indexes.tablename
  where indexes.schemaname = 'public'
)
select jsonb_build_object(
  'migration_history_available', to_regclass('supabase_migrations.schema_migrations') is not null,
  'migration_history_note', case
    when to_regclass('supabase_migrations.schema_migrations') is null
      then 'No existe historial de Supabase CLI; el estado se determina desde los catálogos de PostgreSQL.'
    else 'Existe la relación de historial. Este diagnóstico no depende de su contenido porque las migraciones pudieron ejecutarse manualmente.'
  end,
  'tables', (
    select jsonb_agg(to_jsonb(table_state) order by table_name)
    from table_state
  ),
  'columns', (
    select coalesce(jsonb_agg(to_jsonb(column_state) order by table_name, ordinal_position), '[]'::jsonb)
    from column_state
  ),
  'constraints', (
    select coalesce(jsonb_agg(to_jsonb(constraint_state) order by table_name, constraint_name), '[]'::jsonb)
    from constraint_state
  ),
  'indexes', (
    select coalesce(jsonb_agg(to_jsonb(index_state) order by table_name, index_name), '[]'::jsonb)
    from index_state
  )
) as wildex_schema_diagnostic;
