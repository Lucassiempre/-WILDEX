import { Award, CalendarDays, Camera, Check, LockKeyhole, Medal, PawPrint, Pencil, Star } from "lucide-react";
import { useState } from "react";
import { AnimalImage } from "../components/AnimalImage";
import { ObservationImage } from "../components/ObservationImage";
import { AuthAccountPanel } from "../components/AuthAccountPanel";
import type { ProgressLinkViewModel } from "../components/AuthAccountPanel";
import { ChallengeCard } from "../components/ChallengeCard";
import { ExplorerAvatar } from "../components/ExplorerAvatar";
import { ProfileEditor } from "../components/ProfileEditor";
import { ProgressBar } from "../components/ProgressBar";
import { fixedChallenges } from "../data/challenges";
import { getSpeciesById } from "../data/species";
import { evaluateFixedChallenges, evaluateWeeklyChallenges } from "../services/challengeService";
import type { ExplorerProfile, ExplorerState, Species, WeeklyChallengeDefinition } from "../types";
import { buildBadgeCatalog } from "../utils/badges";
import { achievementsForState, categoryCounts, discoveredSpeciesCount, discoveredVariantCount, levelFromXp } from "../utils/gamification";

type ProfilePageProps = {
  state: ExplorerState;
  profile: ExplorerProfile;
  weeklyChallenges: WeeklyChallengeDefinition[];
  anonymousProgressPending: boolean;
  progressLink?: ProgressLinkViewModel;
  onSaveProfile: (profile: ExplorerProfile) => boolean;
  onClaimChallenge: (challengeId: string) => void;
};

export function ProfilePage({ state, profile, weeklyChallenges, anonymousProgressPending, progressLink, onSaveProfile, onClaimChallenge }: ProfilePageProps) {
  const [editing, setEditing] = useState(false);
  const level = levelFromXp(state.xp);
  const counts = categoryCounts(state.discoveries);
  const topCategory = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
  const achievements = achievementsForState(state);
  const unlockedCount = achievements.filter((item) => item.unlocked).length;
  const fixedEvaluations = evaluateFixedChallenges(state);
  const phaseOrder = { active: 0, upcoming: 1, ended: 2, permanent: 3 };
  const weeklyEvaluations = evaluateWeeklyChallenges(state, weeklyChallenges).sort((a, b) => phaseOrder[a.phase] - phaseOrder[b.phase]);
  const completedChallenges = [...fixedEvaluations, ...weeklyEvaluations].filter((item) => item.completed).length;
  const badgeCatalog = buildBadgeCatalog(fixedChallenges, weeklyChallenges);
  const earnedBadgeSet = new Set(state.earnedBadgeIds);
  const discoveredSpecies = [...new Set(state.discoveries.map((item) => item.speciesId))]
    .map(getSpeciesById)
    .filter((item): item is Species => Boolean(item))
    .sort((a, b) => a.commonName.localeCompare(b.commonName));
  const favoriteSpecies = profile.favoriteSpeciesId && discoveredSpecies.some((item) => item.id === profile.favoriteSpeciesId)
    ? getSpeciesById(profile.favoriteSpeciesId)
    : undefined;

  if (editing) return <ProfileEditor profile={profile} discoveredSpecies={discoveredSpecies} earnedBadgeIds={state.earnedBadgeIds} badges={badgeCatalog} onSave={onSaveProfile} onCancel={() => setEditing(false)} />;

  return (
    <div className="space-y-6 pb-24">
      <section className="topographic rounded-lg bg-brand-deep p-5 text-brand-cream">
        <div className="flex items-center gap-4">
          <ExplorerAvatar config={profile.avatarConfig} className="h-24 w-24 shrink-0" />
          <div className="min-w-0 flex-1">
            <p className="text-xs font-bold uppercase text-brand-leaf">Perfil del explorador</p>
            <h1 className="mt-1 truncate text-2xl font-bold">{profile.displayName}</h1>
            <p className="truncate text-sm text-brand-leaf">@{profile.username}</p>
            {profile.bio ? <p className="mt-2 line-clamp-2 text-xs leading-5 text-brand-cream/70">{profile.bio}</p> : null}
          </div>
        </div>
        {profile.featuredBadgeIds.some((id) => earnedBadgeSet.has(id)) ? <div className="mt-4 flex flex-wrap gap-2">{profile.featuredBadgeIds.filter((id) => earnedBadgeSet.has(id)).map((id) => {
          const badge = badgeCatalog.find((item) => item.id === id);
          return badge ? <span key={id} className="inline-flex items-center gap-1 rounded-full border border-gold/40 bg-gold/10 px-2.5 py-1 text-[11px] font-bold text-gold"><Award size={13} aria-hidden="true" />{badge.name}</span> : null;
        })}</div> : null}
        <div className="mt-5"><div className="mb-2 flex justify-between text-sm font-semibold"><span>Nivel {level.level}</span><span>{state.xp} XP</span></div><ProgressBar value={level.progress} label={`${level.nextLevelXp - level.currentLevelXp} XP para el próximo nivel`} /></div>
        <button type="button" onClick={() => setEditing(true)} className="mt-5 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-lg border border-brand-cream/20 bg-brand-cream/10 px-4 text-sm font-bold text-brand-cream"><Pencil size={17} aria-hidden="true" />Editar mi perfil</button>
      </section>

      <AuthAccountPanel anonymousProgressPending={anonymousProgressPending} progressLink={progressLink} />

      <section>
        <h2 className="mb-3 text-lg font-bold text-primary">Tu progreso</h2>
        <div className="grid grid-cols-2 gap-2" aria-label="Estadísticas del perfil">
          <ProfileStat label="Especies" value={String(discoveredSpeciesCount(state.discoveries))} />
          <ProfileStat label="Variantes" value={String(discoveredVariantCount(state.discoveries))} />
          <ProfileStat label="Observaciones" value={String(state.discoveries.length)} />
          <ProfileStat label="Fotografías" value={String(state.discoveries.filter((item) => Boolean(item.photo || item.photoRef || item.remotePhoto)).length)} />
          <ProfileStat label="Desafíos completos" value={String(completedChallenges)} />
          <ProfileStat label="Insignias" value={String(state.earnedBadgeIds.length)} />
        </div>
        <p className="mt-3 text-xs text-secondary">Categoría más explorada: <strong className="text-primary">{topCategory?.[1] ? topCategory[0] : "Todavía sin datos"}</strong></p>
      </section>

      <section>
        <div className="mb-3 flex items-center gap-2"><PawPrint size={19} className="text-accent" aria-hidden="true" /><h2 className="text-lg font-bold text-primary">Animal favorito</h2></div>
        {favoriteSpecies ? <div className="flex items-center gap-4 rounded-lg border border-line bg-surface p-3"><AnimalImage src={favoriteSpecies.image} alt="" className="h-20 w-20 shrink-0 rounded-lg object-cover" /><div className="min-w-0"><p className="font-bold text-primary">{favoriteSpecies.commonName}</p><p className="mt-1 text-xs italic text-secondary">{favoriteSpecies.scientificName}</p></div><Star size={19} className="ml-auto shrink-0 text-gold" fill="currentColor" aria-label="Favorito" /></div> : <p className="rounded-lg border border-line bg-surface p-4 text-sm text-secondary">{discoveredSpecies.length ? "Editá tu perfil para elegir una especie descubierta." : "Descubrí tu primera especie para elegir un animal favorito."}</p>}
      </section>

      <section>
        <div className="mb-3 flex items-center gap-2"><Medal size={19} className="text-gold" aria-hidden="true" /><h2 className="text-lg font-bold text-primary">Insignias</h2><span className="ml-auto text-xs font-semibold text-secondary">{state.earnedBadgeIds.length}/{badgeCatalog.length}</span></div>
        <div className="divide-y divide-line overflow-hidden rounded-lg border border-line bg-surface">
          {badgeCatalog.map((badge) => {
            const earned = earnedBadgeSet.has(badge.id);
            const award = state.badgeAwards?.find((item) => item.badgeId === badge.id);
            const dateLabel = award?.earnedAt ? new Intl.DateTimeFormat("es-AR", { dateStyle: "medium" }).format(new Date(award.earnedAt)) : "Registro anterior";
            return <div key={badge.id} className="flex gap-3 p-4"><span className={`grid h-10 w-10 shrink-0 place-items-center rounded-full ${earned ? "bg-gold/15 text-gold" : "bg-soft text-secondary"}`}>{earned ? <Award size={19} aria-hidden="true" /> : <LockKeyhole size={17} aria-hidden="true" />}</span><div className="min-w-0"><p className="text-sm font-bold text-primary">{badge.name}</p><p className="mt-1 text-xs text-secondary">Desafío: {badge.challengeTitle}</p><p className={`mt-1 text-[11px] font-semibold ${earned ? "text-accent" : "text-secondary"}`}>{earned ? `Obtenida: ${dateLabel}` : "Pendiente"}</p></div></div>;
          })}
        </div>
      </section>

      <section><div className="mb-3 flex items-center gap-2"><Award size={19} className="text-accent" aria-hidden="true" /><h2 className="text-lg font-bold text-primary">Desafíos fijos</h2></div><div className="overflow-hidden rounded-lg border border-line bg-surface">{fixedEvaluations.map((challenge) => <ChallengeCard key={challenge.id} challenge={challenge} onClaim={onClaimChallenge} />)}</div></section>
      <section><div className="mb-3 flex items-center gap-2"><CalendarDays size={19} className="text-accent" aria-hidden="true" /><h2 className="text-lg font-bold text-primary">Desafíos semanales</h2></div><div className="overflow-hidden rounded-lg border border-line bg-surface">{weeklyEvaluations.length ? weeklyEvaluations.map((challenge) => <ChallengeCard key={challenge.id} challenge={challenge} onClaim={onClaimChallenge} />) : <p className="p-5 text-sm text-secondary">No hay desafíos semanales publicados.</p>}</div></section>

      <section>
        <div className="mb-3 flex items-center gap-2"><Medal size={19} className="text-gold" aria-hidden="true" /><h2 className="text-lg font-bold text-primary">Logros</h2><span className="ml-auto text-xs font-semibold text-secondary">{unlockedCount}/{achievements.length}</span></div>
        <div className="divide-y divide-line overflow-hidden rounded-lg border border-line bg-surface">{achievements.map((achievement) => <div key={achievement.title} className="flex gap-3 p-4"><span className={`grid h-10 w-10 shrink-0 place-items-center rounded-lg ${achievement.unlocked ? "bg-gold/15 text-gold" : "bg-soft text-secondary"}`}>{achievement.unlocked ? <Award size={19} aria-hidden="true" /> : <LockKeyhole size={17} aria-hidden="true" />}</span><div className="min-w-0 flex-1"><div className="flex items-center gap-2"><h3 className="text-sm font-bold text-primary">{achievement.title}</h3>{achievement.unlocked ? <Check size={15} className="text-accent" aria-label="Desbloqueado" /> : null}</div><p className="mt-1 text-xs leading-5 text-secondary">{achievement.description}</p></div></div>)}</div>
      </section>

      <section>
        <div className="mb-3 flex items-center gap-2"><Camera size={19} className="text-accent" aria-hidden="true" /><h2 className="text-lg font-bold text-primary">Descubrimientos recientes</h2></div>
        <div className="divide-y divide-line overflow-hidden rounded-lg border border-line bg-surface">{state.discoveries.length ? [...state.discoveries].reverse().map((discovery) => {
          const item = getSpeciesById(discovery.speciesId);
          if (!item) return null;
          return <div key={discovery.id} className="flex items-center gap-3 p-3"><ObservationImage discovery={discovery} fallback={item.image} alt="" className="h-14 w-14 shrink-0 rounded-lg object-cover" /><div className="min-w-0"><p className="truncate text-sm font-bold text-primary">{item.commonName}</p>{discovery.variantId ? <p className="truncate text-xs text-accent">{item.variants?.find((variant) => variant.id === discovery.variantId)?.name}</p> : null}<p className="text-xs text-secondary">{new Intl.DateTimeFormat("es", { dateStyle: "medium", timeStyle: "short" }).format(new Date(discovery.discoveredAt))}</p></div></div>;
        }) : <p className="p-5 text-sm text-secondary">Aún no hay descubrimientos registrados.</p>}</div>
      </section>
    </div>
  );
}

function ProfileStat({ label, value }: { label: string; value: string }) {
  return <div className="min-w-0 rounded-lg border border-line bg-card p-3"><p className="text-[11px] font-medium text-secondary">{label}</p><p className="mt-2 text-lg font-bold text-primary">{value}</p></div>;
}
