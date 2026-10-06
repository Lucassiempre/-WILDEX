import { Capacitor } from "@capacitor/core";
import { Directory, Filesystem } from "@capacitor/filesystem";
import type { Discovery, ExplorerState } from "../types";

const DATABASE_NAME = "wildex-media-v1";
const STORE_NAME = "photos";
const PHOTO_DIRECTORY = "observation-photos";
const REMOTE_CACHE_DIRECTORY = "observation-photo-cache";
const objectUrls = new Map<string, string>();

type PhotoMigrationResult = {
  state: ExplorerState;
  migrated: number;
  failed: number;
};

const photoPath = (discoveryId: string) => `${PHOTO_DIRECTORY}/${discoveryId}.jpg`;
const nativeRef = (discoveryId: string) => `filesystem:${photoPath(discoveryId)}`;
const webRef = (discoveryId: string) => `indexeddb:${discoveryId}`;

const dataUrlParts = (dataUrl: string) => {
  const match = /^data:([^;,]+);base64,(.+)$/.exec(dataUrl);
  if (!match) throw new Error("La fotografía no tiene un formato compatible.");
  return { mimeType: match[1], base64: match[2] };
};

const dataUrlToBlob = (dataUrl: string) => {
  const { mimeType, base64 } = dataUrlParts(dataUrl);
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return new Blob([bytes], { type: mimeType });
};

const base64ToBytes = (base64: string) => {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
};

const bytesToBase64 = (bytes: Uint8Array) => {
  let binary = "";
  const chunkSize = 0x8000;
  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
  }
  return btoa(binary);
};

const openPhotoDatabase = () => new Promise<IDBDatabase>((resolve, reject) => {
  const request = indexedDB.open(DATABASE_NAME, 1);
  request.onupgradeneeded = () => {
    if (!request.result.objectStoreNames.contains(STORE_NAME)) request.result.createObjectStore(STORE_NAME);
  };
  request.onsuccess = () => resolve(request.result);
  request.onerror = () => reject(request.error ?? new Error("No se pudo abrir el almacenamiento de fotos."));
});

const putWebPhoto = async (reference: string, dataUrl: string) => {
  await putWebPhotoBlob(reference, dataUrlToBlob(dataUrl));
};

const putWebPhotoBlob = async (reference: string, blob: Blob) => {
  const database = await openPhotoDatabase();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(STORE_NAME, "readwrite");
      transaction.objectStore(STORE_NAME).put(blob, reference);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error ?? new Error("No se pudo guardar la fotografía."));
      transaction.onabort = () => reject(transaction.error ?? new Error("Se interrumpió el guardado de la fotografía."));
    });
  } finally {
    database.close();
  }
};

const getWebPhoto = async (reference: string): Promise<Blob | undefined> => {
  const database = await openPhotoDatabase();
  try {
    return await new Promise<Blob | undefined>((resolve, reject) => {
      const request = database.transaction(STORE_NAME, "readonly").objectStore(STORE_NAME).get(reference);
      request.onsuccess = () => resolve(request.result instanceof Blob ? request.result : undefined);
      request.onerror = () => reject(request.error ?? new Error("No se pudo leer la fotografía."));
    });
  } finally {
    database.close();
  }
};

const deleteWebPhotos = async (references: string[]) => {
  if (!references.length) return;
  const database = await openPhotoDatabase();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(STORE_NAME, "readwrite");
      const store = transaction.objectStore(STORE_NAME);
      references.forEach((reference) => store.delete(reference));
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error ?? new Error("No se pudieron eliminar las fotografías locales."));
      transaction.onabort = () => reject(transaction.error ?? new Error("Se interrumpió la limpieza de fotografías."));
    });
  } finally {
    database.close();
  }
};

const ensureNativeDirectory = async () => {
  try {
    await Filesystem.mkdir({ path: PHOTO_DIRECTORY, directory: Directory.Data, recursive: true });
  } catch {
    // The private app directory may already exist.
  }
};

export const storeObservationPhoto = async (discoveryId: string, dataUrl: string): Promise<string> => {
  if (Capacitor.isNativePlatform()) {
    const path = photoPath(discoveryId);
    const { base64 } = dataUrlParts(dataUrl);
    await ensureNativeDirectory();
    await Filesystem.writeFile({ path, data: base64, directory: Directory.Data, recursive: true });
    const stored = await Filesystem.stat({ path, directory: Directory.Data });
    if (!stored.size) throw new Error("La fotografía nativa quedó vacía.");
    return nativeRef(discoveryId);
  }

  const reference = webRef(discoveryId);
  await putWebPhoto(reference, dataUrl);
  const stored = await getWebPhoto(reference);
  if (!stored?.size) throw new Error("La fotografía web quedó vacía.");
  return reference;
};

export const resolveObservationPhoto = async (reference: string): Promise<string | undefined> => {
  const cached = objectUrls.get(reference);
  if (cached) return cached;

  if (reference.startsWith("filesystem:")) {
    const path = reference.slice("filesystem:".length);
    const stat = await Filesystem.stat({ path, directory: Directory.Data });
    if (!stat.size) return undefined;
    try {
      const result = await Filesystem.readFile({ path, directory: Directory.Data });
      const base64 = typeof result.data === "string"
        ? result.data
        : bytesToBase64(new Uint8Array(await result.data.arrayBuffer()));
      const mimeType = path.endsWith(".png") ? "image/png" : path.endsWith(".webp") ? "image/webp" : "image/jpeg";
      const dataUrl = `data:${mimeType};base64,${base64}`;
      objectUrls.set(reference, dataUrl);
      return dataUrl;
    } catch {
      const result = await Filesystem.getUri({ path, directory: Directory.Data });
      return Capacitor.convertFileSrc(result.uri);
    }
  }

  if (reference.startsWith("indexeddb:")) {
    const blob = await getWebPhoto(reference);
    if (!blob) return undefined;
    const url = URL.createObjectURL(blob);
    objectUrls.set(reference, url);
    return url;
  }

  return undefined;
};

export const readObservationPhotoBytes = async (reference: string): Promise<Uint8Array | undefined> => {
  if (reference.startsWith("filesystem:")) {
    const path = reference.slice("filesystem:".length);
    const result = await Filesystem.readFile({ path, directory: Directory.Data });
    if (typeof result.data === "string") return base64ToBytes(result.data);
    return new Uint8Array(await result.data.arrayBuffer());
  }

  if (reference.startsWith("indexeddb:")) {
    const blob = await getWebPhoto(reference.slice("indexeddb:".length));
    return blob ? new Uint8Array(await blob.arrayBuffer()) : undefined;
  }

  return undefined;
};

export const cacheRemoteObservationPhoto = async ({
  userId,
  observationId,
  sha256,
  extension,
  mimeType,
  bytes,
}: {
  userId: string;
  observationId: string;
  sha256: string;
  extension: "jpg" | "png" | "webp";
  mimeType: string;
  bytes: Uint8Array;
}): Promise<string> => {
  const reference = remoteObservationPhotoCacheRef({ userId, observationId, sha256, extension });
  if (Capacitor.isNativePlatform()) {
    const path = reference.slice("filesystem:".length);
    await Filesystem.writeFile({ path, data: bytesToBase64(bytes), directory: Directory.Data, recursive: true });
    return reference;
  }

  const key = reference.slice("indexeddb:".length);
  await putWebPhotoBlob(key, new Blob([Uint8Array.from(bytes).buffer], { type: mimeType }));
  return reference;
};

export const remoteObservationPhotoCacheRef = ({
  userId,
  observationId,
  sha256,
  extension,
}: {
  userId: string;
  observationId: string;
  sha256: string;
  extension: "jpg" | "png" | "webp";
}) => Capacitor.isNativePlatform()
  ? `filesystem:${REMOTE_CACHE_DIRECTORY}/${userId}/${observationId}/${sha256}.${extension}`
  : `indexeddb:remote:${userId}:${observationId}:${sha256}`;

export const removeAccountPhotoData = async (
  userId: string,
  exclusiveReferences: Iterable<string>,
  protectedReferences: Iterable<string> = [],
) => {
  const references = [...new Set(exclusiveReferences)];
  const protectedSet = new Set(protectedReferences);
  for (const reference of references) objectUrls.delete(reference);

  if (Capacitor.isNativePlatform()) {
    for (const reference of references.filter((value) => value.startsWith("filesystem:"))) {
      try {
        await Filesystem.deleteFile({ path: reference.slice("filesystem:".length), directory: Directory.Data });
      } catch {
        // Missing files are already in the desired state.
      }
    }
    const removeCacheTree = async (directory: string): Promise<void> => {
      let entries;
      try {
        entries = (await Filesystem.readdir({ path: directory, directory: Directory.Data })).files;
      } catch {
        return;
      }
      for (const entry of entries) {
        const path = `${directory}/${entry.name}`;
        if (entry.type === "directory") await removeCacheTree(path);
        else if (!protectedSet.has(`filesystem:${path}`)) {
          try { await Filesystem.deleteFile({ path, directory: Directory.Data }); } catch { /* Already absent. */ }
        }
      }
      try { await Filesystem.rmdir({ path: directory, directory: Directory.Data }); } catch { /* Protected files keep it non-empty. */ }
    };
    await removeCacheTree(`${REMOTE_CACHE_DIRECTORY}/${userId}`);
    return;
  }

  const accountReferences = references
    .filter((value) => value.startsWith("indexeddb:"))
    .map((value) => value.slice("indexeddb:".length));
  const remotePrefix = `remote:${userId}:`;
  const database = await openPhotoDatabase();
  try {
    const remoteKeys = await new Promise<string[]>((resolve, reject) => {
      const keys: string[] = [];
      const request = database.transaction(STORE_NAME, "readonly").objectStore(STORE_NAME).openKeyCursor();
      request.onsuccess = () => {
        const cursor = request.result;
        if (!cursor) return resolve(keys);
        if (typeof cursor.key === "string" && cursor.key.startsWith(remotePrefix) && !protectedSet.has(`indexeddb:${cursor.key}`)) keys.push(cursor.key);
        cursor.continue();
      };
      request.onerror = () => reject(request.error ?? new Error("No se pudo revisar el caché de fotografías."));
    });
    await deleteWebPhotos([...accountReferences, ...remoteKeys]);
  } finally {
    database.close();
  }
};

const migrateDiscoveryPhoto = async (discovery: Discovery) => {
  let next = discovery;
  let migrated = false;

  if (!discovery.photoRef && discovery.photo?.startsWith("data:image/")) {
    const photoRef = await storeObservationPhoto(discovery.id, discovery.photo);
    next = { ...discovery, photoRef };
    migrated = true;
  }

  if (next.photoRef) {
    const resolved = await resolveObservationPhoto(next.photoRef);
    if (resolved) next = { ...next, photo: resolved };
  }

  return { discovery: next, migrated };
};

export const migrateAndHydratePhotos = async (state: ExplorerState): Promise<PhotoMigrationResult> => {
  const discoveries: Discovery[] = [];
  let migrated = 0;
  let failed = 0;

  for (const discovery of state.discoveries) {
    try {
      const result = await migrateDiscoveryPhoto(discovery);
      discoveries.push(result.discovery);
      if (result.migrated) migrated += 1;
    } catch {
      discoveries.push(discovery);
      failed += 1;
    }
  }

  return { state: { ...state, discoveries }, migrated, failed };
};
