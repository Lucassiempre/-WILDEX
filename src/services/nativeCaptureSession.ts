export type NativePhotoSource = "camera" | "gallery";

export type NativeCaptureDraft = {
  source: NativePhotoSource;
  demoSpeciesId: string;
  notes: string;
  requestedAt: string;
  requestId?: string;
  result?: PersistedMediaResult;
  resultReceivedAt?: string;
  lastError?: string;
};

export type PersistedMediaResult = {
  uri?: string;
  webPath?: string;
  thumbnail?: string;
  metadata?: { format?: string };
};

export type RestoredPluginResult = {
  pluginId: string;
  methodName: string;
  success: boolean;
  data?: unknown;
  error?: { message?: string };
};

const CAPTURE_KEY = "wildex-native-capture-v1";
const CAPTURE_TTL_MS = 60 * 60 * 1000;
const CAMERA_METHODS = new Set(["takePhoto", "chooseFromGallery", "getPhoto"]);
const CANCEL_CODES = new Set(["OS-PLUG-CAMR-0006", "OS-PLUG-CAMR-0020"]);
const LEGACY_CANCEL_MESSAGES = new Set(["User cancelled photos app"]);

const parseMediaResult = (result: unknown): PersistedMediaResult | undefined => {
  if (!result || typeof result !== "object") return undefined;
  const value = result as { uri?: unknown; path?: unknown; webPath?: unknown; thumbnail?: unknown; format?: unknown; metadata?: { format?: unknown } };
  const parsed: PersistedMediaResult = {
    uri: typeof value.uri === "string" ? value.uri : typeof value.path === "string" ? value.path : undefined,
    webPath: typeof value.webPath === "string" ? value.webPath : undefined,
    thumbnail: typeof value.thumbnail === "string" && value.thumbnail.length <= 500_000 ? value.thumbnail : undefined,
    metadata: typeof value.metadata?.format === "string"
      ? { format: value.metadata.format }
      : typeof value.format === "string" ? { format: value.format } : undefined,
  };
  return parsed.uri || parsed.webPath || parsed.thumbnail ? parsed : undefined;
};

export const saveNativeCaptureDraft = (draft: NativeCaptureDraft): boolean => {
  try {
    localStorage.setItem(CAPTURE_KEY, JSON.stringify(draft));
    return true;
  } catch {
    return false;
  }
};

export const loadNativeCaptureDraft = (now = new Date()): NativeCaptureDraft | undefined => {
  try {
    const raw = localStorage.getItem(CAPTURE_KEY);
    if (!raw) return undefined;
    const value = JSON.parse(raw) as Partial<NativeCaptureDraft>;
    const requestedAt = typeof value.requestedAt === "string" ? Date.parse(value.requestedAt) : Number.NaN;
    if ((value.source !== "camera" && value.source !== "gallery") || !Number.isFinite(requestedAt) || now.getTime() - requestedAt > CAPTURE_TTL_MS) {
      localStorage.removeItem(CAPTURE_KEY);
      return undefined;
    }
    return {
      source: value.source,
      demoSpeciesId: typeof value.demoSpeciesId === "string" ? value.demoSpeciesId : "",
      notes: typeof value.notes === "string" ? value.notes.slice(0, 240) : "",
      requestedAt: new Date(requestedAt).toISOString(),
      requestId: typeof value.requestId === "string" ? value.requestId : undefined,
      result: parseMediaResult(value.result),
      resultReceivedAt: typeof value.resultReceivedAt === "string" ? value.resultReceivedAt : undefined,
      lastError: typeof value.lastError === "string" ? value.lastError : undefined,
    };
  } catch {
    return undefined;
  }
};

export const rememberNativeCaptureResult = (result: unknown, receivedAt = new Date()): boolean => {
  const draft = loadNativeCaptureDraft(receivedAt);
  const parsed = parseMediaResult(result);
  if (!draft || !parsed) return false;
  return saveNativeCaptureDraft({
    ...draft,
    result: parsed,
    resultReceivedAt: receivedAt.toISOString(),
    lastError: undefined,
  });
};

export const rememberNativeCaptureError = (error: unknown): boolean => {
  const draft = loadNativeCaptureDraft();
  if (!draft) return false;
  const value = error as { code?: unknown; message?: unknown } | undefined;
  const code = typeof value?.code === "string" ? `${value.code}: ` : "";
  const message = typeof value?.message === "string" ? value.message : String(error);
  return saveNativeCaptureDraft({ ...draft, lastError: `${code}${message}`.slice(0, 500) });
};

export const clearNativeCaptureDraft = () => {
  try {
    localStorage.removeItem(CAPTURE_KEY);
  } catch {
    // Storage can be unavailable; the native result can still continue in memory.
  }
};

export const isCameraRestoredResult = (event: RestoredPluginResult) =>
  event.pluginId === "Camera" && CAMERA_METHODS.has(event.methodName);

export const restoredMediaResult = (event: RestoredPluginResult): unknown => {
  if (!event.success || !event.data) return undefined;
  if (event.methodName === "chooseFromGallery") {
    const results = (event.data as { results?: unknown[] }).results;
    return Array.isArray(results) ? results[0] : undefined;
  }
  return event.data;
};

export const isNativeCaptureCancellation = (error: unknown) => {
  const value = error as { code?: unknown; message?: unknown } | undefined;
  if (typeof value?.code === "string" && CANCEL_CODES.has(value.code)) return true;
  return typeof value?.message === "string" && LEGACY_CANCEL_MESSAGES.has(value.message.trim());
};
