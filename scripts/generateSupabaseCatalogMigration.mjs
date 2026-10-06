import { build } from "esbuild";
import { resolve } from "node:path";
import { writeFile } from "node:fs/promises";

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

const quote = (value) => value == null
  ? "null"
  : `'${String(value).replaceAll("'", "''")}'`;
const textArray = (values = []) => values.length
  ? `array[${values.map(quote).join(", ")}]::text[]`
  : "'{}'::text[]";
const row = (values) => `  (${values.join(", ")})`;
const insertRows = (table, columns, rows) => rows.length
  ? `insert into ${table} (${columns.join(", ")}) values\n${rows.join(",\n")};\n\n`
  : "";
const badgeName = (id) => id
  .split("-")
  .map((part) => part ? part[0].toUpperCase() + part.slice(1) : part)
  .join(" ");

const [{ species }, { thematicCollections }, challengeData] = await Promise.all([
  loadModule("src/data/species.ts"),
  loadModule("src/data/thematicCollections.ts"),
  loadModule("src/data/challenges.ts"),
]);

const speciesRows = species.map((item) => row([
  quote(item.id),
  quote(item.commonName),
  quote(item.scientificName),
  quote(item.category),
  quote(item.exploration),
  textArray(item.explorationTypes),
  quote(item.description),
  quote(item.habitat),
  quote(item.diet),
  quote(item.curiosity),
  quote(item.image),
  quote(item.sourceUrl),
  quote(item.scienceSourceUrl),
  quote(item.conservationStatus ?? item.conservation),
  quote(item.rarity),
  textArray(item.regions),
  quote(item.distribution),
  quote(item.whereToFind),
  textArray(item.funFacts),
  textArray(item.keywords),
]));

const variantRows = species.flatMap((item) => (item.variants ?? []).map((variant) => row([
  quote(item.id),
  quote(variant.id),
  quote(variant.name),
  quote(variant.kind),
  quote(variant.description),
  quote(variant.image),
  quote(variant.sourceUrl),
])));

const collectionRows = thematicCollections.map((collection) => row([
  quote(collection.id),
  quote(collection.title),
  quote(collection.description),
  quote(collection.progressMode),
  quote(collection.variantSpeciesId),
]));

const collectionSpeciesRows = thematicCollections.flatMap((collection) =>
  collection.speciesIds.map((speciesId, position) => row([
    quote(collection.id),
    quote(speciesId),
    String(position),
  ])),
);

const fixed = challengeData.fixedChallenges.map((challenge) => ({
  ...challenge,
  kind: "fixed",
  status: "published",
  objectives: [challenge.objective],
}));
const weekly = challengeData.weeklyChallenges.map((challenge) => ({
  ...challenge,
  kind: "weekly",
  startAt: challenge.startDate,
  endAt: challenge.endDate,
}));
const challenges = [...fixed, ...weekly];

const badges = [...new Map(challenges
  .filter((challenge) => challenge.badgeId)
  .map((challenge) => [challenge.badgeId, {
    id: challenge.badgeId,
    name: badgeName(challenge.badgeId),
    description: `Insignia del desafío ${challenge.title}.`,
  }])).values()];

const badgeRows = badges.map((badge) => row([
  quote(badge.id),
  quote(badge.name),
  quote(badge.description),
]));

const challengeRows = challenges.map((challenge) => row([
  quote(challenge.id),
  quote(challenge.kind),
  quote(challenge.title),
  quote(challenge.description),
  challenge.startAt ? `${quote(challenge.startAt)}::timestamptz` : "null",
  challenge.endAt ? `${quote(challenge.endAt)}::timestamptz` : "null",
  String(challenge.xpReward),
  quote(challenge.badgeId),
  quote(challenge.status),
]));

const objectiveRows = challenges.flatMap((challenge) => challenge.objectives.map((objective) => row([
  quote(challenge.id),
  quote(objective.id),
  quote(objective.type),
  quote(objective.label),
  String(objective.target),
  quote(objective.speciesId),
  quote(objective.category),
  quote(objective.collectionId),
])));

let sql = "-- Generated from the checked-in Wildex catalogs. Do not edit by hand.\n";
sql += "begin;\n\n";
sql += insertRows("public.species", [
  "id", "common_name", "scientific_name", "category", "exploration",
  "exploration_types", "description", "habitat", "diet", "curiosity",
  "image_url", "source_url", "science_source_url", "conservation_status",
  "rarity", "regions", "distribution", "where_to_find", "fun_facts", "keywords",
], speciesRows);
sql += insertRows("public.species_variants", [
  "species_id", "id", "name", "kind", "description", "image_url", "source_url",
], variantRows);
sql += insertRows("public.thematic_collections", [
  "id", "title", "description", "progress_mode", "variant_species_id",
], collectionRows);
sql += insertRows("public.thematic_collection_species", [
  "collection_id", "species_id", "position",
], collectionSpeciesRows);
sql += insertRows("public.badges", ["id", "name", "description"], badgeRows);
sql += insertRows("public.challenges", [
  "id", "kind", "title", "description", "start_at", "end_at", "xp_reward", "badge_id", "status",
], challengeRows);
sql += insertRows("public.challenge_objectives", [
  "challenge_id", "id", "objective_type", "label", "target", "species_id", "category", "collection_id",
], objectiveRows);
sql += "commit;\n";

await writeFile(
  resolve("supabase/migrations/202609240003_catalog_seed.sql"),
  sql,
  "utf8",
);

console.log(JSON.stringify({
  species: speciesRows.length,
  variants: variantRows.length,
  collections: collectionRows.length,
  collectionMemberships: collectionSpeciesRows.length,
  badges: badgeRows.length,
  challenges: challengeRows.length,
  objectives: objectiveRows.length,
}));
