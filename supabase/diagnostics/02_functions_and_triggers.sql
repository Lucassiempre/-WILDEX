-- READ ONLY. Run this file second in the Supabase SQL Editor.
with expected_functions(function_name) as (
  values
    ('set_updated_at'),
    ('create_profile_for_new_user'),
    ('protect_observation_identity'),
    ('award_observation_discoveries')
), function_state as (
  select
    expected.function_name,
    functions.oid is not null as exists,
    namespaces.nspname as schema_name,
    pg_get_userbyid(functions.proowner) as owner,
    functions.prosecdef as security_definer,
    functions.proconfig as runtime_config,
    functions.proacl::text as acl,
    case when functions.oid is null then null
      else has_function_privilege('anon', functions.oid, 'execute') end as anon_can_execute,
    case when functions.oid is null then null
      else has_function_privilege('authenticated', functions.oid, 'execute') end as authenticated_can_execute,
    case when functions.oid is null then null
      else pg_get_functiondef(functions.oid) end as definition
  from expected_functions expected
  left join pg_catalog.pg_namespace namespaces on namespaces.nspname = 'private'
  left join pg_catalog.pg_proc functions
    on functions.pronamespace = namespaces.oid
   and functions.proname = expected.function_name
   and functions.pronargs = 0
), trigger_state as (
  select
    namespaces.nspname as table_schema,
    tables.relname as table_name,
    triggers.tgname as trigger_name,
    case triggers.tgenabled
      when 'O' then 'enabled'
      when 'D' then 'disabled'
      when 'R' then 'replica'
      when 'A' then 'always'
      else triggers.tgenabled::text
    end as state,
    pg_get_triggerdef(triggers.oid, true) as definition
  from pg_catalog.pg_trigger triggers
  join pg_catalog.pg_class tables on tables.oid = triggers.tgrelid
  join pg_catalog.pg_namespace namespaces on namespaces.oid = tables.relnamespace
  where not triggers.tgisinternal
    and triggers.tgname in (
      'species_set_updated_at',
      'species_variants_set_updated_at',
      'thematic_collections_set_updated_at',
      'profiles_set_updated_at',
      'observations_set_updated_at',
      'create_profile_after_signup',
      'challenges_set_updated_at',
      'observations_protect_identity',
      'observations_award_discoveries'
    )
), private_defaults as (
  select
    pg_get_userbyid(defaults.defaclrole) as owner,
    namespaces.nspname as schema_name,
    defaults.defaclobjtype as object_type,
    defaults.defaclacl::text as acl
  from pg_catalog.pg_default_acl defaults
  join pg_catalog.pg_namespace namespaces on namespaces.oid = defaults.defaclnamespace
  where namespaces.nspname = 'private'
)
select jsonb_build_object(
  'private_schema_exists', to_regnamespace('private') is not null,
  'private_schema_usage', jsonb_build_object(
    'anon', has_schema_privilege('anon', to_regnamespace('private'), 'usage'),
    'authenticated', has_schema_privilege('authenticated', to_regnamespace('private'), 'usage')
  ),
  'functions', (
    select jsonb_agg(to_jsonb(function_state) order by function_name)
    from function_state
  ),
  'triggers', (
    select coalesce(jsonb_agg(to_jsonb(trigger_state) order by table_schema, table_name, trigger_name), '[]'::jsonb)
    from trigger_state
  ),
  'private_default_privileges', (
    select coalesce(jsonb_agg(to_jsonb(private_defaults) order by owner, object_type), '[]'::jsonb)
    from private_defaults
  )
) as wildex_function_diagnostic;
