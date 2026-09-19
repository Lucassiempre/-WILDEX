import { Camera, ChevronRight, Compass, Flame, Leaf, Trophy } from "lucide-react";
import { getSpeciesById, species } from "../data/species";
import { categoryCounts, levelFromXp } from "../utils/gamification";
import { ProgressBar } from "../components/ProgressBar";
import type { ExplorerState, View } from "../types";

type HomePageProps = {
  state: ExplorerState;
  onNavigate: (view: View) => void;
};

export function HomePage({ state, onNavigate }: HomePageProps) {
  const level = levelFromXp(state.xp);
  const lastDiscovery = state.discoveries.at(-1);
  const lastSpecies = lastDiscovery ? getSpeciesById(lastDiscovery.speciesId) : undefined;
  const counts = categoryCounts(state.discoveries);
  const topCategory = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
  const collectionProgress = Math.round((state.discoveries.length / species.length) * 100);

  return (
    <div className="space-y-5 pb-32">
      <section className="grid gap-4">
        <div className="relative overflow-hidden rounded-[2rem] bg-forest p-5 text-white shadow-glow">
          <div className="absolute right-0 top-0 h-48 w-48 rounded-full bg-gold/20 blur-3xl" />
          <p className="text-sm font-bold uppercase tracking-[0.28em] text-gold">Dashboard de explorador</p>
          <h1 className="mt-4 text-4xl font-black leading-tight">
            Hola, Martina. Hay especies esperando registro.
          </h1>
          <div className="mt-6 max-w-xl">
            <ProgressBar value={level.progress} label={`Nivel ${level.level} · ${level.currentLevelXp}/${level.nextLevelXp} XP`} />
          </div>
          <button
            type="button"
            onClick={() => onNavigate("descubrir")}
            className="mt-7 inline-flex items-center gap-3 rounded-2xl bg-gold px-5 py-4 text-base font-black text-forest shadow-lift transition hover:-translate-y-0.5"
          >
            <Camera size={22} aria-hidden="true" />
            Descubrir un animal
          </button>
        </div>

        <div className="grid gap-3">
          <StatCard icon={Leaf} label="Especies descubiertas" value={`${state.discoveries.length}/${species.length}`} />
          <StatCard icon={Flame} label="Categoría más explorada" value={topCategory?.[1] ? topCategory[0] : "Pendiente"} />
          <StatCard icon={Trophy} label="Último animal" value={lastSpecies?.commonName ?? "Sin registros"} />
        </div>
      </section>

      <section className="grid gap-4">
        <div className="rounded-[2rem] border border-forest/10 bg-white p-5 shadow-sm">
          <div className="mb-5 flex items-center justify-between">
            <div>
              <p className="text-sm font-bold uppercase tracking-[0.18em] text-canopy">Desafíos diarios</p>
              <h2 className="text-2xl font-black text-forest">Ruta de hoy</h2>
            </div>
            <Compass className="text-gold" aria-hidden="true" />
          </div>
          <div className="space-y-3">
            <Challenge text="Registra una especie desde cámara o archivo" done={state.discoveries.length > 0} />
            <Challenge text="Descubre una especie de ave" done={counts.Aves > 0} />
            <Challenge text="Abre una ficha completa de la colección" done={state.discoveries.length > 1} />
          </div>
        </div>

        <button
          type="button"
          onClick={() => onNavigate("coleccion")}
          className="overflow-hidden rounded-[2rem] border border-forest/10 bg-white text-left shadow-sm transition hover:-translate-y-1 hover:shadow-lift"
        >
          <div className="grid gap-4 p-5">
            <div className="space-y-4">
              <p className="text-sm font-bold uppercase tracking-[0.18em] text-canopy">Progreso de colección</p>
              <h2 className="text-3xl font-black text-forest">{collectionProgress}% de la Wildex demo</h2>
              <ProgressBar value={collectionProgress} />
              <p className="text-sm leading-6 text-forest/65">
                Las especies no descubiertas quedan como siluetas hasta que las sumes a tu bitácora.
              </p>
            </div>
            <div className="grid min-h-36 place-items-center rounded-3xl bg-paper">
              <div className="text-center">
                <p className="text-6xl font-black text-forest">{species.length - state.discoveries.length}</p>
                <p className="text-sm font-bold uppercase tracking-[0.16em] text-canopy">pendientes</p>
              </div>
            </div>
          </div>
          <div className="flex items-center justify-between border-t border-forest/10 px-5 py-4 text-sm font-bold text-forest">
            Ver colección
            <ChevronRight size={18} aria-hidden="true" />
          </div>
        </button>
      </section>
    </div>
  );
}

type StatCardProps = {
  icon: typeof Leaf;
  label: string;
  value: string;
};

function StatCard({ icon: Icon, label, value }: StatCardProps) {
  return (
    <div className="rounded-[2rem] border border-forest/10 bg-white p-5 shadow-sm">
      <div className="mb-4 grid h-11 w-11 place-items-center rounded-2xl bg-paper text-canopy">
        <Icon size={21} aria-hidden="true" />
      </div>
      <p className="text-sm font-bold uppercase tracking-[0.15em] text-canopy">{label}</p>
      <p className="mt-2 text-2xl font-black text-forest">{value}</p>
    </div>
  );
}

function Challenge({ text, done }: { text: string; done: boolean }) {
  return (
    <div className="flex items-center gap-3 rounded-2xl bg-paper p-4">
      <div className={`h-3 w-3 rounded-full ${done ? "bg-gold" : "bg-moss"}`} />
      <p className={`text-sm font-semibold ${done ? "text-forest" : "text-forest/55"}`}>{text}</p>
    </div>
  );
}
