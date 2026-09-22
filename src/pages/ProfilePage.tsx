import { Award, CalendarDays, Check, LockKeyhole, Medal, UserRound } from "lucide-react";
import { ProgressBar } from "../components/ProgressBar";
import { getSpeciesById } from "../data/species";
import { AnimalImage } from "../components/AnimalImage";
import type { ExplorerState } from "../types";
import { achievementsForState, categoryCounts, challengesForState, discoveredSpeciesCount, levelFromXp } from "../utils/gamification";

type ProfilePageProps = {
  state: ExplorerState;
};

export function ProfilePage({ state }: ProfilePageProps) {
  const level = levelFromXp(state.xp);
  const counts = categoryCounts(state.discoveries);
  const topCategory = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
  const achievements = achievementsForState(state);
  const unlockedCount = achievements.filter((item) => item.unlocked).length;
  const challenges = challengesForState(state);

  return (
    <div className="space-y-6 pb-24">
      <section className="topographic rounded-lg bg-brand-deep p-5 text-brand-cream">
        <div className="flex items-center gap-4">
          <div className="grid h-20 w-20 shrink-0 place-items-center rounded-lg border border-brand-cream/20 bg-brand-leaf/10 text-brand-leaf">
            <UserRound size={38} aria-hidden="true" />
          </div>
          <div>
            <p className="text-xs font-bold uppercase text-brand-leaf">Perfil del explorador</p>
            <h1 className="mt-1 text-2xl font-bold">Martina</h1>
            <p className="text-sm text-brand-cream/70">Exploradora de campo</p>
          </div>
        </div>
        <div className="mt-6">
          <div className="mb-2 flex justify-between text-sm font-semibold">
            <span>Nivel {level.level}</span>
            <span>{state.xp} XP</span>
          </div>
          <ProgressBar value={level.progress} label={`${level.nextLevelXp - level.currentLevelXp} XP para el próximo nivel`} />
        </div>
      </section>

      <section className="grid grid-cols-3 gap-2" aria-label="Estadísticas del perfil">
        <ProfileStat label="Especies" value={String(discoveredSpeciesCount(state.discoveries))} />
        <ProfileStat label="Categoría" value={topCategory?.[1] ? topCategory[0] : "—"} />
        <ProfileStat label="Logros" value={`${unlockedCount}/${achievements.length}`} />
      </section>

      <section>
        <div className="mb-3 flex items-center gap-2"><Award size={19} className="text-accent" aria-hidden="true" /><h2 className="text-lg font-bold text-primary">Desafíos de exploración</h2></div>
        <div className="divide-y divide-line overflow-hidden rounded-lg border border-line bg-surface">
          {challenges.map((challenge) => <div key={challenge.title} className="p-4">
            <div className="flex items-start justify-between gap-3"><div><p className="text-sm font-bold text-primary">{challenge.title}</p><p className="mt-1 text-xs text-secondary">{challenge.description}</p></div><span className="shrink-0 text-xs font-bold text-accent">{challenge.current}/{challenge.target}</span></div>
            <div className="mt-3"><ProgressBar value={challenge.current / challenge.target * 100} /></div>
            <p className="mt-2 text-xs text-secondary">{challenge.completed ? "Completado" : `Recompensa: ${challenge.reward}`}</p>
          </div>)}
        </div>
      </section>

      <section>
        <div className="mb-3 flex items-center gap-2">
          <Medal size={19} className="text-gold" aria-hidden="true" />
          <h2 className="text-lg font-bold text-primary">Logros</h2>
          <span className="ml-auto text-xs font-semibold text-secondary">{unlockedCount}/{achievements.length}</span>
        </div>
        <div className="divide-y divide-line overflow-hidden rounded-lg border border-line bg-surface">
          {achievements.map((achievement) => (
            <div key={achievement.title} className="flex gap-3 p-4">
              <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-lg ${achievement.unlocked ? "bg-gold/15 text-gold" : "bg-soft text-secondary"}`}>
                {achievement.unlocked ? <Award size={19} aria-hidden="true" /> : <LockKeyhole size={17} aria-hidden="true" />}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-bold text-primary">{achievement.title}</h3>
                  {achievement.unlocked ? <Check size={15} className="text-accent" aria-label="Desbloqueado" /> : null}
                </div>
                <p className="mt-1 text-xs leading-5 text-secondary">{achievement.description}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section>
        <div className="mb-3 flex items-center gap-2">
          <CalendarDays size={19} className="text-accent" aria-hidden="true" />
          <h2 className="text-lg font-bold text-primary">Descubrimientos recientes</h2>
        </div>
        <div className="divide-y divide-line overflow-hidden rounded-lg border border-line bg-surface">
          {state.discoveries.length ? (
            [...state.discoveries].reverse().map((discovery) => {
              const item = getSpeciesById(discovery.speciesId);
              if (!item) return null;
              return (
                <div key={discovery.id} className="flex items-center gap-3 p-3">
                  <AnimalImage src={discovery.photo || item.image} alt="" className="h-14 w-14 shrink-0 rounded-lg object-cover" />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-bold text-primary">{item.commonName}</p>
                    {discovery.variantId ? <p className="truncate text-xs text-accent">{item.variants?.find((variant) => variant.id === discovery.variantId)?.name}</p> : null}
                    <p className="text-xs text-secondary">
                      {new Intl.DateTimeFormat("es", { dateStyle: "medium", timeStyle: "short" }).format(new Date(discovery.discoveredAt))}
                    </p>
                  </div>
                </div>
              );
            })
          ) : (
            <p className="p-5 text-sm text-secondary">Aún no hay descubrimientos registrados.</p>
          )}
        </div>
      </section>
    </div>
  );
}

function ProfileStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-lg border border-line bg-card p-3">
      <p className="truncate text-[11px] font-medium text-secondary">{label}</p>
      <p className="mt-2 truncate text-base font-bold text-primary">{value}</p>
    </div>
  );
}
