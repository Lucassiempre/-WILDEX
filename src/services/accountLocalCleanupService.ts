import { clearNativeCaptureDraft } from "./nativeCaptureSession";
import { removeInitialSyncCheckpointsForUser } from "./initialSyncCheckpointService";
import {
  listStorageV3Namespaces,
  namespaceForAccount,
  photoReferencesForNamespace,
  removeAccountNamespaceV3,
  type StorageLike,
} from "./localStorageV3Service";
import { removeAccountPhotoData } from "./photoStorageService";
import { removePhotoOutbox } from "./photoSyncService";

export type AccountCleanupResult = { warnings: string[] };

type CleanupDependencies = {
  storage?: StorageLike;
  removePhotos?: (userId: string, exclusiveReferences: Iterable<string>, protectedReferences: Iterable<string>) => Promise<void>;
  clearCapture?: () => void;
};

export const cleanupAccountLocalData = async (
  userId: string,
  dependencies: CleanupDependencies = {},
): Promise<AccountCleanupResult> => {
  const storage = dependencies.storage ?? localStorage;
  const accountNamespace = namespaceForAccount(userId);
  const accountReferences = photoReferencesForNamespace(accountNamespace, storage);
  const protectedReferences = new Set<string>();

  for (const namespace of listStorageV3Namespaces(storage)) {
    if (namespace === accountNamespace) continue;
    for (const reference of photoReferencesForNamespace(namespace, storage)) protectedReferences.add(reference);
  }

  const exclusiveReferences = [...accountReferences].filter((reference) => !protectedReferences.has(reference));
  const warnings: string[] = [];
  try {
    await (dependencies.removePhotos ?? removeAccountPhotoData)(userId, exclusiveReferences, protectedReferences);
  } catch {
    warnings.push("No se pudo limpiar por completo el caché local de fotografías.");
  }

  removeInitialSyncCheckpointsForUser(userId, storage);
  removePhotoOutbox(userId, storage);
  removeAccountNamespaceV3(userId, storage);
  (dependencies.clearCapture ?? clearNativeCaptureDraft)();

  return { warnings };
};
