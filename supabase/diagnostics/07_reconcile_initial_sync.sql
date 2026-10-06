-- READ ONLY. Compare a partial/unknown installation with the CURRENT
-- 202609280006_initial_sync.sql. This query only reads PostgreSQL catalogs.
with expected_tables(schema_name, table_name, rls_enabled) as (
  values
    ('public', 'sync_imports', true),
    ('public', 'sync_import_challenge_claims', true)
), actual_tables as (
  select
    namespaces.nspname as schema_name,
    tables.relname as table_name,
    tables.oid as table_oid,
    tables.relrowsecurity as rls_enabled,
    tables.relforcerowsecurity as rls_forced
  from pg_catalog.pg_class tables
  join pg_catalog.pg_namespace namespaces on namespaces.oid = tables.relnamespace
  where tables.relkind = 'r'
), expected_columns(table_name, column_name, data_type, not_null, default_fragment) as (
  values
    ('sync_imports', 'id', 'uuid', true, 'gen_random_uuid()'),
    ('sync_imports', 'user_id', 'uuid', true, null),
    ('sync_imports', 'dataset_id', 'uuid', true, null),
    ('sync_imports', 'manifest_sha256', 'text', true, null),
    ('sync_imports', 'schema_version', 'integer', true, null),
    ('sync_imports', 'expected_observation_count', 'integer', true, null),
    ('sync_imports', 'expected_photo_count', 'integer', true, null),
    ('sync_imports', 'expected_challenge_claim_count', 'integer', true, null),
    ('sync_imports', 'expects_profile', 'boolean', true, 'true'),
    ('sync_imports', 'processed_observation_count', 'integer', true, '0'),
    ('sync_imports', 'processed_photo_count', 'integer', true, '0'),
    ('sync_imports', 'processed_challenge_claim_count', 'integer', true, '0'),
    ('sync_imports', 'profile_synced_at', 'timestamp with time zone', false, null),
    ('sync_imports', 'local_xp_snapshot', 'integer', false, null),
    ('sync_imports', 'status', 'text', true, '''pending''::text'),
    ('sync_imports', 'created_at', 'timestamp with time zone', true, 'now()'),
    ('sync_imports', 'updated_at', 'timestamp with time zone', true, 'now()'),
    ('sync_imports', 'completed_at', 'timestamp with time zone', false, null),
    ('sync_import_challenge_claims', 'user_id', 'uuid', true, null),
    ('sync_import_challenge_claims', 'import_id', 'uuid', true, null),
    ('sync_import_challenge_claims', 'challenge_id', 'text', true, null),
    ('sync_import_challenge_claims', 'created_at', 'timestamp with time zone', true, 'now()'),
    ('profiles', 'sync_revision', 'bigint', true, '1'),
    ('profiles', 'client_updated_at', 'timestamp with time zone', false, null),
    ('observations', 'sync_revision', 'bigint', true, '1'),
    ('observations', 'client_updated_at', 'timestamp with time zone', false, null),
    ('observations', 'import_id', 'uuid', false, null),
    ('observations', 'legacy_source_id', 'text', false, null),
    ('profile_featured_badges', 'removed_at', 'timestamp with time zone', false, null)
), actual_columns as (
  select
    tables.relname as table_name,
    columns.attname as column_name,
    pg_catalog.format_type(columns.atttypid, columns.atttypmod) as data_type,
    columns.attnotnull as not_null,
    pg_catalog.pg_get_expr(defaults.adbin, defaults.adrelid) as default_expression
  from pg_catalog.pg_attribute columns
  join pg_catalog.pg_class tables on tables.oid = columns.attrelid
  join pg_catalog.pg_namespace namespaces on namespaces.oid = tables.relnamespace
  left join pg_catalog.pg_attrdef defaults
    on defaults.adrelid = columns.attrelid
   and defaults.adnum = columns.attnum
  where namespaces.nspname = 'public'
    and tables.relkind = 'r'
    and columns.attnum > 0
    and not columns.attisdropped
), expected_named_constraints(table_name, constraint_name, constraint_type, definition_fragments) as (
  values
    ('profiles', 'profiles_username_length_check', 'c', array['username', 'char_length', '3', '20']::text[]),
    ('profiles', 'profiles_display_name_length_check', 'c', array['display_name', 'char_length', '1', '40']::text[]),
    ('profiles', 'profiles_bio_length_check', 'c', array['bio', 'char_length', '160']::text[]),
    ('observations', 'observations_import_owner_fkey', 'f', array['foreign key (user_id, import_id)', 'sync_imports(user_id, id)', 'on delete restrict']::text[]),
    ('observations', 'observations_legacy_source_requires_import_check', 'c', array['legacy_source_id', 'import_id', 'char_length', '1', '240']::text[]),
    ('observations', 'observations_photo_metadata_complete_check', 'c', array['photo_path', 'photo_mime_type', 'photo_size_bytes', 'photo_sha256']::text[]),
    ('sync_imports', 'sync_imports_pkey', 'p', array['primary key (id)']::text[]),
    ('sync_imports', 'sync_imports_user_id_fkey', 'f', array['foreign key (user_id)', 'auth.users(id)', 'on delete cascade']::text[]),
    ('sync_imports', 'sync_imports_user_id_dataset_id_manifest_sha256_key', 'u', array['unique (user_id, dataset_id, manifest_sha256)']::text[]),
    ('sync_imports', 'sync_imports_user_id_id_key', 'u', array['unique (user_id, id)']::text[]),
    ('sync_import_challenge_claims', 'sync_import_challenge_claims_pkey', 'p', array['primary key (user_id, import_id, challenge_id)']::text[]),
    ('sync_import_challenge_claims', 'sync_import_challenge_claims_user_id_fkey', 'f', array['foreign key (user_id)', 'auth.users(id)', 'on delete cascade']::text[]),
    ('sync_import_challenge_claims', 'sync_import_challenge_claims_user_id_import_id_fkey', 'f', array['foreign key (user_id, import_id)', 'sync_imports(user_id, id)', 'on delete restrict']::text[]),
    ('sync_import_challenge_claims', 'sync_import_challenge_claims_user_id_challenge_id_fkey', 'f', array['foreign key (user_id, challenge_id)', 'challenge_claims(user_id, challenge_id)', 'on delete restrict']::text[])
), constraints_expected_absent(table_name, constraint_name) as (
  values
    ('profile_featured_badges', 'profile_featured_badges_user_id_position_key')
), expected_constraint_fragments(check_name, table_name, definition_fragment) as (
  values
    ('sync_manifest_sha256_check', 'sync_imports', 'manifest_sha256 ~ ''^[0-9a-f]{64}$'''),
    ('sync_schema_version_check', 'sync_imports', 'schema_version > 0'),
    ('sync_expected_observations_nonnegative', 'sync_imports', 'expected_observation_count >= 0'),
    ('sync_expected_photos_nonnegative', 'sync_imports', 'expected_photo_count >= 0'),
    ('sync_expected_counts_check', 'sync_imports', 'expected_photo_count <= expected_observation_count'),
    ('sync_expected_claims_nonnegative', 'sync_imports', 'expected_challenge_claim_count >= 0'),
    ('sync_processed_observations_nonnegative', 'sync_imports', 'processed_observation_count >= 0'),
    ('sync_processed_observations_check', 'sync_imports', 'processed_observation_count <= expected_observation_count'),
    ('sync_processed_photos_nonnegative', 'sync_imports', 'processed_photo_count >= 0'),
    ('sync_processed_photos_check', 'sync_imports', 'processed_photo_count <= expected_photo_count'),
    ('sync_processed_claims_nonnegative', 'sync_imports', 'processed_challenge_claim_count >= 0'),
    ('sync_processed_claims_check', 'sync_imports', 'processed_challenge_claim_count <= expected_challenge_claim_count'),
    ('sync_local_xp_nonnegative', 'sync_imports', 'local_xp_snapshot >= 0'),
    ('sync_status_check', 'sync_imports', 'status = ''pending''::text'),
    ('sync_status_completed_check', 'sync_imports', 'status = ''completed''::text'),
    ('sync_completion_check', 'sync_imports', 'completed_at is null'),
    ('sync_completed_at_check', 'sync_imports', 'completed_at is not null'),
    ('profile_sync_revision_check', 'profiles', 'sync_revision > 0'),
    ('observation_sync_revision_check', 'observations', 'sync_revision > 0'),
    ('observation_photo_path_check', 'observations', 'photo_path ='),
    ('observation_photo_path_user_check', 'observations', 'user_id::text'),
    ('observation_photo_path_id_check', 'observations', 'id::text'),
    ('observation_photo_sha_check', 'observations', 'photo_sha256'),
    ('observation_photo_mime_check', 'observations', 'photo_mime_type = any'),
    ('observation_photo_size_check', 'observations', 'photo_size_bytes > 0'),
    ('observation_legacy_import_check', 'observations', 'legacy_source_id is null')
), actual_constraints as (
  select
    tables.relname as table_name,
    constraints.conname as constraint_name,
    constraints.contype::text as constraint_type,
    lower(pg_catalog.pg_get_constraintdef(constraints.oid, true)) as definition
  from pg_catalog.pg_constraint constraints
  join pg_catalog.pg_class tables on tables.oid = constraints.conrelid
  join pg_catalog.pg_namespace namespaces on namespaces.oid = tables.relnamespace
  where namespaces.nspname = 'public'
), expected_indexes(table_name, index_name, definition_fragments) as (
  values
    ('observations', 'observations_import_legacy_source_key', array['unique index', '(user_id, import_id, legacy_source_id)', 'where ((import_id is not null) and (legacy_source_id is not null))']::text[]),
    ('observations', 'observations_user_updated_at_idx', array['(user_id, updated_at, id)']::text[]),
    ('sync_imports', 'sync_imports_user_updated_at_idx', array['(user_id, updated_at desc)']::text[]),
    ('profile_featured_badges', 'profile_featured_badges_active_position_key', array['unique index', '(user_id, "position")', 'where (removed_at is null)']::text[])
), actual_indexes as (
  select tablename as table_name, indexname as index_name, lower(indexdef) as definition
  from pg_catalog.pg_indexes
  where schemaname = 'public'
), expected_functions(schema_name, function_name, argument_types, return_type, security_definer, volatility, body_md5) as (
  values
    ('private', 'bump_sync_revision', '', 'trigger', false, 'v', 'f3ebec5bed83fa2258135099777f496d'),
    ('private', 'protect_observation_sync_identity', '', 'trigger', false, 'v', 'e6085b8ae1e8d4b1a4bdf5335b8c1ef2'),
    ('private', 'challenge_objective_progress', 'uuid, text, text', 'integer', false, 's', 'd84e7b4aca0f9ee04c95d4d67d288673'),
    ('public', 'begin_sync_import', 'uuid, text, integer, integer, integer, integer, boolean, integer', 'sync_imports', true, 'v', '74c9c1ecfa0fa0ae203f18ef09caf1d6'),
    ('public', 'sync_observation', 'uuid, text, timestamp with time zone, text, text, double precision, double precision, text, text, timestamp with time zone, timestamp with time zone, uuid, text, bigint', 'observations', true, 'v', '1b28895bd594b7ac514d9815bfdb8e3b'),
    ('public', 'attach_observation_photo', 'uuid, text, text, bigint, text, bigint', 'observations', true, 'v', '1bf8b6ba1d2f688e5067e8cfd65735dd'),
    ('public', 'sync_profile', 'text, text, text, jsonb, text, text[], timestamp with time zone, uuid, bigint', 'jsonb', true, 'v', 'a0ab5f975b6d37c7a2d799afbb1c6e22'),
    ('public', 'claim_challenge', 'text, uuid, timestamp with time zone', 'jsonb', true, 'v', '894c8ab69e3806a183f57c40cb4e6559'),
    ('public', 'complete_sync_import', 'uuid', 'sync_imports', true, 'v', 'd1c7b99ec146c2b6490655adb54a0d56'),
    ('public', 'get_account_snapshot', '', 'jsonb', false, 's', '723e14da38601c60ca0beea822a169ac')
), actual_functions as (
  select
    namespaces.nspname as schema_name,
    functions.proname as function_name,
    pg_catalog.oidvectortypes(functions.proargtypes) as argument_types,
    pg_catalog.pg_get_function_result(functions.oid) as return_type,
    functions.prosecdef as security_definer,
    functions.provolatile::text as volatility,
    functions.proconfig as runtime_config,
    functions.proacl::text as acl,
    md5(pg_catalog.btrim(pg_catalog.regexp_replace(functions.prosrc, '\s+', ' ', 'g'))) as body_md5,
    pg_catalog.pg_get_functiondef(functions.oid) as definition,
    has_function_privilege('anon', functions.oid, 'execute') as anon_can_execute,
    has_function_privilege('authenticated', functions.oid, 'execute') as authenticated_can_execute
  from pg_catalog.pg_proc functions
  join pg_catalog.pg_namespace namespaces on namespaces.oid = functions.pronamespace
  where namespaces.nspname in ('public', 'private')
), expected_function_fragments(schema_name, function_name, argument_types, fragment_name, definition_fragment) as (
  values
    ('public', 'begin_sync_import', 'uuid, text, integer, integer, integer, integer, boolean, integer', 'auth_uid', 'auth.uid()'),
    ('public', 'begin_sync_import', 'uuid, text, integer, integer, integer, integer, boolean, integer', 'manifest_conflict', 'sync_manifest_conflict'),
    ('public', 'sync_observation', 'uuid, text, timestamp with time zone, text, text, double precision, double precision, text, text, timestamp with time zone, timestamp with time zone, uuid, text, bigint', 'auth_uid', 'auth.uid()'),
    ('public', 'sync_observation', 'uuid, text, timestamp with time zone, text, text, double precision, double precision, text, text, timestamp with time zone, timestamp with time zone, uuid, text, bigint', 'identity_conflict', 'observation_identity_conflict'),
    ('public', 'sync_observation', 'uuid, text, timestamp with time zone, text, text, double precision, double precision, text, text, timestamp with time zone, timestamp with time zone, uuid, text, bigint', 'revision_conflict', 'observation_revision_conflict'),
    ('public', 'attach_observation_photo', 'uuid, text, text, bigint, text, bigint', 'storage_validation', 'from storage.objects'),
    ('public', 'attach_observation_photo', 'uuid, text, text, bigint, text, bigint', 'owner_validation', 'objects.owner_id = current_user_id::text'),
    ('public', 'sync_profile', 'text, text, text, jsonb, text, text[], timestamp with time zone, uuid, bigint', 'soft_featured_badges', 'set removed_at = now()'),
    ('public', 'sync_profile', 'text, text, text, jsonb, text, text[], timestamp with time zone, uuid, bigint', 'profile_revision', 'profile_revision_conflict'),
    ('public', 'claim_challenge', 'text, uuid, timestamp with time zone', 'server_reward', 'challenge_row.xp_reward'),
    ('public', 'claim_challenge', 'text, uuid, timestamp with time zone', 'server_progress', 'private.challenge_objective_progress'),
    ('public', 'claim_challenge', 'text, uuid, timestamp with time zone', 'idempotent_event', 'on conflict (user_id, event_key) do nothing'),
    ('public', 'complete_sync_import', 'uuid', 'counts_observations', 'expected_observation_count'),
    ('public', 'complete_sync_import', 'uuid', 'counts_photos', 'expected_photo_count'),
    ('public', 'complete_sync_import', 'uuid', 'counts_claims', 'expected_challenge_claim_count'),
    ('public', 'complete_sync_import', 'uuid', 'requires_profile', 'profile_synced_at is null'),
    ('public', 'get_account_snapshot', '', 'snapshot_observations', '''observations'''),
    ('public', 'get_account_snapshot', '', 'snapshot_xp', '''xptotal'''),
    ('private', 'challenge_objective_progress', 'uuid, text, text', 'all_objectives', 'unsupported_challenge_objective')
), expected_triggers(table_schema, table_name, trigger_name, function_schema, function_name, required_fragment) as (
  values
    ('public', 'profiles', 'profiles_bump_sync_revision', 'private', 'bump_sync_revision', 'before update'),
    ('public', 'observations', 'observations_bump_sync_revision', 'private', 'bump_sync_revision', 'before update'),
    ('public', 'sync_imports', 'sync_imports_set_updated_at', 'private', 'set_updated_at', 'before update'),
    ('public', 'observations', 'observations_protect_sync_identity', 'private', 'protect_observation_sync_identity', 'before update')
), preserved_triggers(table_schema, table_name, trigger_name) as (
  values
    ('public', 'species', 'species_set_updated_at'),
    ('public', 'species_variants', 'species_variants_set_updated_at'),
    ('public', 'thematic_collections', 'thematic_collections_set_updated_at'),
    ('public', 'profiles', 'profiles_set_updated_at'),
    ('public', 'observations', 'observations_set_updated_at'),
    ('auth', 'users', 'create_profile_after_signup'),
    ('public', 'challenges', 'challenges_set_updated_at'),
    ('public', 'observations', 'observations_protect_identity'),
    ('public', 'observations', 'observations_award_discoveries')
), actual_triggers as (
  select
    table_namespaces.nspname as table_schema,
    tables.relname as table_name,
    triggers.tgname as trigger_name,
    function_namespaces.nspname as function_schema,
    functions.proname as function_name,
    triggers.tgenabled::text as enabled,
    lower(pg_catalog.pg_get_triggerdef(triggers.oid, true)) as definition
  from pg_catalog.pg_trigger triggers
  join pg_catalog.pg_class tables on tables.oid = triggers.tgrelid
  join pg_catalog.pg_namespace table_namespaces on table_namespaces.oid = tables.relnamespace
  join pg_catalog.pg_proc functions on functions.oid = triggers.tgfoid
  join pg_catalog.pg_namespace function_namespaces on function_namespaces.oid = functions.pronamespace
  where not triggers.tgisinternal
), expected_policies(schema_name, table_name, policy_name, command, required_fragments) as (
  values
    ('public', 'sync_imports', 'sync_imports_select_own', 'select', array['auth.uid()', 'user_id']::text[]),
    ('public', 'sync_import_challenge_claims', 'sync_import_challenge_claims_select_own', 'select', array['auth.uid()', 'user_id']::text[]),
    ('storage', 'objects', 'observation_photos_select_own', 'select', array['observation-photos', 'owner_id', 'observations', 'split_part', 'deleted_at is null']::text[]),
    ('storage', 'objects', 'observation_photos_insert_own', 'insert', array['observation-photos', 'observations', 'split_part', 'deleted_at is null']::text[])
), policies_expected_absent(schema_name, table_name, policy_name) as (
  values
    ('public', 'profiles', 'profiles_insert_own'),
    ('public', 'profiles', 'profiles_update_own'),
    ('public', 'profiles', 'profiles_delete_own'),
    ('public', 'observations', 'observations_insert_own'),
    ('public', 'observations', 'observations_update_own'),
    ('public', 'observations', 'observations_delete_own'),
    ('public', 'profile_featured_badges', 'featured_badges_insert_own'),
    ('public', 'profile_featured_badges', 'featured_badges_update_own'),
    ('public', 'profile_featured_badges', 'featured_badges_delete_own'),
    ('storage', 'objects', 'observation_photos_update_own'),
    ('storage', 'objects', 'observation_photos_delete_own')
), preserved_policies(schema_name, table_name, policy_name, command, required_fragments) as (
  values
    ('public', 'profiles', 'profiles_select_own', 'select', array['auth.uid()', 'id']::text[]),
    ('public', 'observations', 'observations_select_own', 'select', array['auth.uid()', 'user_id']::text[]),
    ('public', 'profile_featured_badges', 'featured_badges_select_own', 'select', array['auth.uid()', 'user_id']::text[])
), actual_policies as (
  select
    schemaname as schema_name,
    tablename as table_name,
    policyname as policy_name,
    lower(cmd) as command,
    roles,
    lower(coalesce(qual, '')) as using_expression,
    lower(coalesce(with_check, '')) as check_expression,
    lower(coalesce(qual, '') || ' ' || coalesce(with_check, '')) as combined_expression
  from pg_catalog.pg_policies
), client_roles(role_name) as (
  values ('anon'), ('authenticated')
), managed_tables(table_name) as (
  values ('profiles'), ('observations'), ('profile_featured_badges'),
    ('sync_imports'), ('sync_import_challenge_claims')
), write_privileges(privilege_type) as (
  values ('INSERT'), ('UPDATE'), ('DELETE'), ('TRUNCATE')
), effective_write_grants as (
  select roles.role_name as grantee, tables.table_name, privileges.privilege_type
  from client_roles roles
  cross join managed_tables tables
  cross join write_privileges privileges
  join actual_tables actual
    on actual.schema_name = 'public' and actual.table_name = tables.table_name
  where pg_catalog.has_table_privilege(
    roles.role_name,
    actual.table_oid,
    privileges.privilege_type
  )
), expected_table_privileges(table_name, grantee, privilege_type, should_have) as (
  values
    ('sync_imports', 'authenticated', 'SELECT', true),
    ('sync_imports', 'anon', 'SELECT', false),
    ('sync_import_challenge_claims', 'authenticated', 'SELECT', false),
    ('sync_import_challenge_claims', 'anon', 'SELECT', false)
), preserved_tables(table_name) as (
  values
    ('species'), ('species_variants'), ('thematic_collections'),
    ('thematic_collection_species'), ('profiles'), ('observations'),
    ('badges'), ('challenges'), ('challenge_objectives'),
    ('user_species_discoveries'), ('user_variant_discoveries'), ('xp_events'),
    ('challenge_claims'), ('user_badges'), ('profile_featured_badges')
), preserved_private_functions(function_name, argument_types) as (
  values
    ('set_updated_at', ''),
    ('create_profile_for_new_user', ''),
    ('protect_observation_identity', ''),
    ('award_observation_discoveries', '')
), report(section, object_name, status, expected, actual) as (
  select
    'tables',
    expected.schema_name || '.' || expected.table_name,
    case
      when actual.table_name is null then 'missing'
      when actual.rls_enabled is distinct from expected.rls_enabled then 'different'
      else 'match'
    end,
    'exists; rls=' || expected.rls_enabled::text,
    case when actual.table_name is null then 'absent'
      else 'exists; rls=' || actual.rls_enabled::text || '; force_rls=' || actual.rls_forced::text end
  from expected_tables expected
  left join actual_tables actual
    on actual.schema_name = expected.schema_name and actual.table_name = expected.table_name

  union all

  select
    'columns-inventory',
    'public.' || actual.table_name || '.' || actual.column_name,
    'inventory',
    'inspect when an older 006 may have added extra columns',
    'type=' || actual.data_type || '; not_null=' || actual.not_null::text || '; default=' || coalesce(actual.default_expression, 'none')
  from actual_columns actual
  where actual.table_name in (
    'profiles', 'observations', 'profile_featured_badges',
    'sync_imports', 'sync_import_challenge_claims'
  )

  union all

  select
    'columns',
    'public.' || expected.table_name || '.' || expected.column_name,
    case
      when actual.column_name is null then 'missing'
      when actual.data_type <> expected.data_type
        or actual.not_null is distinct from expected.not_null
        or (expected.default_fragment is not null and coalesce(lower(actual.default_expression), '') not like '%' || lower(expected.default_fragment) || '%')
        or (expected.default_fragment is null and actual.default_expression is not null)
      then 'different'
      else 'match'
    end,
    'type=' || expected.data_type || '; not_null=' || expected.not_null::text || '; default=' || coalesce(expected.default_fragment, 'none'),
    case when actual.column_name is null then 'absent'
      else 'type=' || actual.data_type || '; not_null=' || actual.not_null::text || '; default=' || coalesce(actual.default_expression, 'none') end
  from expected_columns expected
  left join actual_columns actual
    on actual.table_name = expected.table_name and actual.column_name = expected.column_name

  union all

  select
    'columns-unexpected',
    'public.' || actual.table_name || '.' || actual.column_name,
    'unexpected',
    'not present in current 006 table definition',
    'type=' || actual.data_type || '; not_null=' || actual.not_null::text || '; default=' || coalesce(actual.default_expression, 'none')
  from actual_columns actual
  where actual.table_name in ('sync_imports', 'sync_import_challenge_claims')
    and not exists (
      select 1 from expected_columns expected
      where expected.table_name = actual.table_name and expected.column_name = actual.column_name
    )

  union all

  select
    'constraints-named',
    'public.' || expected.table_name || '.' || expected.constraint_name,
    case
      when actual.constraint_name is null then 'missing'
      when actual.constraint_type <> expected.constraint_type
        or not (
          select bool_and(actual.definition like '%' || lower(fragment) || '%')
          from unnest(expected.definition_fragments) fragment
        )
      then 'different'
      else 'match'
    end,
    'type=' || expected.constraint_type || '; fragments=' || array_to_string(expected.definition_fragments, ', '),
    case when actual.constraint_name is null then 'absent'
      else 'type=' || actual.constraint_type || '; definition=' || actual.definition end
  from expected_named_constraints expected
  left join actual_constraints actual
    on actual.table_name = expected.table_name and actual.constraint_name = expected.constraint_name

  union all

  select
    'constraints-removed',
    'public.' || expected.table_name || '.' || expected.constraint_name,
    case when actual.constraint_name is null then 'match' else 'still-present' end,
    'absent in current 006',
    coalesce(actual.definition, 'absent')
  from constraints_expected_absent expected
  left join actual_constraints actual
    on actual.table_name = expected.table_name and actual.constraint_name = expected.constraint_name

  union all

  select
    'constraints-semantic',
    expected.table_name || '.' || expected.check_name,
    case when exists (
      select 1 from actual_constraints actual
      where actual.table_name = expected.table_name
        and actual.definition like '%' || lower(expected.definition_fragment) || '%'
    ) then 'match' else 'missing-or-different' end,
    'definition contains: ' || expected.definition_fragment,
    coalesce((
      select string_agg(actual.constraint_name || ': ' || actual.definition, E'\n' order by actual.constraint_name)
      from actual_constraints actual where actual.table_name = expected.table_name
    ), 'no constraints')
  from expected_constraint_fragments expected

  union all

  select
    'constraints-inventory',
    'public.' || actual.table_name || '.' || actual.constraint_name,
    'inventory',
    'complete constraint definition for reconciliation',
    actual.definition
  from actual_constraints actual
  where actual.table_name in (
    'profiles', 'observations', 'profile_featured_badges',
    'sync_imports', 'sync_import_challenge_claims'
  )

  union all

  select
    'indexes',
    'public.' || expected.table_name || '.' || expected.index_name,
    case
      when actual.index_name is null then 'missing'
      when not (
        select bool_and(actual.definition like '%' || lower(fragment) || '%')
        from unnest(expected.definition_fragments) fragment
      ) then 'different'
      else 'match'
    end,
    array_to_string(expected.definition_fragments, ' AND '),
    coalesce(actual.definition, 'absent')
  from expected_indexes expected
  left join actual_indexes actual
    on actual.table_name = expected.table_name and actual.index_name = expected.index_name

  union all

  select
    'indexes-inventory',
    'public.' || actual.table_name || '.' || actual.index_name,
    'inventory',
    'complete index definition for reconciliation',
    actual.definition
  from actual_indexes actual
  where actual.table_name in (
    'profiles', 'observations', 'profile_featured_badges',
    'sync_imports', 'sync_import_challenge_claims'
  )

  union all

  select
    'functions',
    expected.schema_name || '.' || expected.function_name || '(' || expected.argument_types || ')',
    case
      when actual.function_name is null then 'missing'
      when actual.return_type not in (expected.return_type, 'public.' || expected.return_type)
        or actual.security_definer is distinct from expected.security_definer
        or actual.volatility <> expected.volatility
        or not exists (
          select 1
          from unnest(coalesce(actual.runtime_config, array[]::text[])) config_entry
          where config_entry in ('search_path=""', 'search_path=')
        )
        or actual.body_md5 <> expected.body_md5
        or (expected.schema_name = 'public' and (actual.anon_can_execute or not actual.authenticated_can_execute))
        or (expected.schema_name = 'private' and (actual.anon_can_execute or actual.authenticated_can_execute))
      then 'different'
      else 'match'
    end,
    'returns=' || expected.return_type || '; security_definer=' || expected.security_definer::text ||
      '; volatility=' || expected.volatility || '; body_md5=' || expected.body_md5 ||
      '; search_path empty; public RPC auth-only/private client-denied',
    case when actual.function_name is null then 'absent'
      else 'returns=' || actual.return_type || '; security_definer=' || actual.security_definer::text ||
        '; volatility=' || actual.volatility || '; config=' || coalesce(array_to_string(actual.runtime_config, ','), 'none') ||
        '; body_md5=' || actual.body_md5 ||
        '; anon_execute=' || actual.anon_can_execute::text || '; authenticated_execute=' || actual.authenticated_can_execute::text ||
        '; acl=' || coalesce(actual.acl, 'default') end
  from expected_functions expected
  left join actual_functions actual
    on actual.schema_name = expected.schema_name
   and actual.function_name = expected.function_name
   and actual.argument_types = expected.argument_types

  union all

  select
    'functions-overloads',
    actual.schema_name || '.' || actual.function_name || '(' || actual.argument_types || ')',
    'unexpected-signature',
    'only signatures listed by current 006',
    'returns=' || actual.return_type || '; security_definer=' || actual.security_definer::text ||
      '; config=' || coalesce(array_to_string(actual.runtime_config, ','), 'none') || '; acl=' || coalesce(actual.acl, 'default')
  from actual_functions actual
  where actual.function_name in (select function_name from expected_functions)
    and not exists (
      select 1 from expected_functions expected
      where expected.schema_name = actual.schema_name
        and expected.function_name = actual.function_name
        and expected.argument_types = actual.argument_types
    )

  union all

  select
    'function-definition',
    expected.schema_name || '.' || expected.function_name || '(' || expected.argument_types || '):' || expected.fragment_name,
    case when actual.definition is not null
      and lower(actual.definition) like '%' || lower(expected.definition_fragment) || '%'
      then 'match' else 'missing-or-different' end,
    'definition contains: ' || expected.definition_fragment,
    case when actual.definition is null then 'function/signature absent' else 'fragment not found; inspect functions-definition rows' end
  from expected_function_fragments expected
  left join actual_functions actual
    on actual.schema_name = expected.schema_name
   and actual.function_name = expected.function_name
   and actual.argument_types = expected.argument_types

  union all

  select
    'functions-definition',
    actual.schema_name || '.' || actual.function_name || '(' || actual.argument_types || ')',
    'inventory',
    'current 006 definition must be reviewed if any fragment/signature differs',
    actual.definition
  from actual_functions actual
  where actual.function_name in (select function_name from expected_functions)

  union all

  select
    'triggers',
    expected.table_schema || '.' || expected.table_name || '.' || expected.trigger_name,
    case
      when actual.trigger_name is null then 'missing'
      when actual.function_schema <> expected.function_schema
        or actual.function_name <> expected.function_name
        or actual.enabled = 'D'
        or actual.definition not like '%' || expected.required_fragment || '%'
      then 'different'
      else 'match'
    end,
    'enabled; ' || expected.required_fragment || '; executes ' || expected.function_schema || '.' || expected.function_name,
    case when actual.trigger_name is null then 'absent' else actual.definition || '; enabled=' || actual.enabled end
  from expected_triggers expected
  left join actual_triggers actual
    on actual.table_schema = expected.table_schema
   and actual.table_name = expected.table_name
   and actual.trigger_name = expected.trigger_name

  union all

  select
    'triggers-unexpected',
    actual.table_schema || '.' || actual.table_name || '.' || actual.trigger_name,
    'unexpected',
    'not defined by current 006 or preserved from 001-005',
    actual.definition || '; enabled=' || actual.enabled
  from actual_triggers actual
  where actual.table_schema = 'public'
    and actual.table_name in ('profiles', 'observations', 'sync_imports')
    and not exists (
      select 1 from expected_triggers expected
      where expected.table_schema = actual.table_schema
        and expected.table_name = actual.table_name
        and expected.trigger_name = actual.trigger_name
    )
    and not exists (
      select 1 from preserved_triggers expected
      where expected.table_schema = actual.table_schema
        and expected.table_name = actual.table_name
        and expected.trigger_name = actual.trigger_name
    )

  union all

  select
    'policies',
    expected.schema_name || '.' || expected.table_name || '.' || expected.policy_name,
    case
      when actual.policy_name is null then 'missing'
      when actual.command <> expected.command
        or actual.roles::text <> '{authenticated}'
        or not (
          select bool_and(actual.combined_expression like '%' || lower(fragment) || '%')
          from unnest(expected.required_fragments) fragment
        )
      then 'different'
      else 'match'
    end,
    'command=' || expected.command || '; fragments=' || array_to_string(expected.required_fragments, ', '),
    case when actual.policy_name is null then 'absent'
      else 'command=' || actual.command || '; roles=' || actual.roles::text ||
        '; using=' || actual.using_expression || '; check=' || actual.check_expression end
  from expected_policies expected
  left join actual_policies actual
    on actual.schema_name = expected.schema_name
   and actual.table_name = expected.table_name
   and actual.policy_name = expected.policy_name

  union all

  select
    'policies-removed',
    expected.schema_name || '.' || expected.table_name || '.' || expected.policy_name,
    case when actual.policy_name is null then 'match' else 'still-present' end,
    'absent in current 006',
    case when actual.policy_name is null then 'absent'
      else 'command=' || actual.command || '; roles=' || actual.roles::text ||
        '; using=' || actual.using_expression || '; check=' || actual.check_expression end
  from policies_expected_absent expected
  left join actual_policies actual
    on actual.schema_name = expected.schema_name
   and actual.table_name = expected.table_name
   and actual.policy_name = expected.policy_name

  union all

  select
    'policies-preserved',
    expected.schema_name || '.' || expected.table_name || '.' || expected.policy_name,
    case
      when actual.policy_name is null then 'missing'
      when actual.command <> expected.command
        or actual.roles::text <> '{authenticated}'
        or not (
          select bool_and(actual.combined_expression like '%' || lower(fragment) || '%')
          from unnest(expected.required_fragments) fragment
        )
      then 'different'
      else 'match'
    end,
    'preserved from 001-005; command=' || expected.command || '; authenticated only',
    case when actual.policy_name is null then 'absent'
      else 'command=' || actual.command || '; roles=' || actual.roles::text ||
        '; using=' || actual.using_expression || '; check=' || actual.check_expression end
  from preserved_policies expected
  left join actual_policies actual
    on actual.schema_name = expected.schema_name
   and actual.table_name = expected.table_name
   and actual.policy_name = expected.policy_name

  union all

  select
    'policies-unexpected',
    actual.schema_name || '.' || actual.table_name || '.' || actual.policy_name,
    'unexpected',
    'not defined or preserved by current 006',
    'command=' || actual.command || '; roles=' || actual.roles::text ||
      '; using=' || actual.using_expression || '; check=' || actual.check_expression
  from actual_policies actual
  where (
      (actual.schema_name = 'public' and actual.table_name in (
        'profiles', 'observations', 'profile_featured_badges',
        'sync_imports', 'sync_import_challenge_claims'
      ))
      or (actual.schema_name = 'storage' and actual.table_name = 'objects'
        and actual.policy_name like 'observation_photos_%')
    )
    and not exists (
      select 1 from expected_policies expected
      where expected.schema_name = actual.schema_name
        and expected.table_name = actual.table_name
        and expected.policy_name = actual.policy_name
    )
    and not exists (
      select 1 from preserved_policies expected
      where expected.schema_name = actual.schema_name
        and expected.table_name = actual.table_name
        and expected.policy_name = actual.policy_name
    )
    and not exists (
      select 1 from policies_expected_absent expected
      where expected.schema_name = actual.schema_name
        and expected.table_name = actual.table_name
        and expected.policy_name = actual.policy_name
    )

  union all

  select
    'grants',
    'direct-client-writes',
    case when exists (select 1 from effective_write_grants) then 'different' else 'match' end,
    'no INSERT/UPDATE/DELETE/TRUNCATE for anon/authenticated on sync-managed tables',
    coalesce((
      select string_agg(grantee || ':' || table_name || ':' || privilege_type, ', ' order by grantee, table_name, privilege_type)
      from effective_write_grants
    ), 'none')

  union all

  select
    'grants',
    expected.grantee || ':public.' || expected.table_name || ':' || expected.privilege_type,
    case
      when actual.table_oid is null then 'missing'
      when pg_catalog.has_table_privilege(
        expected.grantee,
        actual.table_oid,
        expected.privilege_type
      ) is distinct from expected.should_have then 'different'
      else 'match'
    end,
    'effective privilege=' || expected.should_have::text,
    case when actual.table_oid is null then 'table absent'
      else 'effective privilege=' || pg_catalog.has_table_privilege(
        expected.grantee,
        actual.table_oid,
        expected.privilege_type
      )::text end
  from expected_table_privileges expected
  left join actual_tables actual
    on actual.schema_name = 'public' and actual.table_name = expected.table_name

  union all

  select
    'preserved-001-005',
    'public.' || expected.table_name,
    case
      when actual.table_name is null then 'missing'
      when not actual.rls_enabled then 'different'
      else 'match'
    end,
    'original table remains present with RLS enabled',
    case when actual.table_name is null then 'absent'
      else 'exists; rls=' || actual.rls_enabled::text || '; force_rls=' || actual.rls_forced::text end
  from preserved_tables expected
  left join actual_tables actual
    on actual.schema_name = 'public' and actual.table_name = expected.table_name

  union all

  select
    'preserved-001-005',
    'private.' || expected.function_name || '(' || expected.argument_types || ')',
    case when actual.function_name is null then 'missing'
      when actual.anon_can_execute or actual.authenticated_can_execute then 'different'
      else 'match' end,
    'original private function remains present and client-inaccessible',
    case when actual.function_name is null then 'absent'
      else 'anon_execute=' || actual.anon_can_execute::text || '; authenticated_execute=' || actual.authenticated_can_execute::text end
  from preserved_private_functions expected
  left join actual_functions actual
    on actual.schema_name = 'private'
   and actual.function_name = expected.function_name
   and actual.argument_types = expected.argument_types

  union all

  select
    'preserved-001-005',
    expected.table_schema || '.' || expected.table_name || '.' || expected.trigger_name,
    case when actual.trigger_name is null then 'missing'
      when actual.enabled = 'D' then 'different' else 'match' end,
    'original trigger remains enabled',
    case when actual.trigger_name is null then 'absent' else actual.definition || '; enabled=' || actual.enabled end
  from preserved_triggers expected
  left join actual_triggers actual
    on actual.table_schema = expected.table_schema
   and actual.table_name = expected.table_name
   and actual.trigger_name = expected.trigger_name
)
select section, object_name, status, expected, actual
from report
order by
  case status
    when 'missing' then 1
    when 'missing-or-different' then 2
    when 'different' then 3
    when 'still-present' then 4
    when 'unexpected-signature' then 5
    when 'unexpected' then 6
    when 'match' then 7
    else 8
  end,
  section,
  object_name;
