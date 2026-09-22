import { BookOpen, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { SpeciesCard } from "../components/SpeciesCard";
import { SpeciesDetail } from "../components/SpeciesDetail";
import { categories, species } from "../data/species";
import type { Category, Discovery, ExplorationType, Species } from "../types";
import { categoryCounts, discoveredSpeciesCount } from "../utils/gamification";

type CollectionPageProps = {
  discoveries: Discovery[];
};

export function CollectionPage({ discoveries }: CollectionPageProps) {
  const [filter, setFilter] = useState<Category | "Todos">("Todos");
  const [environment, setEnvironment] = useState<ExplorationType | "todos">("urban");
  const [query, setQuery] = useState("");
  const [selectedSpecies, setSelectedSpecies] = useState<Species>();
  const counts = categoryCounts(discoveries);
  const normalizedQuery = query.trim().toLocaleLowerCase("es");
  const filteredSpecies = useMemo(
    () => species.filter((item) => (filter === "Todos" || item.category === filter)
      && (environment === "todos" || item.explorationTypes.includes(environment))
      && (!normalizedQuery || `${item.commonName} ${item.scientificName}`.toLocaleLowerCase("es").includes(normalizedQuery)))
      .sort((a, b) => Number(discoveries.some((item) => item.speciesId === b.id)) - Number(discoveries.some((item) => item.speciesId === a.id))),
    [filter, environment, normalizedQuery, discoveries],
  );

  return (
    <div className="space-y-5 pb-24">
      <section>
        <p className="text-xs font-bold uppercase text-accent-secondary">Colección personal</p>
        <h1 className="mt-1 text-2xl font-bold text-primary">Enciclopedia Wildex</h1>
        <div className="mt-4 flex items-center gap-3 rounded-lg border border-line bg-surface p-4">
          <BookOpen size={20} className="text-accent" aria-hidden="true" />
          <div>
            <p className="text-sm font-bold text-primary">{discoveredSpeciesCount(discoveries)} de {species.length} especies</p>
            <p className="text-xs text-secondary">Registradas en tu bitácora</p>
          </div>
        </div>
        <div className="mt-3 h-2 overflow-hidden rounded-full bg-soft" role="progressbar" aria-label="Progreso de colección" aria-valuenow={discoveredSpeciesCount(discoveries)} aria-valuemin={0} aria-valuemax={species.length}>
          <div className="h-full bg-accent" style={{ width: `${100 * discoveredSpeciesCount(discoveries) / species.length}%` }} />
        </div>
        <details className="mt-3 text-sm text-secondary">
          <summary className="cursor-pointer font-semibold text-primary">Progreso por categoría</summary>
          <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2">
            {categories.map((category) => <p key={category} className="flex justify-between gap-2"><span className="truncate">{category}</span><strong className="text-primary">{counts[category]}/{species.filter((item) => item.category === category).length}</strong></p>)}
          </div>
        </details>
      </section>

      <div className="grid grid-cols-4 gap-1 rounded-lg bg-soft p-1" role="group" aria-label="Filtrar por ambiente">
        {([['urban', 'Ciudad'], ['domestic', 'Hogar'], ['wild', 'Silvestre'], ['todos', 'Todos']] as const).map(([value, label]) => (
          <button key={value} type="button" onClick={() => setEnvironment(value)} aria-pressed={environment === value}
            className={`min-h-10 rounded-md text-xs font-semibold ${environment === value ? 'bg-accent text-on-accent' : 'text-secondary'}`}>
            {label}
          </button>
        ))}
      </div>

      <label className="flex min-h-11 items-center gap-2 rounded-lg border border-line bg-surface px-3 text-secondary">
        <Search size={17} aria-hidden="true" />
        <span className="sr-only">Buscar por nombre común o científico</span>
        <input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar animal o nombre científico" className="min-w-0 flex-1 bg-transparent text-sm text-primary outline-none placeholder:text-secondary" />
      </label>

      <label className="block text-xs font-bold uppercase text-accent-secondary" htmlFor="category-filter">Categoría
        <select id="category-filter" value={filter} onChange={(event) => setFilter(event.target.value as Category | "Todos")}
          className="mt-2 min-h-11 w-full rounded-lg border border-line bg-surface px-3 text-sm font-semibold normal-case text-primary">
          <option value="Todos">Todas las categorías</option>
          {categories.map((category) => <option key={category} value={category}>{category}</option>)}
        </select>
      </label>

      {discoveries.length === 0 ? (
        <div className="flex items-start gap-3 rounded-lg bg-soft p-4">
          <Search size={19} className="mt-0.5 shrink-0 text-accent" aria-hidden="true" />
          <p className="text-sm leading-5 text-primary">Tu bitácora está vacía. Probá el modo demo desde Descubrir para abrir fichas.</p>
        </div>
      ) : null}

      <section className="space-y-3" aria-label="Especies">
        <p className="text-xs font-medium text-secondary">{filteredSpecies.length} {filteredSpecies.length === 1 ? "especie" : "especies"} · {environment === "urban" ? "ciudad" : environment === "domestic" ? "hogar" : environment === "wild" ? "silvestre" : "todos los ambientes"}</p>
        {filteredSpecies.length === 0 ? <p className="rounded-lg bg-soft p-4 text-sm text-secondary">No hay especies con estos filtros. Probá otra búsqueda o ambiente.</p> : null}
        {filteredSpecies.map((item) => (
          <SpeciesCard
            key={item.id}
            species={item}
            discovery={discoveries.filter((discovery) => discovery.speciesId === item.id).at(-1)}
            observationCount={discoveries.filter((discovery) => discovery.speciesId === item.id).length}
            onSelect={setSelectedSpecies}
          />
        ))}
      </section>

      {selectedSpecies ? <SpeciesDetail species={selectedSpecies} discoveries={discoveries.filter((item) => item.speciesId === selectedSpecies.id)} onClose={() => setSelectedSpecies(undefined)} /> : null}
    </div>
  );
}
