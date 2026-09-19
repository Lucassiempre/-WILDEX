import { Binoculars } from "lucide-react";
import { useEffect, useState } from "react";
import { Navigation } from "./components/Navigation";
import { Toast } from "./components/Toast";
import { species } from "./data/species";
import { HomePage } from "./pages/HomePage";
import { DiscoverPage } from "./pages/DiscoverPage";
import { CollectionPage } from "./pages/CollectionPage";
import { ProfilePage } from "./pages/ProfilePage";
import { loadExplorerState, saveExplorerState } from "./services/storageService";
import type { ExplorerState, Species, View } from "./types";

type ToastState = {
  message: string;
  tone?: "success" | "info";
};

function App() {
  const [view, setView] = useState<View>("inicio");
  const [explorerState, setExplorerState] = useState<ExplorerState>(() => loadExplorerState());
  const [toast, setToast] = useState<ToastState>();

  useEffect(() => {
    saveExplorerState(explorerState);
  }, [explorerState]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(undefined), 3600);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const addDiscovery = (selectedSpecies: Species) => {
    const alreadyDiscovered = explorerState.discoveries.some((discovery) => discovery.speciesId === selectedSpecies.id);

    if (alreadyDiscovered) {
      setToast({ message: `${selectedSpecies.commonName} ya estaba en tu colección. No se suma XP repetida.`, tone: "info" });
      setView("coleccion");
      return;
    }

    const isFirstDiscovery = explorerState.discoveries.length === 0;
    const hasCategoryBonus = explorerState.awardedCategoryBonuses.includes(selectedSpecies.category);
    const xpAwarded = (isFirstDiscovery ? 100 : 50) + (hasCategoryBonus ? 0 : 75);

    setExplorerState((current) => ({
      discoveries: [...current.discoveries, { speciesId: selectedSpecies.id, discoveredAt: new Date().toISOString() }],
      xp: current.xp + xpAwarded,
      awardedCategoryBonuses: hasCategoryBonus
        ? current.awardedCategoryBonuses
        : [...current.awardedCategoryBonuses, selectedSpecies.category],
    }));
    setToast({ message: `${selectedSpecies.commonName} guardado. +${xpAwarded} XP`, tone: "success" });
    setView("coleccion");
  };

  return (
    <div className="h-dvh overflow-hidden bg-forest text-ink md:grid md:place-items-center md:bg-[radial-gradient(circle_at_top_left,_rgba(216,169,66,.22),_transparent_34%),radial-gradient(circle_at_bottom_right,_rgba(173,188,159,.18),_transparent_32%),#12372A] md:p-6">
      <div className="relative flex h-full w-full flex-col overflow-hidden bg-paper shadow-glow md:h-[min(900px,calc(100vh-2rem))] md:max-w-[430px] md:rounded-[2.5rem] md:border-[10px] md:border-ink">
        <div className="hidden h-7 shrink-0 items-center justify-center bg-ink md:flex">
          <div className="h-1.5 w-20 rounded-full bg-white/20" />
        </div>
        <header className="z-20 flex shrink-0 items-center justify-between border-b border-forest/10 bg-paper/90 px-5 py-4 backdrop-blur">
          <div className="flex items-center gap-3">
            <div className="grid h-10 w-10 place-items-center rounded-2xl bg-forest text-gold shadow-sm">
              <Binoculars size={20} aria-hidden="true" />
            </div>
            <div>
              <p className="text-xs font-black uppercase tracking-[0.24em] text-canopy">WILDEX</p>
              <p className="text-xs font-semibold text-forest/55">Prototipo Android</p>
            </div>
          </div>
          <span className="rounded-full bg-gold/25 px-3 py-1 text-xs font-black text-forest">
            Demo
          </span>
        </header>
        <Navigation currentView={view} onNavigate={setView} />
        <main className="mobile-scroll relative z-10 min-h-0 flex-1 overflow-y-auto px-4 py-5">
          {view === "inicio" ? <HomePage state={explorerState} onNavigate={setView} /> : null}
          {view === "descubrir" ? <DiscoverPage onAddDiscovery={addDiscovery} /> : null}
          {view === "coleccion" ? <CollectionPage discoveries={explorerState.discoveries} /> : null}
          {view === "perfil" ? <ProfilePage state={explorerState} /> : null}
        </main>
        <div className="pointer-events-none absolute inset-x-4 bottom-[5.9rem] z-20 rounded-full border border-forest/10 bg-white/90 px-4 py-2 text-center text-[11px] font-bold text-forest/65 shadow-sm backdrop-blur">
          Base demo: {species.length} especies reales · sin IA conectada
        </div>
        {toast ? <Toast message={toast.message} tone={toast.tone} /> : null}
      </div>
    </div>
  );
}

export default App;
