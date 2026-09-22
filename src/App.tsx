import { Moon, Sun } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { BrandIcon } from "./components/BrandIcon";
import { Navigation } from "./components/Navigation";
import { Toast } from "./components/Toast";
import { DiscoveryMoment, type DiscoveryMomentData } from "./components/DiscoveryMoment";
import { species } from "./data/species";
import { useTheme } from "./hooks/useTheme";
import { HomePage } from "./pages/HomePage";
import { DiscoverPage } from "./pages/DiscoverPage";
import { CollectionPage } from "./pages/CollectionPage";
import { ProfilePage } from "./pages/ProfilePage";
import { loadExplorerState, saveExplorerState } from "./services/storageService";
import type { DiscoveryInput, ExplorerState, View } from "./types";
import { discoveredSpeciesCount } from "./utils/gamification";

type ToastState = {
  message: string;
  tone?: "success" | "info";
};

function App() {
  const [view, setView] = useState<View>("inicio");
  const [explorerState, setExplorerState] = useState<ExplorerState>(() => loadExplorerState());
  const [toast, setToast] = useState<ToastState>();
  const [moment, setMoment] = useState<DiscoveryMomentData>();
  const { theme, toggleTheme } = useTheme();
  const mainRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (mainRef.current) mainRef.current.scrollTop = 0;
  }, [view]);

  useEffect(() => {
    if (!saveExplorerState(explorerState)) setToast({ message: "No hay espacio para guardar la bitácora. Liberá almacenamiento e intentá de nuevo.", tone: "info" });
  }, [explorerState]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(undefined), 3600);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const addDiscovery = ({ species: selectedSpecies, variantId, photo, notes, identificationMethod }: DiscoveryInput) => {
    const alreadyDiscovered = explorerState.discoveries.some((discovery) => discovery.speciesId === selectedSpecies.id);
    const variant = selectedSpecies.variants?.find((item) => item.id === variantId);
    const newVariant = Boolean(variant && !explorerState.discoveries.some((item) => item.speciesId === selectedSpecies.id && item.variantId === variant.id));

    const isFirstDiscovery = explorerState.discoveries.length === 0;
    const hasCategoryBonus = explorerState.awardedCategoryBonuses.includes(selectedSpecies.category);
    const xpAwarded = (alreadyDiscovered ? 0 : (isFirstDiscovery ? 100 : 50) + (hasCategoryBonus ? 0 : 75)) + (newVariant ? 20 : 0);

    const next: ExplorerState = {
      discoveries: [...explorerState.discoveries, { id: crypto.randomUUID(), speciesId: selectedSpecies.id, variantId: variant?.id, discoveredAt: new Date().toISOString(), photo, notes: notes?.trim() || undefined, identificationMethod }],
      xp: explorerState.xp + xpAwarded,
      awardedCategoryBonuses: hasCategoryBonus
        ? explorerState.awardedCategoryBonuses
        : [...explorerState.awardedCategoryBonuses, selectedSpecies.category],
    };
    if (!saveExplorerState(next)) {
      setToast({ message: "No se pudo guardar. Probá con otra foto o liberá almacenamiento.", tone: "info" });
      return;
    }
    setExplorerState(next);
    setMoment({ species: selectedSpecies, photo, kind: !alreadyDiscovered ? "species" : newVariant ? "variant" : "observation", xp: xpAwarded, count: discoveredSpeciesCount(next.discoveries), total: species.length });
    setView("coleccion");
  };

  return (
    <div className="phone-surround h-dvh overflow-hidden text-primary md:grid md:place-items-center md:p-5">
      <div id="phone-root" className="relative flex h-full w-full flex-col overflow-hidden bg-base shadow-phone md:h-[min(900px,calc(100dvh-2.5rem))] md:max-w-[430px] md:rounded-[2.25rem] md:border-[8px] md:border-brand-deep">
        <div className="hidden h-6 shrink-0 items-center justify-center bg-brand-deep md:flex">
          <div className="h-1 w-16 rounded-full bg-brand-cream/25" />
        </div>
        <header className="z-20 flex shrink-0 items-center justify-between border-b border-line bg-surface px-4 py-3">
          <div className="flex min-w-0 items-center gap-3">
            <BrandIcon decorative className="h-11 w-11 shrink-0" />
            <div className="min-w-0">
              <p className="text-sm font-black text-primary">WILDEX</p>
              <p className="text-[11px] font-medium text-secondary">Bitácora de exploración</p>
            </div>
          </div>
          <button
            type="button"
            onClick={toggleTheme}
            className="grid h-11 w-11 shrink-0 place-items-center rounded-lg border border-line bg-soft text-accent transition active:scale-95"
            aria-label={theme === "light" ? "Activar modo oscuro" : "Activar modo claro"}
            title={theme === "light" ? "Modo oscuro" : "Modo claro"}
          >
            {theme === "light" ? <Moon size={20} aria-hidden="true" /> : <Sun size={20} aria-hidden="true" />}
          </button>
        </header>
        <Navigation currentView={view} onNavigate={setView} />
        <main ref={mainRef} className="mobile-scroll relative z-10 min-h-0 flex-1 overflow-y-auto px-4 py-5">
          {view === "inicio" ? <HomePage state={explorerState} onNavigate={setView} /> : null}
          {view === "descubrir" ? <DiscoverPage onAddDiscovery={addDiscovery} /> : null}
          {view === "coleccion" ? <CollectionPage discoveries={explorerState.discoveries} /> : null}
          {view === "perfil" ? <ProfilePage state={explorerState} /> : null}
        </main>
        {toast ? <Toast message={toast.message} tone={toast.tone} /> : null}
        {moment ? <DiscoveryMoment data={moment} onClose={() => setMoment(undefined)} /> : null}
      </div>
    </div>
  );
}

export default App;
