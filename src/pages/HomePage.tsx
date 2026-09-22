import { ArrowRight, Camera, Compass, Leaf, Trophy } from "lucide-react";
import { AnimalImage } from "../components/AnimalImage";
import { ProgressBar } from "../components/ProgressBar";
import { getSpeciesById, species } from "../data/species";
import type { ExplorerState, View } from "../types";
import { categoryCounts, challengesForState, discoveredSpeciesCount, discoveredSpeciesIds, levelFromXp } from "../utils/gamification";

type HomePageProps = {
  state: ExplorerState;
  onNavigate: (view: View) => void;
};

export function HomePage({ state, onNavigate }: HomePageProps) {
  const level = levelFromXp(state.xp);
  const lastDiscovery = state.discoveries.at(-1);
  const lastSpecies = lastDiscovery ? getSpeciesById(lastDiscovery.speciesId) : undefined;
  const counts = categoryCounts(state.discoveries);
  const discoveredCount = discoveredSpeciesCount(state.discoveries);
  const topCategory = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
  const collectionProgress = Math.round((discoveredCount / species.length) * 100);
  const urbanCount = [...discoveredSpeciesIds(state.discoveries)].filter((id) => getSpeciesById(id)?.explorationTypes.includes("urban")).length;
  const featuredChallenge = challengesForState(state).find((item) => !item.completed) || challengesForState(state)[0];

  return (
    <div className="space-y-6 pb-24">
      <section className="topographic overflow-hidden rounded-lg bg-brand-deep p-5 text-brand-cream">
        <p className="text-xs font-bold uppercase text-brand-leaf">Tu próxima expedición</p>
        <h1 className="mt-3 text-3xl font-bold leading-tight">Hola, Martina.</h1>
        <p className="mt-2 max-w-[290px] text-sm leading-6 text-brand-cream/75">
          Hay nuevas especies esperando en tu ruta.
        </p>
        <button
          type="button"
          onClick={() => onNavigate("descubrir")}
          className="mt-6 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-lg bg-brand-leaf px-4 font-bold text-brand-deep transition active:scale-[.98]"
        >
          <Camera size={19} aria-hidden="true" />
          Descubrir un animal
          <ArrowRight size={18} aria-hidden="true" />
        </button>
        {lastSpecies ? (
          <div className="mt-5 flex items-center gap-3 border-t border-brand-cream/15 pt-4">
            <AnimalImage src={lastDiscovery?.photo || lastSpecies.image} alt="" className="h-14 w-14 shrink-0 rounded-lg object-cover" />
            <div className="min-w-0">
              <p className="text-xs font-medium text-brand-cream/65">Último encuentro</p>
              <p className="truncate text-sm font-bold text-brand-cream">{lastSpecies.commonName}</p>
            </div>
          </div>
        ) : null}
      </section>

      <section className="rounded-lg border border-line bg-surface p-5 shadow-panel">
        <div className="mb-4 flex items-end justify-between">
          <div>
            <p className="text-xs font-bold uppercase text-accent-secondary">Nivel de explorador</p>
            <h2 className="mt-1 text-2xl font-bold text-primary">Nivel {level.level}</h2>
          </div>
          <span className="text-sm font-semibold text-secondary">{state.xp} XP</span>
        </div>
        <ProgressBar value={level.progress} label={`${level.nextLevelXp - level.currentLevelXp} XP para el próximo nivel`} />
      </section>

      <section>
        <div className="mb-3 flex items-center gap-2">
          <Compass size={18} className="text-accent" aria-hidden="true" />
          <h2 className="text-lg font-bold text-primary">Tu exploración</h2>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-lg border border-line bg-card p-4">
            <Leaf size={19} className="text-accent" aria-hidden="true" />
            <p className="mt-4 text-2xl font-bold text-primary">{discoveredCount}<span className="text-base text-secondary">/{species.length}</span></p>
            <p className="mt-1 text-xs font-medium text-secondary">Especies registradas</p>
          </div>
          <div className="rounded-lg border border-line bg-card p-4">
            <Trophy size={19} className="text-gold" aria-hidden="true" />
            <p className="mt-4 truncate text-lg font-bold text-primary">{topCategory?.[1] ? topCategory[0] : "Pendiente"}</p>
            <p className="mt-1 text-xs font-medium text-secondary">Categoría destacada</p>
          </div>
        </div>
        <p className="mt-3 text-xs font-medium text-secondary">Especies urbanas registradas: {urbanCount}</p>
      </section>

      <section>
        <h2 className="mb-3 text-lg font-bold text-primary">Desafío destacado</h2>
        <div className="rounded-lg border border-line bg-surface p-4">
          <div className="flex items-start justify-between gap-3"><div><p className="text-sm font-bold text-primary">{featuredChallenge.title}</p><p className="mt-1 text-xs text-secondary">{featuredChallenge.description}</p></div><span className="shrink-0 text-sm font-bold text-accent">{featuredChallenge.current}/{featuredChallenge.target}</span></div>
          <div className="mt-3"><ProgressBar value={featuredChallenge.current / featuredChallenge.target * 100} /></div>
          <p className="mt-2 text-xs text-secondary">{featuredChallenge.completed ? "Completado" : `Recompensa: ${featuredChallenge.reward}`}</p>
        </div>
      </section>

      <button
        type="button"
        onClick={() => onNavigate("coleccion")}
        className="block w-full rounded-lg border border-line bg-surface p-5 text-left shadow-panel transition active:scale-[.99]"
      >
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-xs font-bold uppercase text-accent-secondary">Colección</p>
            <h2 className="mt-1 text-xl font-bold text-primary">{collectionProgress}% completado</h2>
          </div>
          <ArrowRight size={20} className="text-accent" aria-hidden="true" />
        </div>
        <div className="mt-4"><ProgressBar value={collectionProgress} /></div>
        <p className="mt-3 text-sm text-secondary">{species.length - discoveredCount} especies por descubrir</p>
      </button>
    </div>
  );
}
