import type { AuthStatus } from "../auth/AuthProvider";
import type { Discovery, ExplorerState, RemotePhotoMetadata } from "../types";

export type NamespaceBoundCapture<T extends { token: string }> = T & {
  targetNamespace?: string;
};

export const isNamespaceStable = (
  authStatus: AuthStatus,
  loadedNamespace: string,
  activeNamespace: string,
) => authStatus !== "initializing" && loadedNamespace === activeNamespace;

export const bindCaptureToNamespace = <T extends { token: string }>(
  capture: NamespaceBoundCapture<T> | undefined,
  namespaceStable: boolean,
  activeNamespace: string,
): NamespaceBoundCapture<T> | undefined => {
  if (!capture || capture.targetNamespace || !namespaceStable) return capture;
  return { ...capture, targetNamespace: activeNamespace };
};

export const captureForNamespace = <T extends { token: string }>(
  capture: NamespaceBoundCapture<T> | undefined,
  namespaceStable: boolean,
  activeNamespace: string,
) => namespaceStable && capture?.targetNamespace === activeNamespace ? capture : undefined;

export const consumeCapture = <T extends { token: string }>(
  capture: NamespaceBoundCapture<T> | undefined,
  token: string,
  activeNamespace: string,
) => capture?.token === token && capture.targetNamespace === activeNamespace ? undefined : capture;

export const isCaptureApplied = (preview: string | undefined, savedPhoto: string | undefined, dataUrl: string) => (
  preview === dataUrl && savedPhoto === dataUrl
);

const sameRemotePhoto = (left?: RemotePhotoMetadata, right?: RemotePhotoMetadata) => (
  left === right || (
    left?.path === right?.path
    && left?.mimeType === right?.mimeType
    && left?.sizeBytes === right?.sizeBytes
    && left?.sha256 === right?.sha256
  )
);

const reconcilePhotoFields = (baseline: Discovery, hydrated: Discovery, current: Discovery): Discovery => ({
  ...current,
  photo: current.photo === baseline.photo ? hydrated.photo : current.photo,
  photoRef: current.photoRef === baseline.photoRef ? hydrated.photoRef : current.photoRef,
  remotePhoto: sameRemotePhoto(current.remotePhoto, baseline.remotePhoto) ? hydrated.remotePhoto : current.remotePhoto,
});

export const reconcileHydratedExplorerState = (
  baseline: ExplorerState,
  hydrated: ExplorerState,
  current: ExplorerState,
): ExplorerState => {
  const baselineById = new Map(baseline.discoveries.map((discovery) => [discovery.id, discovery]));
  const hydratedById = new Map(hydrated.discoveries.map((discovery) => [discovery.id, discovery]));
  return {
    ...current,
    discoveries: current.discoveries.map((discovery) => {
      const baselineDiscovery = baselineById.get(discovery.id);
      const hydratedDiscovery = hydratedById.get(discovery.id);
      return baselineDiscovery && hydratedDiscovery
        ? reconcilePhotoFields(baselineDiscovery, hydratedDiscovery, discovery)
        : discovery;
    }),
  };
};

export const applyPhotoSyncMetadata = (
  current: ExplorerState,
  completed: ReadonlyMap<string, RemotePhotoMetadata>,
): ExplorerState => ({
  ...current,
  discoveries: current.discoveries.map((discovery) => ({
    ...discovery,
    remotePhoto: completed.get(discovery.id) ?? discovery.remotePhoto,
  })),
});
