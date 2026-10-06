import { Camera, CameraResultType, CameraSource, MediaTypeSelection, type MediaResult } from "@capacitor/camera";
import { Capacitor } from "@capacitor/core";
import { Filesystem } from "@capacitor/filesystem";
import type { NativePhotoSource } from "./nativeCaptureSession";
import { logNativeCapture } from "./nativeCaptureDiagnostics";

export type { NativePhotoSource } from "./nativeCaptureSession";

export type NativeCapturedPhoto = {
  dataUrl: string;
  fileName: string;
};

type CameraMediaResult = MediaResult & {
  path?: string;
  format?: string;
};

export const isNativeApp = () => Capacitor.isNativePlatform();

const normalizedFormat = (value?: string) => {
  const format = value?.toLowerCase();
  if (format === "jpg") return "jpeg";
  return format === "png" || format === "gif" || format === "webp" ? format : "jpeg";
};

const blobToBase64 = (blob: Blob) => new Promise<string>((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(String(reader.result).split(",")[1] ?? "");
  reader.onerror = () => reject(reader.error ?? new Error("No se pudo leer la fotografía."));
  reader.readAsDataURL(blob);
});

const errorDetails = (error: unknown) => {
  const value = error as { code?: unknown; message?: unknown } | undefined;
  return {
    code: typeof value?.code === "string" ? value.code : undefined,
    message: typeof value?.message === "string" ? value.message : String(error),
  };
};

export const mediaResultSummary = (result: unknown) => {
  const media = result && typeof result === "object" ? result as CameraMediaResult : undefined;
  const uri = media?.uri ?? media?.path;
  return {
    hasResult: Boolean(media),
    uri,
    webPath: media?.webPath,
    hasWebPath: Boolean(media?.webPath),
    hasThumbnail: Boolean(media?.thumbnail),
    format: media?.metadata?.format ?? media?.format,
  };
};

export const mediaResultToNativePhoto = async (result: unknown, source: NativePhotoSource): Promise<NativeCapturedPhoto> => {
  if (!result || typeof result !== "object") throw new Error("La cámara no devolvió una fotografía válida.");
  const media = result as CameraMediaResult;
  const uri = media.uri ?? media.path;
  const format = normalizedFormat(media.metadata?.format ?? media.format);
  let base64: string | undefined;

  logNativeCapture("media-result-received", { source, ...mediaResultSummary(media) });

  const readUri = async () => {
    if (!uri) return;
    try {
      logNativeCapture("media-read-uri-start", { source, uri });
      const file = await Filesystem.readFile({ path: uri });
      base64 = typeof file.data === "string" ? file.data : await blobToBase64(file.data);
      logNativeCapture("media-read-uri-success", { source, bytes: base64.length });
    } catch (error) {
      logNativeCapture("media-read-uri-failed", { source, uri, ...errorDetails(error) }, "warn");
    }
  };

  // Keep the already validated gallery path unchanged; camera files prefer the
  // WebView-safe URL because some Android camera apps return private temp paths.
  if (source === "gallery") await readUri();

  if (!base64 && media.webPath) {
    try {
      logNativeCapture("media-read-webpath-start", { source, webPath: media.webPath });
      const response = await fetch(media.webPath);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      base64 = await blobToBase64(await response.blob());
      logNativeCapture("media-read-webpath-success", { source, bytes: base64.length });
    } catch (error) {
      logNativeCapture("media-read-webpath-failed", { source, ...errorDetails(error) }, "warn");
    }
  }

  if (!base64 && uri) {
    await readUri();
  }

  if (!base64 && media.thumbnail) {
    base64 = media.thumbnail;
    logNativeCapture("media-read-thumbnail-success", { source, bytes: base64.length });
  }

  if (!base64) {
    logNativeCapture("media-read-exhausted", { source, ...mediaResultSummary(media) }, "error");
    throw new Error("La cámara devolvió una fotografía, pero no se pudo leer su archivo temporal.");
  }
  logNativeCapture("media-conversion-success", { source, format, bytes: base64.length });
  return {
    dataUrl: `data:image/${format};base64,${base64}`,
    fileName: source === "camera" ? "captura-android.jpg" : "galeria-android.jpg",
  };
};

export const getNativePhoto = async (
  source: NativePhotoSource,
  onResult?: (result: unknown) => void,
): Promise<NativeCapturedPhoto> => {
  const commonOptions = {
    quality: 72,
    targetWidth: 900,
    targetHeight: 900,
    correctOrientation: true,
    editable: "no" as const,
    includeMetadata: true,
  };

  logNativeCapture("native-picker-opening", { source });
  let result: unknown;
  try {
    result = source === "camera"
      ? await Camera.getPhoto({
        quality: commonOptions.quality,
        width: commonOptions.targetWidth,
        height: commonOptions.targetHeight,
        correctOrientation: commonOptions.correctOrientation,
        allowEditing: false,
        saveToGallery: false,
        source: CameraSource.Camera,
        resultType: CameraResultType.Uri,
      })
      : (await Camera.chooseFromGallery({
        ...commonOptions,
        mediaType: MediaTypeSelection.Photo,
        allowMultipleSelection: false,
        limit: 1,
      })).results[0];
  } catch (error) {
    logNativeCapture("native-picker-rejected", { source, ...errorDetails(error) }, "warn");
    throw error;
  }

  logNativeCapture("native-picker-result", { source, ...mediaResultSummary(result) });
  onResult?.(result);
  return mediaResultToNativePhoto(result, source);
};
