import { Moon, Sun } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { App as CapacitorApp } from "@capacitor/app";
import { BrandIcon } from "./components/BrandIcon";
import { Navigation } from "./components/Navigation";
import { Toast } from "./components/Toast";
import { DiscoveryMoment, type DiscoveryMomentData } from "./components/DiscoveryMoment";
import { species } from "./data/species";
import { useTheme } from "./hooks/useTheme";
import { useNativeShell } from "./hooks/useNativeShell";
import { HomePage } from "./pages/HomePage";
import { DiscoverPage } from "./pages/DiscoverPage";
import { CollectionPage } from "./pages/CollectionPage";
import { ProfilePage } from "./pages/ProfilePage";
import { AlbumPage } from "./pages/AlbumPage";
import { migrateAndHydratePhotos, storeObservationPhoto } from "./services/photoStorageService";
import {
  applyPhotoSyncMetadata,
  bindCaptureToNamespace,
  captureForNamespace,
  consumeCapture,
  isNamespaceStable,
  reconcileHydratedExplorerState,
  type NamespaceBoundCapture,
} from "./services/appStateCoordinator";
import { isNativeApp, mediaResultSummary, mediaResultToNativePhoto, type NativeCapturedPhoto } from "./services/nativeCameraService";
import {
  clearNativeCaptureDraft,
  isCameraRestoredResult,
  isNativeCaptureCancellation,
  loadNativeCaptureDraft,
  rememberNativeCaptureError,
  rememberNativeCaptureResult,
  restoredMediaResult,
} from "./services/nativeCaptureSession";
import { logNativeCapture } from "./services/nativeCaptureDiagnostics";
import { createDiscoveryUpdate, updateDiscoveryDetails } from "./services/discoveryService";
import { localChallengeCatalogService } from "./services/challengeCatalogService";
import { claimChallengeReward } from "./services/challengeService";
import {
  ensureStorageV3Namespace,
  hasAnonymousProgressV3,
  initializeLocalStorageV3,
  loadExplorerProfileV3,
  loadExplorerStateV3,
  namespaceForAccount,
  saveExplorerProfileV3,
  saveExplorerStateV3,
} from "./services/localStorageV3Service";
import type { DiscoveryDetails } from "./services/discoveryService";
import type { DiscoveryInput, ExplorerProfile, ExplorerState, View, WeeklyChallengeDefinition } from "./types";
import { discoveredSpeciesCount } from "./utils/gamification";
import { useAuth } from "./auth/AuthProvider";
import type { ProgressLinkViewModel } from "./components/AuthAccountPanel";
import {
  inspectAnonymousProgressImport,
  linkAnonymousProgress,
  loadAnonymousImportSource,
  type InitialSyncProgress,
  type ProfileResolution,
} from "./services/initialSyncService";
import { syncObservationPhotos, type PhotoSyncProgress } from "./services/photoSyncService";
import type { InitialSyncCheckpoint } from "./services/initialSyncCheckpointService";

type ToastState = {
  message: string;
  tone?: "success" | "info";
};

type RestoredNativeCapture = NativeCapturedPhoto & {
  token: string;
  demoSpeciesId: string;
  notes: string;
};

type ProgressLinkState = Pick<ProgressLinkViewModel, "busy" | "resumable" | "completed" | "profileConflict" | "error"> & {
  progress?: InitialSyncProgress;
};

type PhotoSyncState = PhotoSyncProgress & { busy: boolean };

function App() {
  const { user, status: authStatus } = useAuth();
  const [storageContext] = useState(() => initializeLocalStorageV3());
  const activeNamespace = useMemo(
    () => user?.id ? namespaceForAccount(user.id) : storageContext.anonymousNamespace,
    [storageContext.anonymousNamespace, user?.id],
  );
  const [view, setView] = useState<View>(() => loadNativeCaptureDraft() ? "descubrir" : "inicio");
  const [explorerState, setExplorerState] = useState<ExplorerState>(() => loadExplorerStateV3(storageContext.anonymousNamespace));
  const [toast, setToast] = useState<ToastState>();
  const [moment, setMoment] = useState<DiscoveryMomentData>();
  const [albumSpeciesId, setAlbumSpeciesId] = useState<string>();
  const [weeklyChallenges, setWeeklyChallenges] = useState<WeeklyChallengeDefinition[]>([]);
  const [profile, setProfile] = useState<ExplorerProfile>(() => loadExplorerProfileV3(storageContext.anonymousNamespace));
  const [loadedNamespace, setLoadedNamespace] = useState(activeNamespace);
  const [restoredNativeCapture, setRestoredNativeCapture] = useState<NamespaceBoundCapture<RestoredNativeCapture>>();
  const [progressLinkState, setProgressLinkState] = useState<ProgressLinkState>({ busy: false, resumable: false, completed: false, profileConflict: false });
  const [photoSyncState, setPhotoSyncState] = useState<PhotoSyncState>({ busy: false, current: 0, total: 0, failed: 0 });
  const { theme, toggleTheme } = useTheme();
  const mainRef = useRef<HTMLElement>(null);
  const activeNamespaceRef = useRef(activeNamespace);
  const progressLinkRunning = useRef(false);
  activeNamespaceRef.current = activeNamespace;

  const runPhotoSync = useCallback(async (userId: string, checkpoint: InitialSyncCheckpoint) => {
    setPhotoSyncState((current) => ({ ...current, busy: true }));
    try {
      const result = await syncObservationPhotos({
        userId,
        checkpoint,
        onProgress: (progress) => setPhotoSyncState({ ...progress, busy: true }),
      });
      const message = result.failed
        ? "Tu progreso está vinculado, pero algunas fotos todavía no pudieron sincronizarse. Wildex volverá a intentarlo."
        : result.total
          ? "Fotografías sincronizadas correctamente."
          : undefined;
      setPhotoSyncState({ busy: false, current: result.completed, total: result.total, failed: result.failed, message });

      if (activeNamespaceRef.current === namespaceForAccount(userId) && result.completed) {
        setExplorerState((current) => {
          const completed = new Map(result.outbox.items
            .filter((item) => item.stage === "complete" && item.remotePath && item.mimeType && item.sizeBytes && item.sha256)
            .map((item) => [item.observationId, {
              path: item.remotePath!,
              mimeType: item.mimeType!,
              sizeBytes: item.sizeBytes!,
              sha256: item.sha256!,
            }]));
          const next = applyPhotoSyncMetadata(current, completed);
          saveExplorerStateV3(namespaceForAccount(userId), next);
          return next;
        });
      }
      return result;
    } catch {
      setPhotoSyncState((current) => ({
        ...current,
        busy: false,
        failed: Math.max(1, current.failed),
        message: "Tu progreso está vinculado, pero algunas fotos todavía no pudieron sincronizarse. Wildex volverá a intentarlo.",
      }));
      return undefined;
    }
  }, []);

  useEffect(() => {
    if (mainRef.current) mainRef.current.scrollTop = 0;
  }, [view]);

  useEffect(() => {
    if (!storageContext.migrationComplete) {
      setToast({ message: "No se pudo completar el almacenamiento local. Tus datos anteriores siguen intactos.", tone: "info" });
    }
  }, [storageContext.migrationComplete]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(undefined), 3600);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const authInitialized = authStatus !== "initializing";
  const namespaceStable = isNamespaceStable(authStatus, loadedNamespace, activeNamespace);

  useEffect(() => {
    if (!namespaceStable) return;
    setRestoredNativeCapture((current) => bindCaptureToNamespace(current, namespaceStable, activeNamespace));
  }, [activeNamespace, namespaceStable]);

  useEffect(() => {
    let active = true;
    localChallengeCatalogService.listWeeklyChallenges().then((items) => {
      if (active) setWeeklyChallenges(items);
    });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!isNativeApp()) return;
    let active = true;
    let removeListener: (() => Promise<void>) | undefined;
    let processingResult = false;
    let completedResultKey: string | undefined;

    const processReturnedPhoto = async (
      result: unknown,
      source: "camera" | "gallery",
      channel: "restored" | "pending-retry",
    ) => {
      const summary = mediaResultSummary(result);
      const resultKey = `${summary.uri ?? ""}|${summary.webPath ?? ""}|${summary.hasThumbnail}`;
      if (completedResultKey === resultKey) {
        logNativeCapture("result-duplicate-ignored", { source, channel, reason: "already-completed" }, "warn");
        return;
      }
      if (processingResult) {
        logNativeCapture("result-duplicate-ignored", { source, channel, reason: "already-processing" }, "warn");
        return;
      }
      processingResult = true;
      const draft = loadNativeCaptureDraft();
      rememberNativeCaptureResult(result);
      logNativeCapture("result-processing-start", { source, channel, requestId: draft?.requestId });
      try {
        const photo = await mediaResultToNativePhoto(result, source);
        if (!active) return;
        setRestoredNativeCapture({
          ...photo,
          token: draft?.requestId ?? crypto.randomUUID(),
          demoSpeciesId: draft?.demoSpeciesId ?? "",
          notes: draft?.notes ?? "",
        });
        completedResultKey = resultKey;
        clearNativeCaptureDraft();
        logNativeCapture("result-applied-to-discover", { source, channel, requestId: draft?.requestId });
      } catch (error) {
        rememberNativeCaptureError(error);
        logNativeCapture("result-processing-failed", {
          source,
          channel,
          message: error instanceof Error ? error.message : String(error),
        }, "error");
        if (active) setToast({ message: "La cámara devolvió la foto, pero Android no permitió leerla. Revisá el registro WildexCapture.", tone: "info" });
      } finally {
        processingResult = false;
      }
    };

    void CapacitorApp.addListener("appRestoredResult", async (event) => {
      if (!isCameraRestoredResult(event)) return;
      const draft = loadNativeCaptureDraft();
      const source = draft?.source ?? (event.methodName === "chooseFromGallery" ? "gallery" : "camera");
      logNativeCapture("app-restored-result", {
        source,
        methodName: event.methodName,
        success: event.success,
        requestId: draft?.requestId,
      });
      setAlbumSpeciesId(undefined);
      setView("descubrir");

      if (!event.success) {
        if (isNativeCaptureCancellation(event.error)) {
          clearNativeCaptureDraft();
          logNativeCapture("capture-cancelled-restored", { source, methodName: event.methodName });
        } else {
          rememberNativeCaptureError(event.error);
          logNativeCapture("capture-error-restored", { source, methodName: event.methodName, error: event.error }, "error");
          setToast({ message: "Android no pudo recuperar la fotografía. Intentá nuevamente.", tone: "info" });
        }
        return;
      }

      await processReturnedPhoto(restoredMediaResult(event), source, "restored");
    }).then((handle) => {
      if (!active) void handle.remove();
      else removeListener = () => handle.remove();
    });

    const pendingRetry = window.setTimeout(() => {
      const draft = loadNativeCaptureDraft();
      if (!draft?.result) return;
      setView("descubrir");
      logNativeCapture("pending-result-retry", { source: draft.source, requestId: draft.requestId });
      void processReturnedPhoto(draft.result, draft.source, "pending-retry");
    }, 750);

    return () => {
      active = false;
      window.clearTimeout(pendingRetry);
      if (removeListener) void removeListener();
    };
  }, []);

  useEffect(() => {
    if (!authInitialized) return;
    let active = true;
    ensureStorageV3Namespace(activeNamespace);
    const namespaceState = loadExplorerStateV3(activeNamespace);
    setExplorerState(namespaceState);
    setProfile(loadExplorerProfileV3(activeNamespace));
    setLoadedNamespace(activeNamespace);
    setAlbumSpeciesId(undefined);
    setMoment(undefined);

    void migrateAndHydratePhotos(namespaceState).then((result) => {
      if (!active || activeNamespaceRef.current !== activeNamespace) return;
      setExplorerState((current) => {
        const next = reconcileHydratedExplorerState(namespaceState, result.state, current);
        if (result.migrated > 0) saveExplorerStateV3(activeNamespace, next);
        return next;
      });
      if (result.failed > 0) setToast({ message: "Algunas fotos antiguas siguen usando el almacenamiento anterior, pero no se borraron.", tone: "info" });
    });
    return () => { active = false; };
  }, [activeNamespace, authInitialized]);

  useEffect(() => {
    let active = true;
    if (!user?.id || !hasAnonymousProgressV3(storageContext)) {
      setProgressLinkState({ busy: false, resumable: false, completed: false, profileConflict: false });
      return () => { active = false; };
    }
    const source = loadAnonymousImportSource(storageContext.datasetId);
    void inspectAnonymousProgressImport({
      datasetId: storageContext.datasetId,
      userId: user.id,
      state: source.state,
      profile: source.profile,
    }).then(({ checkpoint }) => {
      if (!active) return;
      setProgressLinkState({
        busy: false,
        resumable: Boolean(checkpoint && checkpoint.status !== "complete"),
        completed: checkpoint?.status === "complete",
        profileConflict: checkpoint?.status === "profile-conflict",
        error: checkpoint?.status === "failed" ? "No pudimos terminar la vinculación. Tu progreso sigue guardado en este dispositivo y podés continuar más tarde." : undefined,
      });
      if (checkpoint?.status === "complete") void runPhotoSync(user.id, checkpoint);
    }).catch(() => {
      if (active) setProgressLinkState({ busy: false, resumable: false, completed: false, profileConflict: false, error: "No se pudo revisar el avance guardado." });
    });
    return () => { active = false; };
  }, [runPhotoSync, storageContext, user?.id]);

  useEffect(() => {
    if (!user?.id) return;
    const retry = () => {
      const source = loadAnonymousImportSource(storageContext.datasetId);
      void inspectAnonymousProgressImport({
        datasetId: storageContext.datasetId,
        userId: user.id,
        state: source.state,
        profile: source.profile,
      }).then(({ checkpoint }) => {
        if (checkpoint?.status === "complete") void runPhotoSync(user.id, checkpoint);
      });
    };
    window.addEventListener("online", retry);
    return () => window.removeEventListener("online", retry);
  }, [runPhotoSync, storageContext.datasetId, user?.id]);

  const runProgressLink = useCallback(async (profileResolution?: ProfileResolution) => {
    if (!user?.id || progressLinkRunning.current) return;
    progressLinkRunning.current = true;
    const userId = user.id;
    setProgressLinkState((current) => ({ ...current, busy: true, error: undefined, profileConflict: false }));
    const source = loadAnonymousImportSource(storageContext.datasetId);
    try {
      const result = await linkAnonymousProgress({
        userId,
        datasetId: storageContext.datasetId,
        anonymousState: source.state,
        anonymousProfile: source.profile,
        profileResolution,
        onProgress: (progress) => setProgressLinkState((current) => ({ ...current, progress, error: undefined })),
      });
      if (result.kind === "complete" && result.state && result.profile && activeNamespaceRef.current === namespaceForAccount(userId)) {
        setExplorerState(result.state);
        setProfile(result.profile);
        setLoadedNamespace(namespaceForAccount(userId));
        setProgressLinkState({ busy: false, resumable: false, completed: true, profileConflict: false, progress: { stage: "complete", message: "Progreso vinculado correctamente" } });
        setToast({ message: "Progreso vinculado correctamente.", tone: "success" });
        void runPhotoSync(userId, result.checkpoint);
      } else if (result.kind === "profile-conflict") {
        setProgressLinkState((current) => ({ ...current, busy: false, resumable: true, completed: false, profileConflict: true, error: undefined }));
      } else {
        setProgressLinkState((current) => ({
          ...current,
          busy: false,
          resumable: true,
          completed: false,
          profileConflict: false,
          error: result.kind === "observation-conflict"
            ? result.message
            : "No pudimos terminar la vinculación. Tu progreso sigue guardado en este dispositivo y podés continuar más tarde.",
        }));
      }
    } finally {
      progressLinkRunning.current = false;
      setProgressLinkState((current) => ({ ...current, busy: false }));
    }
  }, [runPhotoSync, storageContext.datasetId, user?.id]);

  const addDiscovery = async ({ species: selectedSpecies, variantId, photo, notes, identificationMethod }: DiscoveryInput) => {
    if (loadedNamespace !== activeNamespace) return false;
    const discoveryId = crypto.randomUUID();
    let photoRef: string | undefined;
    if (photo) {
      logNativeCapture("observation-photo-save-start", { discoveryId, speciesId: selectedSpecies.id, bytes: photo.length });
      try {
        photoRef = await storeObservationPhoto(discoveryId, photo);
        logNativeCapture("observation-photo-save-success", { discoveryId, speciesId: selectedSpecies.id, photoRef });
      } catch (error) {
        logNativeCapture("observation-photo-save-failed", {
          discoveryId,
          speciesId: selectedSpecies.id,
          message: error instanceof Error ? error.message : String(error),
        }, "error");
        setToast({ message: "No se pudo guardar la fotografía en el dispositivo. La observación no fue modificada.", tone: "info" });
        return false;
      }
    }
    const update = createDiscoveryUpdate(explorerState, { species: selectedSpecies, variantId, photoRef, photo, notes, identificationMethod }, { id: discoveryId });
    if (!saveExplorerStateV3(activeNamespace, update.state)) {
      logNativeCapture("observation-state-save-failed", { discoveryId, speciesId: selectedSpecies.id }, "error");
      setToast({ message: "No se pudo guardar. Probá con otra foto o liberá almacenamiento.", tone: "info" });
      return false;
    }
    logNativeCapture("observation-save-success", { discoveryId, speciesId: selectedSpecies.id, photoRef, xp: update.xpAwarded });
    setExplorerState(update.state);
    const variantName = selectedSpecies.variants?.find((item) => item.id === update.discovery.variantId)?.name;
    setMoment({ species: selectedSpecies, photo, variantName, kind: update.kind, xp: update.xpAwarded, count: discoveredSpeciesCount(update.state.discoveries), total: species.length });
    setView("coleccion");
    logNativeCapture("navigation-after-save", { destination: "coleccion", discoveryId });
    return true;
  };

  const navigate = (nextView: View) => {
    setAlbumSpeciesId(undefined);
    setView(nextView);
  };

  const openSpeciesAlbum = (speciesId: string) => {
    setAlbumSpeciesId(speciesId);
    setView("album");
  };

  const editDiscovery = (discoveryId: string, details: DiscoveryDetails) => {
    if (loadedNamespace !== activeNamespace) return false;
    const next = updateDiscoveryDetails(explorerState, discoveryId, details);
    if (!saveExplorerStateV3(activeNamespace, next)) {
      setToast({ message: "No se pudieron guardar los cambios. Liberá almacenamiento e intentá de nuevo.", tone: "info" });
      return false;
    }
    setExplorerState(next);
    setToast({ message: "Datos de la fotografía actualizados.", tone: "success" });
    return true;
  };

  const claimChallenge = (challengeId: string) => {
    if (loadedNamespace !== activeNamespace) return;
    const result = claimChallengeReward(explorerState, challengeId, weeklyChallenges);
    if (!result.claimed) return;
    if (!saveExplorerStateV3(activeNamespace, result.state)) {
      setToast({ message: "No se pudo guardar la recompensa. Liberá almacenamiento e intentá de nuevo.", tone: "info" });
      return;
    }
    setExplorerState(result.state);
    setToast({ message: `Recompensa reclamada: +${result.xpAwarded} XP.`, tone: "success" });
  };

  const updateProfile = (nextProfile: ExplorerProfile) => {
    if (loadedNamespace !== activeNamespace) return false;
    if (!saveExplorerProfileV3(activeNamespace, nextProfile)) {
      setToast({ message: "No se pudo guardar el perfil. Liberá almacenamiento e intentá de nuevo.", tone: "info" });
      return false;
    }
    setProfile(nextProfile);
    setToast({ message: "Perfil actualizado.", tone: "success" });
    return true;
  };

  const deliverableNativeCapture = captureForNamespace(restoredNativeCapture, namespaceStable, activeNamespace);
  const consumeRestoredNativeCapture = useCallback((token: string) => {
    setRestoredNativeCapture((current) => consumeCapture(current, token, activeNamespace));
  }, [activeNamespace]);

  useNativeShell(theme, () => {
    if (moment) {
      setMoment(undefined);
      return true;
    }
    if (view !== "inicio") {
      navigate("inicio");
      return true;
    }
    return false;
  });

  const anonymousProgressPending = Boolean(user) && hasAnonymousProgressV3(storageContext) && !progressLinkState.completed;
  const progressLink: ProgressLinkViewModel | undefined = user ? {
    available: anonymousProgressPending,
    ...progressLinkState,
    onStart: () => void runProgressLink(),
    onResolveProfile: (resolution) => void runProgressLink(resolution),
    photoSync: photoSyncState,
  } : undefined;

  return (
    <div className="phone-surround h-dvh overflow-hidden text-primary md:grid md:place-items-center md:p-5">
      <div id="phone-root" className="relative flex h-full w-full flex-col overflow-hidden bg-base shadow-phone md:h-[min(900px,calc(100dvh-2.5rem))] md:max-w-[430px] md:rounded-[2.25rem] md:border-[8px] md:border-brand-deep">
        <div className="hidden h-6 shrink-0 items-center justify-center bg-brand-deep md:flex">
          <div className="h-1 w-16 rounded-full bg-brand-cream/25" />
        </div>
        <header className="app-header z-20 flex shrink-0 items-center justify-between border-b border-line bg-surface px-4 pb-3 pt-3">
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
        <Navigation currentView={view} onNavigate={navigate} />
        <main ref={mainRef} className="mobile-scroll relative z-10 min-h-0 flex-1 overflow-y-auto px-4 py-5">
          {!namespaceStable ? <p className="py-12 text-center text-sm font-semibold text-secondary" role="status">Abriendo tu espacio local...</p> : null}
          {namespaceStable && view === "inicio" ? <HomePage state={explorerState} displayName={profile.displayName} onNavigate={navigate} /> : null}
          {namespaceStable && view === "descubrir" ? (
            <DiscoverPage
              onAddDiscovery={addDiscovery}
              restoredNativePhoto={deliverableNativeCapture}
              onConsumeRestoredNativePhoto={consumeRestoredNativeCapture}
            />
          ) : null}
          {namespaceStable && view === "coleccion" ? <CollectionPage discoveries={explorerState.discoveries} onOpenAlbum={openSpeciesAlbum} /> : null}
          {namespaceStable && view === "album" ? <AlbumPage discoveries={explorerState.discoveries} initialSpeciesId={albumSpeciesId} onNavigate={navigate} onEditDiscovery={editDiscovery} /> : null}
          {namespaceStable && view === "perfil" ? <ProfilePage state={explorerState} profile={profile} weeklyChallenges={weeklyChallenges} anonymousProgressPending={anonymousProgressPending} progressLink={progressLink} onSaveProfile={updateProfile} onClaimChallenge={claimChallenge} /> : null}
        </main>
        {toast ? <Toast message={toast.message} tone={toast.tone} /> : null}
        {moment ? <DiscoveryMoment data={moment} onClose={() => setMoment(undefined)} /> : null}
      </div>
    </div>
  );
}

export default App;
