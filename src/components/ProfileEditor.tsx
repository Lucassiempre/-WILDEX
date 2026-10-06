import { ArrowLeft, Check, Save, UserRound } from "lucide-react";
import { useState } from "react";
import type { ReactNode } from "react";
import { avatarOptions } from "../data/avatarOptions";
import { getSpeciesById } from "../data/species";
import { validateProfile } from "../services/profileService";
import type { AvatarConfig, BadgeCatalogItem, ExplorerProfile, Species } from "../types";
import { ExplorerAvatar } from "./ExplorerAvatar";

type ProfileEditorProps = {
  profile: ExplorerProfile;
  discoveredSpecies: Species[];
  earnedBadgeIds: string[];
  badges: BadgeCatalogItem[];
  onSave: (profile: ExplorerProfile) => boolean;
  onCancel: () => void;
};

type EditorTab = "identity" | "avatar";

const fieldClass = "mt-1 min-h-11 w-full rounded-lg border border-line bg-card px-3 text-sm text-primary";
const skinSwatches = { light: "#f2c7a5", medium: "#bd815e", deep: "#70452f" };
const hairSwatches = { brown: "#513426", black: "#1b211d", blonde: "#d3a94f", copper: "#a64f2d" };

export function ProfileEditor({ profile, discoveredSpecies, earnedBadgeIds, badges, onSave, onCancel }: ProfileEditorProps) {
  const [draft, setDraft] = useState<ExplorerProfile>(() => ({ ...profile, avatarConfig: { ...profile.avatarConfig }, featuredBadgeIds: [...profile.featuredBadgeIds] }));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [activeTab, setActiveTab] = useState<EditorTab>("identity");
  const earnedSet = new Set(earnedBadgeIds);
  const earnedBadges = badges.filter((badge) => earnedSet.has(badge.id));

  const setAvatar = <K extends keyof AvatarConfig>(key: K, value: AvatarConfig[K]) => {
    setDraft((current) => ({ ...current, avatarConfig: { ...current.avatarConfig, [key]: value } }));
  };

  const toggleBadge = (badgeId: string) => {
    setDraft((current) => {
      const selected = current.featuredBadgeIds.includes(badgeId);
      if (!selected && current.featuredBadgeIds.length >= 3) return current;
      return { ...current, featuredBadgeIds: selected ? current.featuredBadgeIds.filter((id) => id !== badgeId) : [...current.featuredBadgeIds, badgeId] };
    });
  };

  const submit = () => {
    const result = validateProfile(draft, new Set(discoveredSpecies.map((item) => item.id)), earnedSet);
    setErrors(result.errors);
    if (result.errors.username || result.errors.displayName || result.errors.bio || result.errors.favoriteSpeciesId || result.errors.featuredBadgeIds) setActiveTab("identity");
    if (result.profile && onSave(result.profile)) onCancel();
  };

  const favorite = draft.favoriteSpeciesId ? getSpeciesById(draft.favoriteSpeciesId) : undefined;

  return (
    <div className="profile-editor flex h-full min-h-0 flex-col overflow-hidden">
      <header className="flex shrink-0 items-center gap-3 pb-3">
        <button type="button" onClick={onCancel} className="grid h-11 w-11 shrink-0 place-items-center rounded-lg border border-line bg-surface text-primary" aria-label="Volver al perfil"><ArrowLeft size={20} aria-hidden="true" /></button>
        <div className="min-w-0"><p className="text-[11px] font-bold uppercase text-accent-secondary">Perfil del explorador</p><h1 className="truncate text-xl font-bold text-primary">Editar mi perfil</h1></div>
      </header>

      <div className="grid shrink-0 grid-cols-2 rounded-lg border border-line bg-surface p-1" role="tablist" aria-label="Secciones del editor">
        <TabButton active={activeTab === "identity"} onClick={() => setActiveTab("identity")} label="Identidad" />
        <TabButton active={activeTab === "avatar"} onClick={() => setActiveTab("avatar")} label="Avatar" />
      </div>

      {activeTab === "identity" ? (
        <div className="mobile-scroll min-h-0 flex-1 overflow-y-auto pt-5">
          <section className="topographic rounded-lg bg-brand-deep p-4 text-brand-cream">
            <p className="text-[11px] font-bold uppercase text-brand-leaf">Vista previa</p>
            <div className="mt-2 flex items-center gap-3">
              <ExplorerAvatar config={draft.avatarConfig} className="h-16 w-16 shrink-0" />
              <div className="min-w-0"><h2 className="truncate text-lg font-bold">{draft.displayName.trim() || "Nombre visible"}</h2><p className="truncate text-xs text-brand-leaf">@{draft.username.trim() || "explorador"}</p></div>
            </div>
          </section>

          <section className="space-y-4 py-5">
            <Field label="Nombre de explorador" error={errors.username}><input value={draft.username} onChange={(event) => setDraft({ ...draft, username: event.target.value })} minLength={3} maxLength={20} className={fieldClass} autoComplete="off" /></Field>
            <Field label="Nombre visible" error={errors.displayName}><input value={draft.displayName} onChange={(event) => setDraft({ ...draft, displayName: event.target.value })} maxLength={40} className={fieldClass} autoComplete="name" /></Field>
            <Field label="Biografía" error={errors.bio}><textarea value={draft.bio ?? ""} onChange={(event) => setDraft({ ...draft, bio: event.target.value })} maxLength={160} rows={3} className={`${fieldClass} py-3`} /><span className="mt-1 block text-right text-[11px] text-secondary">{draft.bio?.length ?? 0}/160</span></Field>
          </section>

          <section className="border-t border-line py-5">
            <h2 className="text-base font-bold text-primary">Animal favorito</h2>
            {discoveredSpecies.length ? <Field label="Especie descubierta" error={errors.favoriteSpeciesId}><select value={draft.favoriteSpeciesId ?? ""} onChange={(event) => setDraft({ ...draft, favoriteSpeciesId: event.target.value || undefined })} className={fieldClass}><option value="">Sin animal favorito</option>{discoveredSpecies.map((item) => <option key={item.id} value={item.id}>{item.commonName}</option>)}</select></Field> : <p className="mt-2 rounded-lg border border-line bg-surface p-4 text-sm text-secondary">Descubrí tu primera especie para elegirla como favorita.</p>}
            {favorite ? <p className="mt-2 text-xs italic text-secondary">{favorite.scientificName}</p> : null}
          </section>

          <section className="border-t border-line py-5">
            <div className="flex items-end justify-between gap-3"><h2 className="text-base font-bold text-primary">Insignias destacadas</h2><span className="text-xs font-semibold text-secondary">{draft.featuredBadgeIds.length}/3</span></div>
            {errors.featuredBadgeIds ? <p className="mt-1 text-xs text-danger">{errors.featuredBadgeIds}</p> : null}
            <div className="mt-3 space-y-2">{earnedBadges.length ? earnedBadges.map((badge) => {
              const selected = draft.featuredBadgeIds.includes(badge.id);
              return <button key={badge.id} type="button" onClick={() => toggleBadge(badge.id)} className={`flex min-h-12 w-full items-center gap-3 rounded-lg border px-3 text-left ${selected ? "border-accent bg-soft" : "border-line bg-surface"}`}><span className={`grid h-7 w-7 place-items-center rounded-full ${selected ? "bg-accent text-on-accent" : "bg-card text-secondary"}`}>{selected ? <Check size={15} aria-hidden="true" /> : null}</span><span className="text-sm font-semibold text-primary">{badge.name}</span></button>;
            }) : <p className="rounded-lg border border-line bg-surface p-4 text-sm text-secondary">Reclamá un desafío completado para obtener insignias.</p>}</div>
          </section>
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col pt-3">
          <section className="topographic flex shrink-0 items-center gap-4 rounded-lg bg-brand-deep p-3 text-brand-cream max-[370px]:gap-3 max-[370px]:p-2 max-[700px]:py-2">
            <ExplorerAvatar config={draft.avatarConfig} className="h-28 w-28 shrink-0 max-[370px]:h-24 max-[370px]:w-24 max-[700px]:h-24 max-[700px]:w-24" />
            <div className="min-w-0"><p className="text-[11px] font-bold uppercase text-brand-leaf">Vista previa</p><h2 className="mt-1 truncate text-lg font-bold">{draft.displayName.trim() || "Explorador"}</h2><p className="mt-1 text-xs leading-5 text-brand-cream/70">Los cambios se muestran al instante.</p></div>
          </section>

          <section className="mobile-scroll min-h-0 flex-1 space-y-4 overflow-y-auto pb-5 pt-4" aria-label="Opciones del avatar">
            <OptionSelect label="Apariencia" value={draft.avatarConfig.appearance} options={avatarOptions.appearance} onChange={(value) => setAvatar("appearance", value as AvatarConfig["appearance"])} />
            <Swatches label="Tono de piel" value={draft.avatarConfig.skinTone} colors={skinSwatches} labels={Object.fromEntries(avatarOptions.skinTone.map((item) => [item.id, item.label]))} onChange={(value) => setAvatar("skinTone", value as AvatarConfig["skinTone"])} />
            <OptionSelect label="Peinado" value={draft.avatarConfig.hairStyle} options={avatarOptions.hairStyle} onChange={(value) => setAvatar("hairStyle", value as AvatarConfig["hairStyle"])} />
            <Swatches label="Color de pelo" value={draft.avatarConfig.hairColor} colors={hairSwatches} labels={Object.fromEntries(avatarOptions.hairColor.map((item) => [item.id, item.label]))} onChange={(value) => setAvatar("hairColor", value as AvatarConfig["hairColor"])} />
            <OptionSelect label="Ropa" value={draft.avatarConfig.outfit} options={avatarOptions.outfit} onChange={(value) => setAvatar("outfit", value as AvatarConfig["outfit"])} />
            <OptionSelect label="Accesorio" value={draft.avatarConfig.accessory} options={avatarOptions.accessory} onChange={(value) => setAvatar("accessory", value as AvatarConfig["accessory"])} />
            <OptionSelect label="Fondo" value={draft.avatarConfig.background} options={avatarOptions.background} onChange={(value) => setAvatar("background", value as AvatarConfig["background"])} />
          </section>
        </div>
      )}

      <div className="grid shrink-0 grid-cols-[1fr_auto] gap-3 border-t border-line bg-base pt-3">
        <button type="button" onClick={onCancel} className="min-h-12 rounded-lg border border-line bg-surface px-4 font-bold text-primary">Cancelar</button>
        <button type="button" onClick={submit} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-lg bg-brand-leaf px-5 font-bold text-brand-deep"><Save size={18} aria-hidden="true" />Guardar cambios</button>
      </div>
    </div>
  );
}

function TabButton({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return <button type="button" role="tab" aria-selected={active} onClick={onClick} className={`inline-flex min-h-10 items-center justify-center gap-2 rounded-md px-3 text-sm font-bold ${active ? "bg-soft text-accent" : "text-secondary"}`}>{label === "Identidad" ? <UserRound size={16} aria-hidden="true" /> : null}{label}</button>;
}

function Field({ label, error, children }: { label: string; error?: string; children: ReactNode }) {
  return <label className="mt-3 block text-xs font-semibold text-secondary">{label}{children}{error ? <span className="mt-1 block text-danger">{error}</span> : null}</label>;
}

function OptionSelect({ label, value, options, onChange }: { label: string; value: string; options: Array<{ id: string; label: string }>; onChange: (value: string) => void }) {
  return <label className="block text-xs font-semibold text-secondary">{label}<select value={value} onChange={(event) => onChange(event.target.value)} className={fieldClass}>{options.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label>;
}

function Swatches({ label, value, colors, labels, onChange }: { label: string; value: string; colors: Record<string, string>; labels: Record<string, string>; onChange: (value: string) => void }) {
  return <fieldset><legend className="text-xs font-semibold text-secondary">{label}</legend><div className="mt-2 flex gap-3">{Object.entries(colors).map(([id, color]) => <button key={id} type="button" onClick={() => onChange(id)} className={`h-11 w-11 rounded-full border-2 ${value === id ? "border-gold" : "border-line"}`} style={{ backgroundColor: color }} aria-label={labels[id]} title={labels[id]} />)}</div></fieldset>;
}
