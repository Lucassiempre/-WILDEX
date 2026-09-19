import { Search } from "lucide-react";
import { useMemo, useState } from "react";
import { SpeciesCard } from "../components/SpeciesCard";
import { SpeciesDetail } from "../components/SpeciesDetail";
import { categories, species } from "../data/species";
import { discoveredSpeciesIds } from "../utils/gamification";
import type { Category, Discovery, Species } from "../types";

type CollectionPageProps = {
  discoveries: Discovery[];
};

export function CollectionPage({ discoveries }: CollectionPageProps) {
  const [filter, setFilter] = useState<Category | "Todos">("Todos");
  const [selectedSpecies, setSelectedSpecies] = useState<Species>();
  const discoveredIds = discoveredSpeciesIds(discoveries);
  const filteredSpecies = useMemo(
    () => species.filter((item) => filter === "Todos" || item.category === filter),
    [filter],
  );

  return (
    <div className="space-y-5 pb-32">
      <section className="rounded-[2rem] border border-forest/10 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-5">
          <div>
            <p className="text-sm font-bold uppercase tracking-[0.18em] text-canopy">Colección personal</p>
            <h1 className="text-3xl font-black text-forest">Enciclopedia Wildex</h1>
            <p className="mt-2 max-w-2xl text-forest/65">
              Las tarjetas abiertas corresponden a especies descubiertas. Las pendientes mantienen su silueta hasta que las registres.
            </p>
          </div>
          <div className="flex items-center gap-2 rounded-2xl bg-paper px-4 py-3 text-forest/60">
            <Search size={19} aria-hidden="true" />
            <span className="text-sm font-semibold">{discoveries.length} fichas guardadas</span>
          </div>
        </div>

        <div className="mt-5 flex gap-2 overflow-x-auto pb-1">
          {(["Todos", ...categories] as Array<Category | "Todos">).map((category) => (
            <button
              key={category}
              type="button"
              onClick={() => setFilter(category)}
              className={`shrink-0 rounded-full px-4 py-2 text-sm font-bold transition ${
                filter === category ? "bg-forest text-white" : "bg-paper text-forest/70 hover:bg-moss/40"
              }`}
            >
              {category}
            </button>
          ))}
        </div>
      </section>

      <section className="grid gap-4">
        {filteredSpecies.map((item) => (
          <SpeciesCard
            key={item.id}
            species={item}
            discovery={discoveries.find((discovery) => discovery.speciesId === item.id)}
            onSelect={setSelectedSpecies}
          />
        ))}
      </section>

      {discoveries.length === 0 ? (
        <div className="rounded-[2rem] border border-dashed border-forest/20 bg-white/65 p-8 text-center">
          <h2 className="text-2xl font-black text-forest">Tu colección todavía está vacía</h2>
          <p className="mt-2 text-forest/65">Registra una especie desde la pantalla de descubrimiento para abrir la primera ficha.</p>
        </div>
      ) : null}

      {selectedSpecies ? <SpeciesDetail species={selectedSpecies} onClose={() => setSelectedSpecies(undefined)} /> : null}
    </div>
  );
}
