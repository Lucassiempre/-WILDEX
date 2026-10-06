import { ArrowLeft, ChevronLeft, ChevronRight, Images, Pencil, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { ObservationImage } from "../components/ObservationImage";
import { SpeciesDetail } from "../components/SpeciesDetail";
import type { DiscoveryDetails } from "../services/discoveryService";
import type { Discovery, Species, View } from "../types";
import { buildSpeciesAlbums, photoDiscoveries, registeredVariantIds } from "../utils/album";

type AlbumPageProps = {
  discoveries: Discovery[];
  initialSpeciesId?: string;
  onNavigate: (view: View) => void;
  onEditDiscovery: (discoveryId: string, details: DiscoveryDetails) => boolean;
};

const dateFormatter = new Intl.DateTimeFormat("es", { dateStyle: "medium" });
const dateTimeFormatter = new Intl.DateTimeFormat("es", { dateStyle: "medium", timeStyle: "short" });

export function AlbumPage({ discoveries, initialSpeciesId, onNavigate, onEditDiscovery }: AlbumPageProps) {
  const albums = useMemo(() => buildSpeciesAlbums(discoveries), [discoveries]);
  const photos = useMemo(() => photoDiscoveries(discoveries), [discoveries]);
  const [selectedSpeciesId, setSelectedSpeciesId] = useState<string | undefined>(initialSpeciesId);
  const [viewerId, setViewerId] = useState<string>();
  const [detailSpecies, setDetailSpecies] = useState<Species>();
  const selectedAlbum = albums.find((album) => album.species.id === selectedSpeciesId);

  if (selectedAlbum) {
    return (
      <SpeciesAlbumView
        album={selectedAlbum}
        allDiscoveries={discoveries}
        viewerId={viewerId}
        onBack={() => setSelectedSpeciesId(undefined)}
        onOpenViewer={setViewerId}
        onCloseViewer={() => setViewerId(undefined)}
        onEditDiscovery={onEditDiscovery}
        onOpenSpecies={(item) => { setViewerId(undefined); setDetailSpecies(item); }}
        detailSpecies={detailSpecies}
        onCloseSpecies={() => setDetailSpecies(undefined)}
      />
    );
  }

  return (
    <div className="space-y-5 pb-24">
      <section>
        <p className="text-xs font-bold uppercase text-accent-secondary">Biblioteca personal</p>
        <h1 className="mt-1 text-2xl font-bold text-primary">Mi Álbum</h1>
        <p className="mt-2 text-sm text-secondary">Tus encuentros con la naturaleza</p>
      </section>

      <section className="grid grid-cols-2 gap-3" aria-label="Estadísticas del álbum">
        <AlbumStat value={photos.length} label="Fotografías propias" />
        <AlbumStat value={albums.length} label="Especies fotografiadas" />
      </section>

      {albums.length ? (
        <section>
          <div className="mb-3 flex items-center gap-2">
            <Images size={19} className="text-accent" aria-hidden="true" />
            <h2 className="text-lg font-bold text-primary">Álbumes por especie</h2>
          </div>
          <div className="grid grid-cols-2 gap-3">
            {albums.map((album) => (
              <button
                key={album.species.id}
                type="button"
                onClick={() => setSelectedSpeciesId(album.species.id)}
                className="min-w-0 overflow-hidden rounded-lg border border-line bg-card text-left shadow-panel transition active:scale-[.98]"
              >
                <ObservationImage discovery={album.photos[0]} fallback={album.species.image} alt="" className="aspect-square w-full object-cover" />
                <div className="p-3">
                  <h3 className="truncate text-sm font-bold text-primary">{album.species.commonName}</h3>
                  <p className="mt-1 text-xs font-semibold text-accent-secondary">{album.photos.length} {album.photos.length === 1 ? "fotografía" : "fotografías"}</p>
                  <p className="mt-1 text-[11px] text-secondary">Última: {dateFormatter.format(new Date(album.latestAt))}</p>
                </div>
              </button>
            ))}
          </div>
        </section>
      ) : (
        <section className="topographic rounded-lg bg-brand-deep p-6 text-center text-brand-cream">
          <Images size={34} className="mx-auto text-brand-leaf" aria-hidden="true" />
          <h2 className="mt-4 text-xl font-bold">Tu álbum todavía está vacío</h2>
          <p className="mx-auto mt-2 max-w-xs text-sm leading-6 text-brand-cream/75">Salí a explorar y guardá tus primeros encuentros con animales.</p>
          <button type="button" onClick={() => onNavigate("descubrir")} className="mt-5 min-h-12 w-full rounded-lg bg-brand-leaf px-4 font-bold text-brand-deep">
            Descubrir un animal
          </button>
        </section>
      )}
    </div>
  );
}

type SpeciesAlbumViewProps = {
  album: ReturnType<typeof buildSpeciesAlbums>[number];
  allDiscoveries: Discovery[];
  viewerId?: string;
  detailSpecies?: Species;
  onBack: () => void;
  onOpenViewer: (id: string) => void;
  onCloseViewer: () => void;
  onEditDiscovery: AlbumPageProps["onEditDiscovery"];
  onOpenSpecies: (species: Species) => void;
  onCloseSpecies: () => void;
};

function SpeciesAlbumView({ album, allDiscoveries, viewerId, detailSpecies, onBack, onOpenViewer, onCloseViewer, onEditDiscovery, onOpenSpecies, onCloseSpecies }: SpeciesAlbumViewProps) {
  const [variantFilter, setVariantFilter] = useState("all");
  const variantIds = registeredVariantIds(album.photos);
  const hasUnspecified = album.photos.some((item) => !item.variantId);
  const filteredPhotos = album.photos.filter((item) => variantFilter === "all"
    || (variantFilter === "none" ? !item.variantId : item.variantId === variantFilter));
  const currentIndex = Math.max(0, filteredPhotos.findIndex((item) => item.id === viewerId));
  const currentPhoto = viewerId ? filteredPhotos[currentIndex] : undefined;

  useEffect(() => {
    if (variantFilter !== "all" && !variantIds.includes(variantFilter) && variantFilter !== "none") setVariantFilter("all");
  }, [variantFilter, variantIds]);

  return (
    <div className="space-y-5 pb-24">
      <button type="button" onClick={onBack} className="inline-flex min-h-11 items-center gap-2 text-sm font-bold text-primary">
        <ArrowLeft size={18} aria-hidden="true" /> Mi Álbum
      </button>
      <section>
        <p className="text-xs font-bold uppercase text-accent-secondary">Álbum por especie</p>
        <h1 className="mt-1 text-2xl font-bold text-primary">{album.species.commonName}</h1>
        <p className="mt-1 text-sm italic text-secondary">{album.species.scientificName}</p>
        <p className="mt-3 text-sm font-semibold text-primary">{album.photos.length} {album.photos.length === 1 ? "fotografía" : "fotografías"}</p>
      </section>

      {(variantIds.length || hasUnspecified) ? (
        <div className="mobile-scroll flex gap-2 overflow-x-auto pb-1" role="group" aria-label="Filtrar por variante">
          <FilterButton active={variantFilter === "all"} onClick={() => setVariantFilter("all")}>Todos</FilterButton>
          {variantIds.map((id) => {
            const variant = album.species.variants?.find((item) => item.id === id);
            return variant ? <FilterButton key={id} active={variantFilter === id} onClick={() => setVariantFilter(id)}>{variant.name}</FilterButton> : null;
          })}
          {hasUnspecified ? <FilterButton active={variantFilter === "none"} onClick={() => setVariantFilter("none")}>Sin especificar</FilterButton> : null}
        </div>
      ) : null}

      <section className="grid grid-cols-2 gap-2" aria-label={`Fotografías de ${album.species.commonName}`}>
        {filteredPhotos.map((item) => (
          <button key={item.id} type="button" onClick={() => onOpenViewer(item.id)} className="relative aspect-square overflow-hidden rounded-lg bg-soft">
            <ObservationImage discovery={item} fallback={album.species.image} alt={`${album.species.commonName}, ${dateFormatter.format(new Date(item.discoveredAt))}`} className="h-full w-full object-cover transition active:scale-105" />
            {item.customName ? <span className="absolute inset-x-2 bottom-2 truncate rounded bg-brand-deep/80 px-2 py-1 text-left text-xs font-bold text-brand-cream">{item.customName}</span> : null}
          </button>
        ))}
      </section>

      {currentPhoto ? (
        <PhotoViewer
          species={album.species}
          observation={currentPhoto}
          index={currentIndex}
          total={filteredPhotos.length}
          onClose={onCloseViewer}
          onPrevious={() => onOpenViewer(filteredPhotos[currentIndex - 1].id)}
          onNext={() => onOpenViewer(filteredPhotos[currentIndex + 1].id)}
          onEditDiscovery={onEditDiscovery}
          onOpenSpecies={() => onOpenSpecies(album.species)}
        />
      ) : null}
      {detailSpecies ? <SpeciesDetail species={detailSpecies} discoveries={allDiscoveries.filter((item) => item.speciesId === detailSpecies.id)} onClose={onCloseSpecies} /> : null}
    </div>
  );
}

function PhotoViewer({ species, observation, index, total, onClose, onPrevious, onNext, onEditDiscovery, onOpenSpecies }: {
  species: Species;
  observation: Discovery;
  index: number;
  total: number;
  onClose: () => void;
  onPrevious: () => void;
  onNext: () => void;
  onEditDiscovery: AlbumPageProps["onEditDiscovery"];
  onOpenSpecies: () => void;
}) {
  const [customName, setCustomName] = useState(observation.customName ?? "");
  const [notes, setNotes] = useState(observation.notes ?? "");

  useEffect(() => {
    setCustomName(observation.customName ?? "");
    setNotes(observation.notes ?? "");
  }, [observation]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
      if (event.key === "ArrowLeft" && index > 0) onPrevious();
      if (event.key === "ArrowRight" && index < total - 1) onNext();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [index, total, onClose, onPrevious, onNext]);

  const phoneRoot = document.getElementById("phone-root");
  if (!phoneRoot) return null;
  const variant = species.variants?.find((item) => item.id === observation.variantId);

  return createPortal(
    <div className="absolute inset-0 z-50 flex flex-col bg-brand-deep text-brand-cream" role="dialog" aria-modal="true" aria-label={`Fotografía de ${species.commonName}`}>
      <div className="flex shrink-0 items-center justify-between px-4 py-3">
        <span className="text-xs font-semibold text-brand-cream/70">{index + 1} de {total}</span>
        <button type="button" onClick={onClose} className="grid h-11 w-11 place-items-center rounded-lg bg-brand-cream/10" aria-label="Cerrar visor" title="Cerrar visor"><X size={20} /></button>
      </div>
      <div className="relative grid min-h-0 flex-1 place-items-center bg-black/35">
        <ObservationImage discovery={observation} fallback={species.image} alt={species.commonName} className="max-h-full max-w-full object-contain" />
        <button type="button" onClick={onPrevious} disabled={index === 0} className="absolute left-2 grid h-11 w-11 place-items-center rounded-lg bg-brand-deep/75 disabled:opacity-25" aria-label="Fotografía anterior"><ChevronLeft size={24} /></button>
        <button type="button" onClick={onNext} disabled={index === total - 1} className="absolute right-2 grid h-11 w-11 place-items-center rounded-lg bg-brand-deep/75 disabled:opacity-25" aria-label="Fotografía siguiente"><ChevronRight size={24} /></button>
      </div>
      <div className="mobile-scroll max-h-[48%] shrink-0 space-y-4 overflow-y-auto border-t border-brand-cream/15 p-4 pb-[max(20px,env(safe-area-inset-bottom))]">
        <div>
          <h2 className="text-xl font-bold">{species.commonName}</h2>
          <p className="text-sm italic text-brand-cream/65">{species.scientificName}</p>
          <p className="mt-2 text-xs text-brand-cream/70">{variant ? `${variant.name} · ` : ""}{dateTimeFormatter.format(new Date(observation.discoveredAt))}</p>
        </div>
        <div className="grid gap-3">
          <label className="text-xs font-bold text-brand-leaf">Nombre personalizado
            <input value={customName} onChange={(event) => setCustomName(event.target.value)} maxLength={60} placeholder="Ej. Michi" className="mt-2 min-h-11 w-full rounded-lg border border-brand-cream/20 bg-brand-cream/10 px-3 text-sm font-normal text-brand-cream placeholder:text-brand-cream/40" />
          </label>
          <label className="text-xs font-bold text-brand-leaf">Nota de la observación
            <textarea value={notes} onChange={(event) => setNotes(event.target.value)} maxLength={240} rows={2} placeholder="¿Qué recordás de este encuentro?" className="mt-2 w-full resize-none rounded-lg border border-brand-cream/20 bg-brand-cream/10 p-3 text-sm font-normal text-brand-cream placeholder:text-brand-cream/40" />
          </label>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <button type="button" onClick={() => onEditDiscovery(observation.id, { customName, notes })} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-brand-leaf px-3 text-sm font-bold text-brand-deep"><Pencil size={16} /> Guardar</button>
          <button type="button" onClick={onOpenSpecies} className="min-h-11 rounded-lg border border-brand-cream/25 px-3 text-sm font-bold">Ver ficha</button>
        </div>
      </div>
    </div>,
    phoneRoot,
  );
}

function AlbumStat({ value, label }: { value: number; label: string }) {
  return <div className="rounded-lg border border-line bg-card p-4"><strong className="text-2xl text-primary">{value}</strong><p className="mt-1 text-xs leading-5 text-secondary">{label}</p></div>;
}

function FilterButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: string }) {
  return <button type="button" onClick={onClick} aria-pressed={active} className={`min-h-10 shrink-0 rounded-lg px-3 text-xs font-bold ${active ? "bg-accent text-on-accent" : "bg-soft text-secondary"}`}>{children}</button>;
}
