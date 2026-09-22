import { ExternalLink, Leaf, ShieldCheck, Utensils, X } from "lucide-react";
import { useEffect } from "react";
import { createPortal } from "react-dom";
import type { Discovery, Species } from "../types";
import { AnimalImage } from "./AnimalImage";

type SpeciesDetailProps = {
  species: Species;
  discoveries: Discovery[];
  onClose: () => void;
};

export function SpeciesDetail({ species, discoveries, onClose }: SpeciesDetailProps) {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  const phoneRoot = document.getElementById("phone-root");
  if (!phoneRoot) return null;

  return createPortal(
    <div className="absolute inset-0 z-50 flex items-end bg-brand-deep/70" role="presentation" onClick={onClose}>
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="species-title"
        className="mobile-scroll max-h-[92%] w-full overflow-y-auto rounded-t-2xl bg-base shadow-phone"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="relative aspect-[16/10] min-h-52 overflow-hidden">
          <AnimalImage src={species.image} alt={species.commonName} className="h-full w-full object-cover" />
          <div className="absolute inset-0 bg-gradient-to-t from-brand-deep/90 via-brand-deep/10 to-transparent" />
          <button
            type="button"
            onClick={onClose}
            className="absolute right-4 top-4 grid h-10 w-10 place-items-center rounded-lg bg-surface text-primary shadow-panel"
            aria-label="Cerrar ficha"
            title="Cerrar ficha"
          >
            <X size={20} aria-hidden="true" />
          </button>
          <div className="absolute bottom-5 left-5 right-5 text-brand-cream">
            <p className="mb-1 text-xs font-bold uppercase text-brand-leaf">{species.category}</p>
            <h2 id="species-title" className="text-3xl font-bold">{species.commonName}</h2>
            <p className="text-sm italic text-brand-cream/80">{species.scientificName}</p>
          </div>
        </div>
        <div className="space-y-5 p-5 pb-8">
          <p className="text-sm leading-6 text-primary">{species.description}</p>
          <div className="divide-y divide-line rounded-lg border border-line bg-surface px-4">
            <InfoBlock icon={Leaf} label="Hábitat" text={species.habitat} />
            <InfoBlock icon={Leaf} label="Exploración" text={species.explorationTypes.map((type) => ({ urban: "Urbana", wild: "Silvestre", domestic: "Doméstica" })[type]).join(" · ")} />
            <InfoBlock icon={Utensils} label="Alimentación" text={species.diet} />
            {species.distribution ? <InfoBlock icon={Leaf} label="Distribución" text={species.distribution} /> : null}
            {species.conservationStatus || species.conservation ? <InfoBlock icon={ShieldCheck} label="Conservación" text={species.conservationStatus || species.conservation || ""} /> : null}
          </div>
          <div className="border-l-2 border-accent pl-3">
            <p className="text-xs font-bold uppercase text-accent-secondary">¿Dónde podrías encontrarlo?</p>
            <p className="mt-1 text-sm leading-6 text-primary">{species.whereToFind || species.habitat}</p>
          </div>
          {species.variants ? <div>
            <p className="text-xs font-bold uppercase text-accent-secondary">Razas y variantes de esta especie</p>
            <p className="mt-2 text-sm leading-6 text-secondary">{species.variants.map((item) => item.name).join(" · ")}</p>
            {discoveries.length ? <p className="mt-2 text-sm font-medium text-primary">En tu bitácora: {[...new Set(discoveries.map((item) => species.variants?.find((variant) => variant.id === item.variantId)?.name || "Sin especificar"))].join(" · ")}</p> : null}
          </div> : null}
          <div>
            <p className="text-xs font-bold uppercase text-accent-secondary">Curiosidad</p>
            {(species.funFacts || [species.curiosity]).map((fact) => <p key={fact} className="mt-1 text-sm leading-6 text-secondary">{fact}</p>)}
          </div>
          {discoveries.length ? <div>
            <p className="text-xs font-bold uppercase text-accent-secondary">Tus observaciones · {discoveries.length}</p>
            <div className="mt-2 space-y-2">
              {[...discoveries].reverse().map((item) => <div key={item.id} className="flex items-center gap-3 rounded-lg bg-surface p-2">
                <AnimalImage src={item.photo || species.image} alt="" className="h-14 w-14 shrink-0 rounded-md object-cover" />
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-primary">{new Intl.DateTimeFormat("es", { dateStyle: "medium" }).format(new Date(item.discoveredAt))}</p>
                  {item.variantId ? <p className="truncate text-xs text-accent-secondary">{species.variants?.find((variant) => variant.id === item.variantId)?.name}</p> : null}
                  {item.notes ? <p className="line-clamp-2 text-xs text-secondary">{item.notes}</p> : null}
                </div>
              </div>)}
            </div>
          </div> : null}
          <a href={species.sourceUrl} target="_blank" rel="noreferrer" className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-accent px-4 text-sm font-bold text-on-accent">
            Fuente visual <ExternalLink size={16} aria-hidden="true" />
          </a>
          {species.scienceSourceUrl ? <a href={species.scienceSourceUrl} target="_blank" rel="noreferrer" className="ml-2 inline-flex min-h-11 items-center gap-2 rounded-lg border border-line px-4 text-sm font-bold text-primary">Referencia <ExternalLink size={16} aria-hidden="true" /></a> : null}
        </div>
      </section>
    </div>,
    phoneRoot,
  );
}

function InfoBlock({ icon: Icon, label, text }: { icon: typeof Leaf; label: string; text: string }) {
  return (
    <div className="flex gap-3 py-4">
      <Icon size={18} className="mt-0.5 shrink-0 text-accent" aria-hidden="true" />
      <div>
        <p className="text-xs font-bold uppercase text-accent-secondary">{label}</p>
        <p className="mt-1 text-sm leading-6 text-primary">{text}</p>
      </div>
    </div>
  );
}
