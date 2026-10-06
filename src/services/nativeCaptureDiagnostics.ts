export type NativeCaptureDiagnosticLevel = "info" | "warn" | "error";

export type NativeCaptureDiagnostic = {
  at: string;
  event: string;
  level: NativeCaptureDiagnosticLevel;
  details?: Record<string, unknown>;
};

const DIAGNOSTICS_KEY = "wildex-native-capture-diagnostics-v1";
const MAX_ENTRIES = 60;

const safeDetails = (details?: Record<string, unknown>) => {
  if (!details) return undefined;
  return Object.fromEntries(Object.entries(details).map(([key, value]) => {
    if (typeof value === "string" && value.startsWith("data:")) return [key, `[data-url ${value.length} chars]`];
    return [key, value];
  }));
};

export const readNativeCaptureDiagnostics = (): NativeCaptureDiagnostic[] => {
  try {
    const value = JSON.parse(localStorage.getItem(DIAGNOSTICS_KEY) ?? "[]");
    return Array.isArray(value) ? value.slice(-MAX_ENTRIES) : [];
  } catch {
    return [];
  }
};

export const logNativeCapture = (
  event: string,
  details?: Record<string, unknown>,
  level: NativeCaptureDiagnosticLevel = "info",
) => {
  const entry: NativeCaptureDiagnostic = {
    at: new Date().toISOString(),
    event,
    level,
    details: safeDetails(details),
  };
  const method = level === "error" ? console.error : level === "warn" ? console.warn : console.info;
  method(`[WildexCapture] ${event}`, entry.details ?? {});
  try {
    localStorage.setItem(DIAGNOSTICS_KEY, JSON.stringify([...readNativeCaptureDiagnostics(), entry].slice(-MAX_ENTRIES)));
  } catch {
    // Logcat/DevTools still receives the entry when local storage is unavailable.
  }
};

