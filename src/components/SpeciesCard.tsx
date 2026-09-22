import { LockKeyhole, Sparkles } from "lucide-react";
import type { Discovery, Species } from "../types";
import { AnimalImage } from "./AnimalImage";

type SpeciesCardProps = {
  species: Species;
  discovery?: Discovery;
  observationCount?: number;
  onSelect: (species: Species) => void;
};

export function SpeciesCard({ species, discovery, observationCount = 0, onSelect }: SpeciesCardProps) {
  const isDiscovered = Boolean(discovery);

  return (
    <button
      type="button"
      disabled={!isDiscovered}
      onClick={() => onSelect(species)}
      className="flex min-h-28 w-full overflow-hidden rounded-lg border border-line bg-card text-left shadow-panel transition enabled:active:scale-[.99] disabled:cursor-default"
    >
      <div className="relative w-28 shrink-0 bg-soft">
        {isDiscovered ? (
          <AnimalImage src={discovery?.photo || species.image} alt="" className="h-full w-full object-cover" />
        ) : (
          <div className="grid h-full w-full place-items-center text-secondary">
            <LockKeyhole size={26} aria-hidden="true" />
          </div>
        )}
      </div>
      <div className="min-w-0 flex-1 p-3">
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs font-bold text-accent-secondary">{species.category}</p>
          {species.rarity === "especial" && isDiscovered ? <Sparkles size={16} className="shrink-0 text-gold" aria-label="Especie especial" /> : null}
        </div>
        <h3 className="mt-1 text-base font-bold text-primary">{species.commonName}</h3>
        <p className="truncate text-xs italic text-secondary">{isDiscovered ? species.scientificName : "Pendiente · Descubrila para abrir su ficha"}</p>
        {discovery ? (
          <p className="mt-2 text-xs text-secondary">
            Registrada el {new Intl.DateTimeFormat("es", { day: "2-digit", month: "short" }).format(new Date(discovery.discoveredAt))}
            {observationCount > 1 ? ` · ${observationCount} observaciones` : ""}
          </p>
        ) : null}
      </div>
    </button>
  );
}
