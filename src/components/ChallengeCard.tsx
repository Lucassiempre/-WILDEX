import { CalendarDays, Check, Clock3, Gift, LockKeyhole } from "lucide-react";
import type { ChallengeEvaluation } from "../types";
import { ProgressBar } from "./ProgressBar";

type ChallengeCardProps = {
  challenge: ChallengeEvaluation;
  onClaim: (challengeId: string) => void;
};

const phaseLabels = {
  permanent: "Permanente",
  active: "Activo",
  upcoming: "Próximo",
  ended: "Finalizado",
} as const;

const formatDate = (value: string) => new Intl.DateTimeFormat("es-AR", {
  day: "2-digit",
  month: "short",
}).format(new Date(value));

export function ChallengeCard({ challenge, onClaim }: ChallengeCardProps) {
  const canClaim = challenge.completed && !challenge.claimed;
  const muted = challenge.phase === "ended" && !challenge.completed;
  const stateLabel = challenge.claimed
    ? "Recompensa reclamada"
    : canClaim
      ? "Listo para reclamar"
      : challenge.phase === "upcoming"
        ? "Aún no comenzó"
        : challenge.phase === "ended"
          ? "Período finalizado"
          : challenge.completed
            ? "Completado"
            : "En progreso";

  return (
    <article className={`border-b border-line p-4 last:border-b-0 ${muted ? "opacity-70" : ""}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <span className={`inline-flex items-center gap-1 text-[11px] font-bold uppercase ${challenge.phase === "active" || challenge.phase === "permanent" ? "text-accent" : "text-secondary"}`}>
            {challenge.phase === "upcoming" ? <Clock3 size={13} aria-hidden="true" /> : null}
            {challenge.phase === "ended" ? <LockKeyhole size={13} aria-hidden="true" /> : null}
            {phaseLabels[challenge.phase]}
          </span>
          <h3 className="mt-1 text-sm font-bold text-primary">{challenge.title}</h3>
          <p className="mt-1 text-xs leading-5 text-secondary">{challenge.description}</p>
        </div>
        <span className="inline-flex shrink-0 items-center gap-1 text-xs font-bold text-gold">
          <Gift size={14} aria-hidden="true" />+{challenge.xpReward} XP
        </span>
      </div>

      {challenge.startDate && challenge.endDate ? (
        <p className="mt-3 flex items-center gap-1.5 text-xs text-secondary">
          <CalendarDays size={14} aria-hidden="true" />
          {formatDate(challenge.startDate)} al {formatDate(challenge.endDate)}
        </p>
      ) : null}

      <div className="mt-3 space-y-3">
        {challenge.objectives.map((objective) => (
          <div key={objective.id}>
            <div className="mb-1.5 flex items-center justify-between gap-3 text-xs">
              <span className="text-secondary">{objective.label}</span>
              <span className="shrink-0 font-bold text-primary">{objective.current}/{objective.target}</span>
            </div>
            <ProgressBar value={(objective.current / objective.target) * 100} />
          </div>
        ))}
      </div>

      <div className="mt-4 flex items-center justify-between gap-3">
        <p className={`flex items-center gap-1.5 text-xs font-semibold ${challenge.claimed || canClaim ? "text-accent" : "text-secondary"}`}>
          {challenge.claimed ? <Check size={14} aria-hidden="true" /> : null}{stateLabel}
        </p>
        {canClaim ? (
          <button
            type="button"
            onClick={() => onClaim(challenge.id)}
            className="min-h-11 shrink-0 rounded-lg bg-brand-leaf px-4 text-xs font-bold text-brand-deep transition active:scale-[.98]"
          >
            Reclamar
          </button>
        ) : null}
      </div>
    </article>
  );
}
