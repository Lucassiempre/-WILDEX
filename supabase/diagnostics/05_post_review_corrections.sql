-- READ ONLY. Run after diagnostics 01-04 confirmed that all Wildex objects exist.
with constraint_definitions as (
  select
    tables.relname as table_name,
    constraints.conname as constraint_name,
    constraints.contype as constraint_type,
    lower(pg_get_constraintdef(constraints.oid, true)) as definition
  from pg_catalog.pg_constraint constraints
  join pg_catalog.pg_class tables on tables.oid = constraints.conrelid
  where tables.relnamespace = 'public'::regnamespace
    and tables.relname in ('observations', 'xp_events')
), policy_definitions as (
  select
    schemaname,
    tablename,
    policyname,
    lower(cmd) as command,
    lower(coalesce(qual, '')) as using_expression,
    lower(coalesce(with_check, '')) as check_expression
  from pg_catalog.pg_policies
  where (schemaname = 'public' and tablename = 'observations')
     or (schemaname = 'storage' and tablename = 'objects'
       and policyname like 'observation_photos_%')
), private_function_creators as (
  select distinct roles.oid as role_oid, roles.rolname as role_name
  from pg_catalog.pg_proc functions
  join pg_catalog.pg_namespace namespaces on namespaces.oid = functions.pronamespace
  join pg_catalog.pg_roles roles on roles.oid = functions.proowner
  where namespaces.nspname = 'private'

  union

  select roles.oid, roles.rolname
  from pg_catalog.pg_roles roles
  where roles.rolname = current_user
), function_default_state as (
  select
    creators.role_oid,
    creators.role_name,
    global_defaults.oid is not null as global_acl_explicit,
    coalesce(
      global_defaults.defaclacl,
      acldefault('f'::"char", creators.role_oid)
    ) as global_effective_acl,
    private_defaults.defaclacl as private_additions_acl
  from private_function_creators creators
  left join pg_catalog.pg_default_acl global_defaults
    on global_defaults.defaclrole = creators.role_oid
   and global_defaults.defaclnamespace = 0
   and global_defaults.defaclobjtype = 'f'
  left join pg_catalog.pg_default_acl private_defaults
    on private_defaults.defaclrole = creators.role_oid
   and private_defaults.defaclnamespace = to_regnamespace('private')
   and private_defaults.defaclobjtype = 'f'
), unsafe_function_defaults as (
  select state.role_name, 'global' as source, global_acl_entry.grantee
  from function_default_state state
  cross join lateral aclexplode(
    case
      when array_ndims(state.global_effective_acl) = 1
        then state.global_effective_acl
      else null::aclitem[]
    end
  ) as global_acl_entry
  left join pg_catalog.pg_roles global_grantee_role
    on global_grantee_role.oid = global_acl_entry.grantee
  where global_acl_entry.privilege_type = 'EXECUTE'
    and (
      global_acl_entry.grantee = 0
      or global_grantee_role.rolname in ('anon', 'authenticated')
    )

  union all

  select state.role_name, 'private-schema', private_acl_entry.grantee
  from function_default_state state
  cross join lateral aclexplode(
    case
      when array_ndims(state.private_additions_acl) = 1
        then state.private_additions_acl
      else null::aclitem[]
    end
  ) as private_acl_entry
  left join pg_catalog.pg_roles private_grantee_role
    on private_grantee_role.oid = private_acl_entry.grantee
  where private_acl_entry.privilege_type = 'EXECUTE'
    and (
      private_acl_entry.grantee = 0
      or private_grantee_role.rolname in ('anon', 'authenticated')
    )
), checks(check_name, passed, details) as (
  select
    'xp_fixed_amount_constraint',
    coalesce(bool_or(
      definition like '%event_type = ''species-discovery''%amount = 50%'
      and definition like '%event_type = ''first-species-bonus''%amount = 50%'
      and definition like '%event_type = ''category-bonus''%amount = 75%'
      and definition like '%event_type = ''variant-discovery''%amount = 20%'
    ), false),
    coalesce(string_agg(constraint_name || ': ' || definition, E'\n' order by constraint_name), 'No hay CHECK en xp_events')
  from constraint_definitions
  where table_name = 'xp_events' and constraint_type = 'c'

  union all

  select
    'xp_source_constraint',
    coalesce(bool_or(
      definition like '%observation_id is not null%'
      and definition like '%challenge_id is null%'
      and definition like '%event_type = ''challenge-reward''%'
      and definition like '%challenge_id is not null%'
    ), false),
    coalesce(string_agg(constraint_name || ': ' || definition, E'\n' order by constraint_name), 'No hay CHECK en xp_events')
  from constraint_definitions
  where table_name = 'xp_events' and constraint_type = 'c'

  union all

  select
    'observations_insert_rejects_deleted',
    exists (
      select 1 from policy_definitions
      where schemaname = 'public'
        and tablename = 'observations'
        and policyname = 'observations_insert_own'
        and command = 'insert'
        and check_expression like '%auth.uid()%'
        and check_expression like '%user_id%'
        and check_expression like '%deleted_at is null%'
    ),
    coalesce((
      select check_expression from policy_definitions
      where schemaname = 'public'
        and tablename = 'observations'
        and policyname = 'observations_insert_own'
    ), 'Política ausente')

  union all

  select
    'storage_select_checks_folder_and_owner',
    exists (
      select 1 from policy_definitions
      where schemaname = 'storage'
        and policyname = 'observation_photos_select_own'
        and command = 'select'
        and using_expression like '%observation-photos%'
        and using_expression like '%foldername%'
        and using_expression like '%auth.uid()%'
        and using_expression like '%owner_id%'
    ),
    coalesce((
      select using_expression from policy_definitions
      where schemaname = 'storage' and policyname = 'observation_photos_select_own'
    ), 'Política ausente')

  union all

  select
    'storage_insert_checks_user_folder',
    exists (
      select 1 from policy_definitions
      where schemaname = 'storage'
        and policyname = 'observation_photos_insert_own'
        and command = 'insert'
        and check_expression like '%observation-photos%'
        and check_expression like '%foldername%'
        and check_expression like '%auth.uid()%'
    ),
    coalesce((
      select check_expression from policy_definitions
      where schemaname = 'storage' and policyname = 'observation_photos_insert_own'
    ), 'Política ausente')

  union all

  select
    'storage_update_checks_folder_and_owner',
    exists (
      select 1 from policy_definitions
      where schemaname = 'storage'
        and policyname = 'observation_photos_update_own'
        and command = 'update'
        and using_expression like '%foldername%'
        and using_expression like '%owner_id%'
        and check_expression like '%foldername%'
        and check_expression like '%owner_id%'
        and using_expression like '%auth.uid()%'
        and check_expression like '%auth.uid()%'
    ),
    coalesce((
      select 'USING: ' || using_expression || E'\nWITH CHECK: ' || check_expression
      from policy_definitions
      where schemaname = 'storage' and policyname = 'observation_photos_update_own'
    ), 'Política ausente')

  union all

  select
    'storage_delete_checks_folder_and_owner',
    exists (
      select 1 from policy_definitions
      where schemaname = 'storage'
        and policyname = 'observation_photos_delete_own'
        and command = 'delete'
        and using_expression like '%observation-photos%'
        and using_expression like '%foldername%'
        and using_expression like '%auth.uid()%'
        and using_expression like '%owner_id%'
    ),
    coalesce((
      select using_expression from policy_definitions
      where schemaname = 'storage' and policyname = 'observation_photos_delete_own'
    ), 'Política ausente')

  union all

  select
    'private_function_default_execute_revoked',
    exists (select 1 from function_default_state)
      and not exists (select 1 from unsafe_function_defaults),
    coalesce((
      select string_agg(
        format(
          'role=%s global_explicit=%s global_dims=%s global_effective=%s private_dims=%s private_additions=%s',
          role_name,
          global_acl_explicit,
          coalesce(array_ndims(global_effective_acl)::text, 'none'),
          global_effective_acl::text,
          coalesce(array_ndims(private_additions_acl)::text, 'none'),
          coalesce(private_additions_acl::text, 'none')
        ),
        E'\n' order by role_name
      )
      from function_default_state
    ), 'No se encontró ningún rol creador')

  union all

  select
    'derived_tables_have_no_client_writes',
    not exists (
      select 1
      from information_schema.role_table_grants
      where grantee in ('anon', 'authenticated')
        and table_schema = 'public'
        and table_name in (
          'user_species_discoveries',
          'user_variant_discoveries',
          'xp_events',
          'challenge_claims',
          'user_badges'
        )
        and privilege_type in ('INSERT', 'UPDATE', 'DELETE')
    ),
    coalesce((
      select string_agg(grantee || ':' || table_name || ':' || privilege_type, ', ' order by grantee, table_name, privilege_type)
      from information_schema.role_table_grants
      where grantee in ('anon', 'authenticated')
        and table_schema = 'public'
        and table_name in (
          'user_species_discoveries',
          'user_variant_discoveries',
          'xp_events',
          'challenge_claims',
          'user_badges'
        )
        and privilege_type in ('INSERT', 'UPDATE', 'DELETE')
    ), 'Sin grants de escritura')
)
select
  check_name,
  passed,
  details
from checks
order by check_name;
