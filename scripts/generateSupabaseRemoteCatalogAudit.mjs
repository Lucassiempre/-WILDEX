import { build } from "esbuild";
import { resolve } from "node:path";
import { mkdir, writeFile } from "node:fs/promises";

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

const quote = (value) => `'${String(value).replaceAll("'", "''")}'`;
const values = (rows) => rows.map((row) => `    (${row.map(quote).join(", ")})`).join(",\n");

const [{ species }, { thematicCollections }, challengeData] = await Promise.all([
  loadModule("src/data/species.ts"),
  loadModule("src/data/thematicCollections.ts"),
  loadModule("src/data/challenges.ts"),
]);

const variants = species.flatMap((item) =>
  (item.variants ?? []).map((variant) => [item.id, variant.id]),
);
const collectionMembers = thematicCollections.flatMap((collection) =>
  collection.speciesIds.map((speciesId) => [collection.id, speciesId]),
);
const challenges = [...challengeData.fixedChallenges, ...challengeData.weeklyChallenges];
const objectives = challenges.flatMap((challenge) => {
  const items = "objective" in challenge ? [challenge.objective] : challenge.objectives;
  return items.map((objective) => [challenge.id, objective.id]);
});

const sql = `-- READ ONLY. Run this file fourth, only after query 01 confirms all catalog and user tables exist.
with expected_species(id) as (
  values
${values(species.map((item) => [item.id]))}
), expected_variants(species_id, id) as (
  values
${values(variants)}
), expected_collections(id) as (
  values
${values(thematicCollections.map((item) => [item.id]))}
), expected_collection_members(collection_id, species_id) as (
  values
${values(collectionMembers)}
), expected_challenges(id) as (
  values
${values(challenges.map((item) => [item.id]))}
), expected_objectives(challenge_id, id) as (
  values
${values(objectives)}
), differences as (
  select 'missing_species' as issue, count(*) as total,
    coalesce(jsonb_agg(expected.id order by expected.id), '[]'::jsonb) as details
  from expected_species expected
  left join public.species actual using (id)
  where actual.id is null
  union all
  select 'extra_species', count(*),
    coalesce(jsonb_agg(actual.id order by actual.id), '[]'::jsonb)
  from public.species actual
  left join expected_species expected using (id)
  where expected.id is null
  union all
  select 'missing_variants', count(*),
    coalesce(jsonb_agg(jsonb_build_object('species_id', expected.species_id, 'id', expected.id)
      order by expected.species_id, expected.id), '[]'::jsonb)
  from expected_variants expected
  left join public.species_variants actual using (species_id, id)
  where actual.id is null
  union all
  select 'extra_variants', count(*),
    coalesce(jsonb_agg(jsonb_build_object('species_id', actual.species_id, 'id', actual.id)
      order by actual.species_id, actual.id), '[]'::jsonb)
  from public.species_variants actual
  left join expected_variants expected using (species_id, id)
  where expected.id is null
  union all
  select 'missing_collections', count(*),
    coalesce(jsonb_agg(expected.id order by expected.id), '[]'::jsonb)
  from expected_collections expected
  left join public.thematic_collections actual using (id)
  where actual.id is null
  union all
  select 'extra_collections', count(*),
    coalesce(jsonb_agg(actual.id order by actual.id), '[]'::jsonb)
  from public.thematic_collections actual
  left join expected_collections expected using (id)
  where expected.id is null
  union all
  select 'missing_collection_members', count(*),
    coalesce(jsonb_agg(jsonb_build_object('collection_id', expected.collection_id, 'species_id', expected.species_id)
      order by expected.collection_id, expected.species_id), '[]'::jsonb)
  from expected_collection_members expected
  left join public.thematic_collection_species actual using (collection_id, species_id)
  where actual.species_id is null
  union all
  select 'extra_collection_members', count(*),
    coalesce(jsonb_agg(jsonb_build_object('collection_id', actual.collection_id, 'species_id', actual.species_id)
      order by actual.collection_id, actual.species_id), '[]'::jsonb)
  from public.thematic_collection_species actual
  left join expected_collection_members expected using (collection_id, species_id)
  where expected.species_id is null
  union all
  select 'missing_challenges', count(*),
    coalesce(jsonb_agg(expected.id order by expected.id), '[]'::jsonb)
  from expected_challenges expected
  left join public.challenges actual using (id)
  where actual.id is null
  union all
  select 'extra_challenges', count(*),
    coalesce(jsonb_agg(actual.id order by actual.id), '[]'::jsonb)
  from public.challenges actual
  left join expected_challenges expected using (id)
  where expected.id is null
  union all
  select 'missing_objectives', count(*),
    coalesce(jsonb_agg(jsonb_build_object('challenge_id', expected.challenge_id, 'id', expected.id)
      order by expected.challenge_id, expected.id), '[]'::jsonb)
  from expected_objectives expected
  left join public.challenge_objectives actual using (challenge_id, id)
  where actual.id is null
  union all
  select 'extra_objectives', count(*),
    coalesce(jsonb_agg(jsonb_build_object('challenge_id', actual.challenge_id, 'id', actual.id)
      order by actual.challenge_id, actual.id), '[]'::jsonb)
  from public.challenge_objectives actual
  left join expected_objectives expected using (challenge_id, id)
  where expected.id is null
), xp_breakdown as (
  select event_type, count(*) as events, coalesce(sum(amount), 0) as xp
  from public.xp_events
  group by event_type
)
select jsonb_build_object(
  'actual_counts', jsonb_build_object(
    'species', (select count(*) from public.species),
    'variants', (select count(*) from public.species_variants),
    'collections', (select count(*) from public.thematic_collections),
    'collection_members', (select count(*) from public.thematic_collection_species),
    'profiles', (select count(*) from public.profiles),
    'observations', (select count(*) from public.observations),
    'species_discoveries', (select count(*) from public.user_species_discoveries),
    'variant_discoveries', (select count(*) from public.user_variant_discoveries),
    'xp_events', (select count(*) from public.xp_events),
    'challenge_claims', (select count(*) from public.challenge_claims),
    'user_badges', (select count(*) from public.user_badges),
    'storage_objects_available', to_regclass('storage.objects') is not null,
    'photo_objects_query_xml', xmlserialize(
      document query_to_xml(
        case
          when to_regclass('storage.objects') is null
            then 'select ''storage.objects no existe''::text as status where false'
          else 'select count(*) as photo_objects from storage.objects where bucket_id = ''observation-photos'''
        end,
        false,
        false,
        ''
      ) as text
    )
  ),
  'expected_counts', jsonb_build_object(
    'species', ${species.length},
    'variants', ${variants.length},
    'collections', ${thematicCollections.length},
    'collection_members', ${collectionMembers.length},
    'challenges', ${challenges.length},
    'objectives', ${objectives.length}
  ),
  'catalog_differences', (
    select jsonb_agg(to_jsonb(differences) order by issue) from differences
  ),
  'xp_breakdown', (
    select coalesce(jsonb_agg(to_jsonb(xp_breakdown) order by event_type), '[]'::jsonb)
    from xp_breakdown
  )
) as wildex_catalog_and_data_diagnostic;
`;

await mkdir(resolve("supabase/diagnostics"), { recursive: true });
await writeFile(
  resolve("supabase/diagnostics/04_catalog_and_data.sql"),
  sql,
  "utf8",
);

console.log(JSON.stringify({
  species: species.length,
  variants: variants.length,
  collections: thematicCollections.length,
  collectionMembers: collectionMembers.length,
  challenges: challenges.length,
  objectives: objectives.length,
}));
