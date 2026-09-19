import { LockKeyhole, Sparkles } from "lucide-react";
import type { Discovery, Species } from "../types";

type SpeciesCardProps = {
  species: Species;
  discovery?: Discovery;
  onSelect: (species: Species) => void;
};

export function SpeciesCard({ species, discovery, onSelect }: SpeciesCardProps) {
  const isDiscovered = Boolean(discovery);

  return (
    <button
      type="button"
      onClick={() => isDiscovered && onSelect(species)}
      className={`group overflow-hidden rounded-3xl border text-left shadow-sm transition duration-300 ${
        isDiscovered
          ? "border-forest/10 bg-white hover:-translate-y-1 hover:shadow-lift"
          : "border-dashed border-forest/20 bg-white/45"
      }`}
    >
      <div className="relative aspect-[4/3] overflow-hidden bg-moss/30">
        {isDiscovered ? (
          <img
            src={species.image}
            alt={species.commonName}
            className="h-full w-full object-cover transition duration-500 group-hover:scale-105"
          />
        ) : (
          <div className="grid h-full place-items-center bg-[radial-gradient(circle_at_center,_rgba(67,104,80,.25),_rgba(248,250,245,.9))] text-forest/45">
            <LockKeyhole size={42} aria-hidden="true" />
          </div>
        )}
        <span className="absolute left-3 top-3 rounded-full bg-white/90 px-3 py-1 text-xs font-bold text-forest shadow-sm">
          {species.category}
        </span>
        {species.rarity === "especial" ? (
          <span className="absolute right-3 top-3 grid h-9 w-9 place-items-center rounded-full bg-gold text-forest shadow-sm">
            <Sparkles size={18} aria-hidden="true" />
          </span>
        ) : null}
      </div>
      <div className="space-y-2 p-4">
        <div>
          <h3 className="text-base font-bold text-forest">{isDiscovered ? species.commonName : "Especie pendiente"}</h3>
          <p className="text-sm italic text-forest/55">{isDiscovered ? species.scientificName : "Descúbrela para ver su ficha"}</p>
        </div>
        <p className="text-sm text-forest/65">
          {isDiscovered && discovery
            ? `Descubierta ${new Intl.DateTimeFormat("es", { day: "2-digit", month: "short" }).format(new Date(discovery.discoveredAt))}`
            : "Progreso bloqueado"}
        </p>
      </div>
    </button>
  );
}
