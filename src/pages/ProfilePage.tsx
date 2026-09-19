import { Award, CalendarDays, Medal, UserRound } from "lucide-react";
import { getSpeciesById } from "../data/species";
import { achievementsForState, categoryCounts, levelFromXp } from "../utils/gamification";
import { ProgressBar } from "../components/ProgressBar";
import type { ExplorerState } from "../types";

type ProfilePageProps = {
  state: ExplorerState;
};

export function ProfilePage({ state }: ProfilePageProps) {
  const level = levelFromXp(state.xp);
  const counts = categoryCounts(state.discoveries);
  const topCategory = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
  const achievements = achievementsForState(state);

  return (
    <div className="grid gap-5 pb-32">
      <section className="rounded-[2rem] border border-forest/10 bg-white p-6 shadow-sm">
        <div className="grid place-items-center rounded-[2rem] bg-forest p-8 text-center text-white">
          <div className="grid h-28 w-28 place-items-center rounded-full border-4 border-gold bg-paper text-forest shadow-lift">
            <UserRound size={52} aria-hidden="true" />
          </div>
          <h1 className="mt-5 text-4xl font-black">Martina</h1>
          <p className="text-white/70">Exploradora de campo</p>
          <div className="mt-6 w-full max-w-md">
            <ProgressBar value={level.progress} label={`Nivel ${level.level} · ${state.xp} XP acumulados`} />
          </div>
        </div>

        <div className="mt-5 grid gap-3">
          <ProfileStat label="Especies" value={String(state.discoveries.length)} />
          <ProfileStat label="Más explorada" value={topCategory?.[1] ? topCategory[0] : "Pendiente"} />
          <ProfileStat label="Logros" value={`${achievements.filter((item) => item.unlocked).length}/${achievements.length}`} />
        </div>
      </section>

      <section className="space-y-6">
        <div className="rounded-[2rem] border border-forest/10 bg-white p-6 shadow-sm">
          <div className="mb-5 flex items-center gap-3">
            <Medal className="text-gold" aria-hidden="true" />
            <div>
              <p className="text-sm font-bold uppercase tracking-[0.18em] text-canopy">Logros desbloqueados</p>
              <h2 className="text-3xl font-black text-forest">Bitácora de progreso</h2>
            </div>
          </div>
          <div className="grid gap-3">
            {achievements.map((achievement) => (
              <div
                key={achievement.title}
                className={`rounded-3xl border p-4 transition ${
                  achievement.unlocked
                    ? "border-gold/40 bg-gold/15 text-forest"
                    : "border-forest/10 bg-paper text-forest/45"
                }`}
              >
                <Award className={achievement.unlocked ? "text-gold" : "text-moss"} aria-hidden="true" />
                <h3 className="mt-3 font-black">{achievement.title}</h3>
                <p className="mt-1 text-sm leading-6">{achievement.description}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-[2rem] border border-forest/10 bg-white p-6 shadow-sm">
          <div className="mb-5 flex items-center gap-3">
            <CalendarDays className="text-canopy" aria-hidden="true" />
            <div>
              <p className="text-sm font-bold uppercase tracking-[0.18em] text-canopy">Historial</p>
              <h2 className="text-3xl font-black text-forest">Descubrimientos recientes</h2>
            </div>
          </div>
          <div className="space-y-3">
            {state.discoveries.length ? (
              [...state.discoveries].reverse().map((discovery) => {
                const item = getSpeciesById(discovery.speciesId);
                if (!item) return null;
                return (
                  <div key={`${discovery.speciesId}-${discovery.discoveredAt}`} className="flex items-center gap-4 rounded-3xl bg-paper p-3">
                    <img src={item.image} alt={item.commonName} className="h-16 w-16 rounded-2xl object-cover" />
                    <div>
                      <p className="font-black text-forest">{item.commonName}</p>
                      <p className="text-sm text-forest/60">
                        {new Intl.DateTimeFormat("es", { dateStyle: "medium", timeStyle: "short" }).format(new Date(discovery.discoveredAt))}
                      </p>
                    </div>
                  </div>
                );
              })
            ) : (
              <p className="rounded-3xl bg-paper p-5 text-forest/65">Aún no hay descubrimientos registrados.</p>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}

function ProfileStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-3xl bg-paper p-4">
      <p className="text-xs font-bold uppercase tracking-[0.16em] text-canopy">{label}</p>
      <p className="mt-1 text-2xl font-black text-forest">{value}</p>
    </div>
  );
}
