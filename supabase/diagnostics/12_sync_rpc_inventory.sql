-- Read-only inventory for the three synchronization RPCs reviewed by migration 008.

with function_inventory as (
  select
    functions.oid,
    namespaces.nspname::text as function_schema,
    functions.proname::text as function_name,
    pg_catalog.pg_get_function_identity_arguments(functions.oid) as identity_arguments_with_names,
    pg_catalog.oidvectortypes(functions.proargtypes) as identity_argument_types,
    pg_catalog.pg_get_function_arguments(functions.oid) as complete_arguments,
    pg_catalog.pg_get_function_result(functions.oid) as return_type,
    functions.prorettype::regtype::text as return_type_regtype,
    functions.prosecdef as security_definer,
    case functions.provolatile
      when 'i'::"char" then 'IMMUTABLE'
      when 's'::"char" then 'STABLE'
      when 'v'::"char" then 'VOLATILE'
      else 'UNKNOWN:' || functions.provolatile::text
    end as volatility,
    functions.proconfig as function_config,
    coalesce((
      select settings.setting
      from unnest(functions.proconfig) settings(setting)
      where settings.setting like 'search_path=%'
      limit 1
    ), '<not-set>') as search_path_setting,
    pg_catalog.pg_get_userbyid(functions.proowner) as owner_name,
    functions.proowner as owner_oid,
    functions.proacl::text as explicit_acl,
    exists (
      select 1
      from pg_catalog.aclexplode(
        coalesce(functions.proacl, pg_catalog.acldefault('f'::"char", functions.proowner))
      ) acl
      where acl.grantee = 0
        and acl.privilege_type = 'EXECUTE'
    ) as public_effective_execute,
    pg_catalog.has_function_privilege('anon', functions.oid, 'EXECUTE') as anon_effective_execute,
    pg_catalog.has_function_privilege('authenticated', functions.oid, 'EXECUTE') as authenticated_effective_execute,
    pg_catalog.md5(
      pg_catalog.btrim(pg_catalog.regexp_replace(functions.prosrc, '\s+', ' ', 'g'))
    ) as normalized_body_md5,
    case pg_catalog.md5(
      pg_catalog.btrim(pg_catalog.regexp_replace(functions.prosrc, '\s+', ' ', 'g'))
    )
      when '1b28895bd594b7ac514d9815bfdb8e3b' then 'migration-006:sync_observation'
      when '1bf8b6ba1d2f688e5067e8cfd65735dd' then 'migration-006:attach_observation_photo'
      when 'd1c7b99ec146c2b6490655adb54a0d56' then 'migration-006:complete_sync_import'
      when '8a664859ff573cf7d7937d262d961461' then 'migration-008:sync_observation'
      when '5420a1904d3bbd578859ff5fd18c8a23' then 'migration-008:attach_observation_photo'
      when '71e8f71756e0c65578f5c1db94403bb1' then 'migration-008:complete_sync_import'
      else 'unknown-variant'
    end as fingerprint_classification,
    position('sync_import_observations' in functions.prosrc) > 0 as uses_import_observation_links,
    position('sync_legacy_observation_map' in functions.prosrc) > 0 as uses_legacy_observation_map,
    position('observations.user_id = current_user_id' in functions.prosrc) > 0 as uses_owner_scoped_observation_lookup,
    position('where id = p_observation_id' in functions.prosrc) > 0 as uses_unqualified_observation_lookup,
    pg_catalog.pg_get_functiondef(functions.oid) as full_definition
  from pg_catalog.pg_proc functions
  join pg_catalog.pg_namespace namespaces on namespaces.oid = functions.pronamespace
  where namespaces.nspname::text = 'public'
    and functions.proname::text in (
      'sync_observation',
      'attach_observation_photo',
      'complete_sync_import'
    )
)
select
  function_schema,
  function_name,
  oid,
  function_schema || '.' || function_name || '(' || identity_argument_types || ')' as canonical_signature,
  identity_arguments_with_names,
  identity_argument_types,
  complete_arguments,
  return_type,
  return_type_regtype,
  security_definer,
  volatility,
  function_config,
  search_path_setting,
  owner_name,
  owner_oid,
  explicit_acl,
  public_effective_execute,
  anon_effective_execute,
  authenticated_effective_execute,
  normalized_body_md5,
  fingerprint_classification,
  uses_import_observation_links,
  uses_legacy_observation_map,
  uses_owner_scoped_observation_lookup,
  uses_unqualified_observation_lookup,
  full_definition
from function_inventory
order by function_name, identity_argument_types, oid;

