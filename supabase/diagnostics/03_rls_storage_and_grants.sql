-- READ ONLY. Run this file third in the Supabase SQL Editor.
with wildex_tables(table_name) as (
  values
    ('species'), ('species_variants'), ('thematic_collections'),
    ('thematic_collection_species'), ('profiles'), ('observations'),
    ('badges'), ('challenges'), ('challenge_objectives'),
    ('user_species_discoveries'), ('user_variant_discoveries'), ('xp_events'),
    ('challenge_claims'), ('user_badges'), ('profile_featured_badges')
), policy_state as (
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
  where (policies.schemaname = 'public' and policies.tablename in (select table_name from wildex_tables))
     or (policies.schemaname = 'storage' and policies.tablename = 'objects'
       and policies.policyname like 'observation_photos_%')
), grant_state as (
  select
    grants.table_schema,
    grants.table_name,
    grants.grantee,
    grants.privilege_type
  from information_schema.role_table_grants grants
  where grants.grantee in ('anon', 'authenticated')
    and grants.table_schema = 'public'
    and grants.table_name in (select table_name from wildex_tables)
), rls_state as (
  select
    namespaces.nspname as table_schema,
    tables.relname as table_name,
    tables.relrowsecurity as rls_enabled,
    tables.relforcerowsecurity as force_rls
  from pg_catalog.pg_class tables
  join pg_catalog.pg_namespace namespaces on namespaces.oid = tables.relnamespace
  where namespaces.nspname = 'public'
    and tables.relname in (select table_name from wildex_tables)
    and tables.relkind in ('r', 'p')
)
select jsonb_build_object(
  'rls', (
    select coalesce(jsonb_agg(to_jsonb(rls_state) order by table_name), '[]'::jsonb)
    from rls_state
  ),
  'policies', (
    select coalesce(jsonb_agg(to_jsonb(policy_state) order by schemaname, tablename, policyname), '[]'::jsonb)
    from policy_state
  ),
  'grants', (
    select coalesce(jsonb_agg(to_jsonb(grant_state) order by table_schema, table_name, grantee, privilege_type), '[]'::jsonb)
    from grant_state
  ),
  'storage_buckets_available', to_regclass('storage.buckets') is not null,
  'storage_objects_available', to_regclass('storage.objects') is not null,
  'photo_bucket_query_xml', xmlserialize(
    document query_to_xml(
      case
        when to_regclass('storage.buckets') is null
          then 'select ''storage.buckets no existe''::text as status where false'
        else 'select id, name, public, file_size_limit, allowed_mime_types::text as allowed_mime_types from storage.buckets where id = ''observation-photos'''
      end,
      false,
      false,
      ''
    ) as text
  )
) as wildex_security_diagnostic;
