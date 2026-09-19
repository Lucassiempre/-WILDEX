import { ExternalLink, Leaf, ShieldCheck, Utensils } from "lucide-react";
import type { Species } from "../types";

type SpeciesDetailProps = {
  species: Species;
  onClose: () => void;
};

export function SpeciesDetail({ species, onClose }: SpeciesDetailProps) {
  return (
    <div className="absolute inset-0 z-50 grid place-items-end bg-forest/45 p-0 backdrop-blur-sm">
      <section className="mobile-scroll max-h-[92%] w-full overflow-y-auto rounded-t-[2rem] bg-paper shadow-glow">
        <div className="relative aspect-[16/10] min-h-56 overflow-hidden">
          <img src={species.image} alt={species.commonName} className="h-full w-full object-cover" />
          <div className="absolute inset-0 bg-gradient-to-t from-forest/80 via-forest/10 to-transparent" />
          <button
            type="button"
            onClick={onClose}
            className="absolute right-4 top-4 rounded-full bg-white/90 px-4 py-2 text-sm font-bold text-forest shadow-sm"
          >
            Cerrar
          </button>
          <div className="absolute bottom-5 left-5 right-5 text-white">
            <p className="mb-2 inline-flex rounded-full bg-gold px-3 py-1 text-xs font-bold uppercase tracking-[0.18em] text-forest">
              {species.category}
            </p>
            <h2 className="text-3xl font-black">{species.commonName}</h2>
            <p className="text-base italic text-white/80">{species.scientificName}</p>
          </div>
        </div>
        <div className="grid gap-5 p-5">
          <div className="space-y-5">
            <p className="text-lg leading-8 text-forest/80">{species.description}</p>
            <div className="grid gap-3">
              <InfoBlock icon={Leaf} label="Hábitat" text={species.habitat} />
              <InfoBlock icon={Utensils} label="Alimentación" text={species.diet} />
            </div>
          </div>
          <aside className="space-y-4 rounded-3xl border border-forest/10 bg-white p-5">
            <InfoBlock icon={ShieldCheck} label="Conservación" text={species.conservation} compact />
            <div>
              <p className="text-sm font-bold uppercase tracking-[0.16em] text-canopy">Curiosidad</p>
              <p className="mt-2 text-sm leading-6 text-forest/70">{species.curiosity}</p>
            </div>
            <a
              href={species.sourceUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-2 rounded-full bg-forest px-4 py-2 text-sm font-bold text-white"
            >
              Fuente visual
              <ExternalLink size={16} aria-hidden="true" />
            </a>
          </aside>
        </div>
      </section>
    </div>
  );
}

type InfoBlockProps = {
  icon: typeof Leaf;
  label: string;
  text: string;
  compact?: boolean;
};

function InfoBlock({ icon: Icon, label, text, compact = false }: InfoBlockProps) {
  return (
    <div className={`${compact ? "" : "rounded-3xl border border-forest/10 bg-white p-5"}`}>
      <div className="mb-2 flex items-center gap-2 text-canopy">
        <Icon size={18} aria-hidden="true" />
        <p className="text-sm font-bold uppercase tracking-[0.16em]">{label}</p>
      </div>
      <p className="text-sm leading-6 text-forest/70">{text}</p>
    </div>
  );
}
