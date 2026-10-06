import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createHash } from "node:crypto";
import { build } from "esbuild";

async function loadModule(path) {
  const output = await build({
    entryPoints: [resolve(path)],
    bundle: true,
    platform: "node",
    format: "cjs",
    write: false,
    logLevel: "silent",
  });
  const module = { exports: {} };
  new Function("module", "exports", output.outputFiles[0].text)(module, module.exports);
  return module.exports;
}

const migration = (name) => readFileSync(resolve("supabase/migrations", name), "utf8");
const core = migration("202609240001_core.sql");
const game = migration("202609240002_gamification.sql");
const seed = migration("202609240003_catalog_seed.sql");
const security = migration("202609240004_security.sql");
const privateDefaults = migration("202609240005_private_function_default_privileges.sql");
const initialSync = migration("202609280006_initial_sync.sql");
const syncReconciliation = migration("202609280007_reconcile_initial_sync.sql");
const compositeObservationIdentity = migration("202610050008_composite_observation_identity.sql");
const accountDeletionCascades = migration("202610060009_account_deletion_cascades.sql");
const allSql = [
  core,
  game,
  seed,
  security,
  privateDefaults,
  initialSync,
  syncReconciliation,
  compositeObservationIdentity,
  accountDeletionCascades,
].join("\n");
const diagnosticFiles = [
  "01_schema_and_history.sql",
  "02_functions_and_triggers.sql",
  "03_rls_storage_and_grants.sql",
  "04_catalog_and_data.sql",
  "05_post_review_corrections.sql",
  "06_initial_sync.sql",
  "07_reconcile_initial_sync.sql",
  "08_post_reconcile_initial_sync.sql",
  "09_post_composite_observation_identity.sql",
  "13_account_deletion_cascades.sql",
].map((name) => readFileSync(resolve("supabase/diagnostics", name), "utf8"));
const [{ species }, { thematicCollections }, challengeData] = await Promise.all([
  loadModule("src/data/species.ts"),
  loadModule("src/data/thematicCollections.ts"),
  loadModule("src/data/challenges.ts"),
]);

function insertedRowCount(table, nextTable) {
  const start = seed.indexOf(`insert into public.${table} `);
  const end = nextTable ? seed.indexOf(`insert into public.${nextTable} `, start + 1) : seed.length;
  assert.ok(start >= 0 && end > start, `No se encontró el bloque seed de ${table}`);
  return (seed.slice(start, end).match(/^  \(/gm) ?? []).length;
}

test("migraciones Supabase contienen el modelo de Wildex", () => {
  for (const table of [
    "species",
    "species_variants",
    "thematic_collections",
    "profiles",
    "observations",
    "user_species_discoveries",
    "user_variant_discoveries",
    "xp_events",
    "challenges",
    "challenge_claims",
    "badges",
    "user_badges",
  ]) {
    assert.match(allSql, new RegExp(`create table public\\.${table}\\b`));
  }
  assert.match(core, /profiles[\s\S]*references auth\.users\(id\) on delete cascade/);
  assert.match(core, /foreign key \(species_id, variant_id\)[\s\S]*species_variants/);
});

test("XP de especies y variantes es idempotente", () => {
  assert.match(game, /unique \(user_id, event_key\)/);
  assert.match(game, /'species:' \|\| new\.species_id[\s\S]*'species-discovery',[\s\S]*50/);
  assert.match(game, /'first-species-bonus',[\s\S]*'first-species-bonus',[\s\S]*50/);
  assert.match(game, /'category:' \|\| species_category[\s\S]*'category-bonus',[\s\S]*75/);
  assert.match(game, /'variant:' \|\| new\.species_id \|\| ':' \|\| new\.variant_id[\s\S]*'variant-discovery',[\s\S]*20/);
  assert.match(game, /event_type = 'species-discovery' and amount = 50/);
  assert.match(game, /event_type = 'category-bonus' and amount = 75/);
  assert.match(game, /event_type = 'variant-discovery' and amount = 20/);
  assert.match(game, /on conflict \(user_id, event_key\) do nothing/g);
  assert.match(game, /primary key \(user_id, challenge_id\)/);
});

test("RLS protege datos privados y fotografías", () => {
  for (const table of [
    "profiles",
    "observations",
    "user_species_discoveries",
    "user_variant_discoveries",
    "xp_events",
    "challenge_claims",
    "user_badges",
    "profile_featured_badges",
  ]) {
    assert.match(security, new RegExp(`alter table public\\.${table} enable row level security`));
  }
  assert.match(security, /auth\.uid\(\)\) = user_id/);
  assert.match(security, /'observation-photos'[\s\S]*false/);
  assert.match(security, /storage\.foldername\(name\)\)\[1\] = \(select auth\.uid\(\)\)::text/);
  assert.match(security, /owner_id = \(select auth\.uid\(\)\)::text/);
  assert.match(core, /alter table public\.observations enable row level security/);
  assert.match(game, /alter table public\.xp_events enable row level security/);
  assert.match(core, /revoke all on function private\.create_profile_for_new_user\(\)/);
  assert.match(core, /alter default privileges in schema private[\s\S]*revoke execute on functions/);
  assert.match(game, /revoke all on function private\.award_observation_discoveries\(\)/);
  assert.match(game, /security definer\s+set search_path = ''/);
  assert.match(security, /observations_insert_own[\s\S]*deleted_at is null/);
  assert.doesNotMatch(security, /grant\s+(insert|update|delete)[^;]*public\.(xp_events|user_species_discoveries|user_variant_discoveries|challenge_claims|user_badges)/i);
  assert.doesNotMatch(allSql, /service[_-]?role\s*[:=]|supabase[_-]?(url|key)\s*[:=]|eyJ[A-Za-z0-9_-]{20,}/i);
});

test("migración 006 implementa sincronización idempotente sin aceptar XP ni user_id", () => {
  assert.match(initialSync, /create table public\.sync_imports/);
  assert.match(initialSync, /unique \(user_id, dataset_id, manifest_sha256\)/);
  assert.match(initialSync, /observations_import_legacy_source_key/);
  assert.match(initialSync, /observation_identity_conflict/);
  assert.match(initialSync, /sync_import_already_completed/);
  assert.match(initialSync, /sync_revision/);
  assert.match(initialSync, /p_expected_revision/);

  for (const rpc of [
    "begin_sync_import",
    "sync_observation",
    "attach_observation_photo",
    "sync_profile",
    "claim_challenge",
    "complete_sync_import",
    "get_account_snapshot",
  ]) {
    assert.match(initialSync, new RegExp(`create or replace function public\\.${rpc}\\(`));
    assert.match(initialSync, new RegExp(`grant execute on function public\\.${rpc}\\(`));
  }

  const publicFunctionHeaders = [...initialSync.matchAll(/create or replace function public\.(\w+)\(([\s\S]*?)\)\s*returns/g)];
  assert.equal(publicFunctionHeaders.length, 7);
  for (const [, name, parameters] of publicFunctionHeaders) {
    assert.doesNotMatch(parameters, /p_user_id\b/i, `${name} no debe aceptar user_id`);
    assert.doesNotMatch(parameters, /\b(p_xp|p_amount|xp_amount)\b/i, `${name} no debe aceptar XP`);
  }

  assert.match(initialSync, /current_user_id uuid := auth\.uid\(\)/g);
  assert.match(initialSync, /challenge_row\.xp_reward/);
  assert.doesNotMatch(initialSync, /insert into public\.xp_events[\s\S]{0,500}\bp_(xp|amount)\b/i);
  assert.match(initialSync, /revoke insert, update, delete on public\.observations from authenticated/);
  assert.match(initialSync, /revoke all on all functions in schema private from public, anon, authenticated/);
});

test("migración 006 endurece fotografías y conserva los triggers de XP", () => {
  assert.match(initialSync, /observations_photo_metadata_complete_check/);
  assert.match(initialSync, /photo_path = user_id::text \|\| '\/' \|\| id::text/);
  assert.match(initialSync, /from storage\.objects objects/);
  assert.match(initialSync, /objects\.owner_id = current_user_id::text/);
  assert.match(initialSync, /create policy observation_photos_select_own[\s\S]*public\.observations/);
  assert.match(initialSync, /create policy observation_photos_insert_own[\s\S]*public\.observations/);
  assert.doesNotMatch(initialSync, /create policy observation_photos_(update|delete)_own/);
  assert.doesNotMatch(initialSync, /delete from public\.observations/i);
  assert.doesNotMatch(initialSync, /drop trigger observations_award_discoveries/i);
  assert.doesNotMatch(initialSync, /create trigger observations_award_discoveries/i);
});

test("RPC de desafíos calcula la recompensa en servidor y es idempotente", () => {
  assert.match(initialSync, /private\.challenge_objective_progress/);
  assert.match(initialSync, /'challenge:' \|\| p_challenge_id/);
  assert.match(initialSync, /'challenge-reward',[\s\S]*challenge_row\.xp_reward/);
  assert.match(initialSync, /on conflict \(user_id, event_key\) do nothing/);
  assert.match(initialSync, /on conflict \(user_id, challenge_id\) do nothing/);
  assert.match(initialSync, /'alreadyClaimed', true/);
  assert.doesNotMatch(initialSync, /grant\s+(insert|update|delete)[^;]*public\.xp_events/i);
});

test("migración 007 documenta una reconciliación sin cambios persistentes", () => {
  assert.match(syncReconciliation, /intentionally empty/);
  assert.doesNotMatch(
    syncReconciliation,
    /^\s*(insert|update|delete|alter|create|drop|truncate|grant|revoke|do)\b/im,
  );
});

test("migración 008 adopta identidad compuesta sin recrear observaciones", () => {
  assert.match(
    compositeObservationIdentity,
    /add constraint observations_pkey primary key \(user_id, id\)/,
  );
  assert.match(compositeObservationIdentity, /drop constraint observations_pkey/);
  assert.match(compositeObservationIdentity, /drop constraint observations_user_id_id_key/);
  assert.doesNotMatch(compositeObservationIdentity, /create table public\.observations\b/);
  assert.doesNotMatch(compositeObservationIdentity, /delete from public\.observations/i);
  assert.doesNotMatch(compositeObservationIdentity, /update public\.observations[\s\S]*set\s+(id|user_id)\s*=/i);

  for (const definition of [
    /foreign key \(user_id, first_observation_id\)[\s\S]*references public\.observations\(user_id, id\)[\s\S]*on delete set null \(first_observation_id\)/,
    /foreign key \(user_id, observation_id\)[\s\S]*references public\.observations\(user_id, id\)[\s\S]*on delete set null \(observation_id\)/,
    /foreign key \(user_id, observation_id\)[\s\S]*references public\.observations\(user_id, id\)[\s\S]*on delete restrict/,
  ]) {
    assert.match(compositeObservationIdentity, definition);
  }
  assert.doesNotMatch(compositeObservationIdentity, /references public\.observations\(id\)/);
  assert.match(compositeObservationIdentity, /cross_owner_observation_reference_detected/);
});

test("migración 008 modela lotes M:N y equivalencias legacy idempotentes", () => {
  assert.match(compositeObservationIdentity, /create table public\.sync_import_observations/);
  assert.match(compositeObservationIdentity, /primary key \(user_id, import_id, observation_id\)/);
  assert.match(compositeObservationIdentity, /foreign key \(user_id, import_id\)[\s\S]*sync_imports\(user_id, id\)/);
  assert.match(compositeObservationIdentity, /create table public\.sync_legacy_observation_map/);
  assert.match(compositeObservationIdentity, /primary key \(user_id, dataset_id, legacy_source_id\)/);
  assert.match(compositeObservationIdentity, /sync_legacy_observation_map_observation_key[\s\S]*unique \(user_id, dataset_id, observation_id\)/);
  assert.match(compositeObservationIdentity, /on conflict \(user_id, import_id, observation_id\) do nothing/);
  assert.match(compositeObservationIdentity, /on conflict \(user_id, dataset_id, legacy_source_id\) do nothing/);
  assert.match(compositeObservationIdentity, /alter table public\.sync_import_observations enable row level security/);
  assert.match(compositeObservationIdentity, /alter table public\.sync_legacy_observation_map enable row level security/);
  assert.match(compositeObservationIdentity, /revoke all on table public\.sync_import_observations from anon, authenticated/);
  assert.match(compositeObservationIdentity, /revoke all on table public\.sync_legacy_observation_map from anon, authenticated/);
});

test("RPC 008 buscan observaciones por cuenta e ID y no aceptan user_id ni XP", () => {
  for (const rpc of ["sync_observation", "attach_observation_photo", "complete_sync_import"]) {
    assert.match(compositeObservationIdentity, new RegExp(`create or replace function public\\.${rpc}\\(`));
    assert.match(compositeObservationIdentity, new RegExp(`grant execute on function public\\.${rpc}\\(`));
  }

  const functionPattern = /create or replace function public\.(\w+)\(([\s\S]*?)\)\s*returns[\s\S]*?as \$\$([\s\S]*?)\$\$;/gi;
  const functions = [...compositeObservationIdentity.matchAll(functionPattern)];
  assert.equal(functions.length, 3);
  for (const [, name, parameters, body] of functions) {
    assert.doesNotMatch(parameters, /p_user_id\b/i, `${name} no debe aceptar user_id`);
    assert.doesNotMatch(parameters, /\b(p_xp|p_amount|xp_amount)\b/i, `${name} no debe aceptar XP`);
    assert.match(body, /current_user_id uuid := auth\.uid\(\)/);
  }

  const syncBody = functions.find(([, name]) => name === "sync_observation")[3];
  assert.match(syncBody, /observations\.user_id = current_user_id[\s\S]*observations\.id = p_observation_id/);
  assert.doesNotMatch(syncBody, /where\s+(?:[a-z_]+\.)?id\s*=\s*p_observation_id/i);
  assert.doesNotMatch(
    syncBody.match(/observation_identity_conflict[\s\S]*?end if;/)?.[0] ?? "",
    /import_id|legacy_source_id/,
  );
  assert.match(syncBody, /legacy_source_identity_conflict/);
  assert.match(syncBody, /sync_import_observation_conflict/);
});

test("seed conserva todos los IDs actuales del catálogo", () => {
  assert.equal(species.length, 150);
  assert.equal(new Set(species.map((item) => item.id)).size, species.length);
  assert.equal(insertedRowCount("species", "species_variants"), species.length);
  assert.equal(insertedRowCount("species_variants", "thematic_collections"), 104);
  assert.equal(insertedRowCount("thematic_collections", "thematic_collection_species"), thematicCollections.length);
  assert.equal(
    insertedRowCount("thematic_collection_species", "badges"),
    thematicCollections.reduce((total, collection) => total + collection.speciesIds.length, 0),
  );

  for (const item of species) {
    assert.ok(seed.includes(`  ('${item.id.replaceAll("'", "''")}', '${item.commonName.replaceAll("'", "''")}'`), `Falta especie ${item.id}`);
    const variantIds = (item.variants ?? []).map((variant) => variant.id);
    assert.equal(new Set(variantIds).size, variantIds.length, `Variantes duplicadas en ${item.id}`);
    for (const variant of item.variants ?? []) {
      assert.ok(
        seed.includes(`  ('${item.id.replaceAll("'", "''")}', '${variant.id.replaceAll("'", "''")}', '${variant.name.replaceAll("'", "''")}'`),
        `Falta variante ${item.id}:${variant.id}`,
      );
    }
  }

  for (const collection of thematicCollections) {
    assert.match(seed, new RegExp(`'${collection.id}'`));
    for (const speciesId of collection.speciesIds) {
      assert.ok(seed.includes(`  ('${collection.id}', '${speciesId}',`), `Falta ${collection.id}:${speciesId}`);
    }
  }
  for (const challenge of [...challengeData.fixedChallenges, ...challengeData.weeklyChallenges]) {
    assert.match(seed, new RegExp(`'${challenge.id}'`));
  }
});

test("diagnóstico remoto es de sólo lectura", () => {
  for (const diagnostic of diagnosticFiles) {
    assert.doesNotMatch(
      diagnostic,
      /^\s*(insert|update|delete|alter|create|drop|truncate|grant|revoke)\b/im,
    );
  }
  assert.match(diagnosticFiles[3], /'species', 150/);
  assert.match(diagnosticFiles[3], /'variants', 104/);
  assert.match(diagnosticFiles[3], /'collections', 14/);
  assert.match(diagnosticFiles[0], /migration_history_available/);
  assert.match(diagnosticFiles[0], /to_regclass\('supabase_migrations\.schema_migrations'\)/);
  assert.doesNotMatch(diagnosticFiles[0], /from\s+supabase_migrations\.schema_migrations/i);
  assert.match(diagnosticFiles[2], /to_regclass\('storage\.buckets'\)/);
  assert.doesNotMatch(diagnosticFiles[2], /^\s*from\s+storage\.buckets/im);
  assert.match(diagnosticFiles[3], /to_regclass\('storage\.objects'\)/);
  assert.doesNotMatch(diagnosticFiles[3], /^\s*from\s+storage\.objects/im);
  assert.match(diagnosticFiles[4], /xp_fixed_amount_constraint/);
  assert.match(diagnosticFiles[4], /observations_insert_rejects_deleted/);
  assert.match(diagnosticFiles[4], /storage_update_checks_folder_and_owner/);
  assert.match(diagnosticFiles[4], /private_function_default_execute_revoked/);
  assert.match(diagnosticFiles[4], /acldefault\('f'::"char", creators\.role_oid\)/);
  assert.match(diagnosticFiles[4], /array_ndims\(state\.global_effective_acl\) = 1/);
  assert.match(diagnosticFiles[4], /array_ndims\(state\.private_additions_acl\) = 1/);
  assert.match(diagnosticFiles[4], /as global_acl_entry/);
  assert.match(diagnosticFiles[4], /as private_acl_entry/);
  assert.doesNotMatch(diagnosticFiles[4], /\)\s+(?:as\s+)?privileges\b/i);
  assert.doesNotMatch(
    diagnosticFiles[4],
    /coalesce\(state\.private_additions_acl,\s*'\{\}'::aclitem\[\]\)/,
  );
  assert.match(privateDefaults, /from pg_catalog\.pg_proc functions/);
  assert.match(privateDefaults, /where roles\.rolname = current_user/);
  assert.match(privateDefaults, /alter default privileges for role %I revoke execute on functions from public/);
  assert.doesNotMatch(privateDefaults, /alter default privileges[^\n]*in schema private/i);
  assert.match(diagnosticFiles[5], /sync_imports_created/);
  assert.match(diagnosticFiles[5], /anon_cannot_execute_sync_rpcs/);
  assert.match(diagnosticFiles[5], /authenticated_has_no_unexpected_public_rpc/);
  assert.match(diagnosticFiles[5], /private_functions_not_client_executable/);
  assert.match(diagnosticFiles[5], /storage_has_no_update_or_delete_policy/);
  assert.match(diagnosticFiles[5], /original_triggers_001_005_enabled/);

  const reconciliation = diagnosticFiles[6];
  assert.match(reconciliation, /columns-unexpected/);
  assert.match(reconciliation, /constraints-removed/);
  assert.match(reconciliation, /functions-overloads/);
  assert.match(reconciliation, /functions-definition/);
  assert.match(reconciliation, /effective_write_grants/);
  assert.match(reconciliation, /policies-removed/);
  assert.match(reconciliation, /preserved-001-005/);
  assert.match(reconciliation, /unexpected-signature/);

  const functionPattern = /create or replace function\s+([\w.]+)\s*\(([\s\S]*?)\)\s*returns[\s\S]*?as \$\$([\s\S]*?)\$\$;/gi;
  const currentFunctionHashes = [];
  for (const match of initialSync.matchAll(functionPattern)) {
    const canonicalBody = match[3].trim().replace(/\s+/g, " ");
    currentFunctionHashes.push(createHash("md5").update(canonicalBody).digest("hex"));
  }
  assert.equal(currentFunctionHashes.length, 10);
  for (const hash of currentFunctionHashes) {
    assert.match(reconciliation, new RegExp(hash));
  }
  assert.match(
    reconciliation,
    /btrim\(pg_catalog\.regexp_replace\(functions\.prosrc, '\\s\+', ' ', 'g'\)\)/,
  );
  assert.match(reconciliation, /\(user_id, "position"\)/);
  assert.match(reconciliation, /'user_id::text'/);
  assert.match(reconciliation, /'id::text'/);

  const postReconciliation = diagnosticFiles[7];
  assert.match(postReconciliation, /migration-007-reconciliation/);
  assert.match(postReconciliation, /all 12 reviewed objects match current migration 006/);
  assert.match(postReconciliation, /observations_photo_metadata_complete_check/);
  assert.match(postReconciliation, /profile_featured_badges_active_position_key/);
  assert.match(
    postReconciliation,
    /btrim\(\s*pg_catalog\.regexp_replace\(functions\.prosrc, '\\s\+', ' ', 'g'\)\s*\)/,
  );
  for (const hash of currentFunctionHashes) {
    assert.match(postReconciliation, new RegExp(hash));
  }

  const compositeIdentityDiagnostic = diagnosticFiles[8];
  assert.match(compositeIdentityDiagnostic, /observations_composite_primary_key/);
  assert.match(compositeIdentityDiagnostic, /all_observation_fks_are_expected_and_composite/);
  assert.match(compositeIdentityDiagnostic, /sync_identity_tables_have_no_client_table_privileges/);
  assert.match(compositeIdentityDiagnostic, /preexisting_private_tables_keep_rls/);
  assert.match(compositeIdentityDiagnostic, /observations_keep_read_only_client_grants/);
  assert.match(compositeIdentityDiagnostic, /replaced_rpcs_use_owner_scoped_observation_identity/);
  assert.match(compositeIdentityDiagnostic, /observation_trigger_functions_not_client_executable/);
  assert.match(compositeIdentityDiagnostic, /historical_import_observations_were_backfilled/);
  assert.match(compositeIdentityDiagnostic, /storage_policies_remain_owner_and_observation_scoped/);
});
