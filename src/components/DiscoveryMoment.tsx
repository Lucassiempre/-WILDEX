import { ArrowRight, Sparkles, X } from "lucide-react";
import type { Species } from "../types";
import { AnimalImage } from "./AnimalImage";

export type DiscoveryMomentData = {
  species: Species;
  photo?: string;
  kind: "species" | "variant" | "observation";
  xp: number;
  count: number;
  total: number;
};

export function DiscoveryMoment({ data, onClose }: { data: DiscoveryMomentData; onClose: () => void }) {
  const title = data.kind === "species" ? "Nueva especie descubierta" : data.kind === "variant" ? "Nueva variante registrada" : "Nueva observación guardada";
  return (
    <div className="absolute inset-0 z-50 grid place-items-center bg-brand-deep/95 p-5 text-brand-cream" role="dialog" aria-modal="true" aria-labelledby="moment-title">
      <button type="button" onClick={onClose} aria-label="Cerrar" className="absolute right-5 top-5 grid h-11 w-11 place-items-center rounded-lg border border-brand-cream/20"><X size={20} /></button>
      <div className="w-full max-w-sm animate-pop text-center">
        <Sparkles size={34} className="mx-auto text-brand-leaf" aria-hidden="true" />
        <p className="mt-5 text-xs font-bold uppercase text-brand-leaf">Bitácora actualizada</p>
        <h2 id="moment-title" className="mt-2 text-2xl font-bold">{title}</h2>
        <AnimalImage src={data.photo || data.species.image} alt={data.species.commonName} className="mx-auto mt-6 aspect-[4/3] w-full rounded-lg object-cover" />
        <p className="mt-5 text-xl font-bold">{data.species.commonName}</p>
        <p className="mt-1 text-sm italic text-brand-cream/70">{data.species.scientificName}</p>
        <div className="mt-6 flex justify-center gap-8 text-sm"><span><strong className="block text-lg text-brand-leaf">+{data.xp}</strong>XP</span><span><strong className="block text-lg text-brand-leaf">{data.count}/{data.total}</strong>especies</span></div>
        <button type="button" onClick={onClose} className="mt-7 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-lg bg-brand-leaf px-4 font-bold text-brand-deep">Ver colección <ArrowRight size={18} /></button>
      </div>
    </div>
  );
}
