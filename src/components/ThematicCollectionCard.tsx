import { ChevronRight, Layers3 } from "lucide-react";
import type { Discovery, ThematicCollection } from "../types";
import { thematicCollectionProgress } from "../utils/thematicCollections";
import { ProgressBar } from "./ProgressBar";

export function ThematicCollectionCard({ collection, discoveries, onSelect }: { collection: ThematicCollection; discoveries: Discovery[]; onSelect: (collection: ThematicCollection) => void }) {
  const progress = thematicCollectionProgress(collection, discoveries);
  return (
    <button type="button" onClick={() => onSelect(collection)} className="w-full rounded-lg border border-line bg-surface p-4 text-left shadow-panel">
      <div className="flex items-start gap-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-soft text-accent"><Layers3 size={20} aria-hidden="true" /></span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-bold text-primary">{collection.title}</span>
          <span className="mt-1 block text-xs leading-5 text-secondary">{collection.description}</span>
        </span>
        <ChevronRight size={18} className="mt-2 shrink-0 text-secondary" aria-hidden="true" />
      </div>
      <div className="mt-4 flex items-center justify-between text-xs"><span className="text-secondary">{collection.progressMode === "variants" ? "Variantes" : "Especies"}</span><strong className="text-primary">{progress.current}/{progress.total}</strong></div>
      <div className="mt-2"><ProgressBar value={progress.percentage} /></div>
    </button>
  );
}
