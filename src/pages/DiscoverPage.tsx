import { Camera, ImagePlus, Loader2, RotateCcw, ScanLine, ShieldAlert, Sparkles, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { species } from "../data/species";
import { SpeciesDetail } from "../components/SpeciesDetail";
import { AnimalImage } from "../components/AnimalImage";
import { preparePhoto } from "../services/photoService";
import { identifySpecies } from "../services/recognitionService";
import type { AnalysisResult, DiscoveryInput } from "../types";

type DiscoverPageProps = {
  onAddDiscovery: (input: DiscoveryInput) => void;
};

export function DiscoverPage({ onAddDiscovery }: DiscoverPageProps) {
  const [preview, setPreview] = useState<string>();
  const [savedPhoto, setSavedPhoto] = useState<string>();
  const [photoError, setPhotoError] = useState<string>();
  const [preparingPhoto, setPreparingPhoto] = useState(false);
  const [showDetail, setShowDetail] = useState(false);
  const [notes, setNotes] = useState("");
  const [fileName, setFileName] = useState<string>();
  const [demoSpeciesId, setDemoSpeciesId] = useState("");
  const [cameraActive, setCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState<string>();
  const [analyzing, setAnalyzing] = useState(false);
  const [result, setResult] = useState<AnalysisResult>();
  const [variantId, setVariantId] = useState("");
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const objectUrlRef = useRef<string | null>(null);

  useEffect(() => {
    if (cameraActive && videoRef.current && streamRef.current) {
      videoRef.current.srcObject = streamRef.current;
    }
  }, [cameraActive]);

  useEffect(() => () => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
  }, []);

  const stopCamera = () => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    setCameraActive(false);
  };

  const releaseObjectUrl = () => {
    if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
    objectUrlRef.current = null;
  };

  const startCamera = async () => {
    setCameraError(undefined);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
      releaseObjectUrl();
      setPreview(undefined);
      setSavedPhoto(undefined);
      setFileName(undefined);
      setResult(undefined);
      streamRef.current = stream;
      setCameraActive(true);
    } catch {
      setCameraError("No se pudo activar la cámara. Puedes subir una imagen para continuar.");
    }
  };

  const capturePhoto = () => {
    const video = videoRef.current;
    if (!video || !video.videoWidth) return;
    const canvas = document.createElement("canvas");
    const scale = Math.min(1, 900 / Math.max(video.videoWidth, video.videoHeight));
    canvas.width = Math.round(video.videoWidth * scale);
    canvas.height = Math.round(video.videoHeight * scale);
    canvas.getContext("2d")?.drawImage(video, 0, 0, canvas.width, canvas.height);
    releaseObjectUrl();
    const captured = canvas.toDataURL("image/jpeg", 0.72);
    setPreview(captured);
    setSavedPhoto(captured);
    setFileName("captura-camara-demo.jpg");
    stopCamera();
    setResult(undefined);
  };

  const handleFile = async (file?: File) => {
    if (!file) return;
    stopCamera();
    releaseObjectUrl();
    setPhotoError(undefined);
    setPreview(undefined);
    setSavedPhoto(undefined);
    setResult(undefined);
    setPreparingPhoto(true);
    try {
      const prepared = await preparePhoto(file);
      setPreview(prepared);
      setSavedPhoto(prepared);
      setFileName(file.name);
    } catch (error) {
      setPhotoError(error instanceof Error ? error.message : "No se pudo abrir la imagen.");
      setResult({ status: "invalid-image", mode: "demo", analyzedAt: new Date().toISOString(), message: "La imagen no es válida o no pudo abrirse. Probá con otro archivo." });
    } finally {
      setPreparingPhoto(false);
    }
  };

  const clearImage = () => {
    releaseObjectUrl();
    setPreview(undefined);
    setSavedPhoto(undefined);
    setPhotoError(undefined);
    setFileName(undefined);
    setResult(undefined);
  };

  const identify = async () => {
    if (!preview) return;
    setAnalyzing(true);
    setResult(undefined);
    try {
      setResult(await identifySpecies({ fileName, demoSpeciesId }));
      setVariantId("");
    } catch {
      setResult({ status: "connection-error", mode: "demo", analyzedAt: new Date().toISOString(), message: "El servicio de demostración no respondió. Intentá nuevamente." });
    } finally {
      setAnalyzing(false);
    }
  };

  return (
    <div className="space-y-6 pb-24">
      <section>
        <p className="text-xs font-bold uppercase text-accent-secondary">Descubrir</p>
        <h1 className="mt-1 text-2xl font-bold text-primary">Identificar especie</h1>
        <p className="mt-2 text-sm leading-6 text-secondary">Captura una fotografía o elige una imagen de tu dispositivo.</p>
      </section>

      <section className="overflow-hidden rounded-lg border border-line bg-surface shadow-panel">
        <div className="relative aspect-[4/3] overflow-hidden bg-brand-deep">
          {preview ? (
            <img src={preview} alt="Imagen seleccionada" className="h-full w-full object-cover" />
          ) : cameraActive ? (
            <video ref={videoRef} autoPlay playsInline muted className="h-full w-full object-cover" />
          ) : (
            <div className="topographic grid h-full place-items-center text-center text-brand-cream">
              <div>
                <ScanLine size={38} className="mx-auto text-brand-leaf" aria-hidden="true" />
                <p className="mt-3 text-sm font-medium">La imagen aparecerá aquí</p>
              </div>
            </div>
          )}
          {analyzing ? (
            <div className="absolute inset-0 grid place-items-center bg-brand-deep/85 text-brand-cream">
              <div className="absolute inset-x-0 h-20 animate-scan bg-gradient-to-b from-transparent via-brand-leaf/30 to-transparent" />
              <div className="relative text-center">
                <Loader2 size={30} className="mx-auto animate-spin text-brand-leaf" aria-hidden="true" />
                <p className="mt-3 text-sm font-semibold">Analizando imagen demo...</p>
              </div>
            </div>
          ) : null}
        </div>
        <div className="space-y-3 p-4">
          {cameraError ? <p className="rounded-lg bg-danger/10 p-3 text-sm text-danger" role="alert">{cameraError}</p> : null}
          {photoError ? <p className="rounded-lg bg-danger/10 p-3 text-sm text-danger" role="alert">{photoError}</p> : null}
          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={cameraActive ? capturePhoto : startCamera}
              className="inline-flex min-h-12 items-center justify-center gap-2 rounded-lg bg-accent px-3 text-sm font-bold text-on-accent"
            >
              <Camera size={18} aria-hidden="true" />
              {cameraActive ? "Tomar foto" : "Cámara"}
            </button>
            <label className="inline-flex min-h-12 cursor-pointer items-center justify-center gap-2 rounded-lg border border-line bg-soft px-3 text-sm font-bold text-primary">
              <ImagePlus size={18} aria-hidden="true" />
              Subir imagen
              <input
                type="file"
                accept="image/*"
                className="sr-only"
                onChange={(event) => {
                  handleFile(event.target.files?.[0]);
                  event.target.value = "";
                }}
              />
            </label>
          </div>
          {preview ? (
            <div className="flex items-center justify-between gap-2 text-xs text-secondary">
              <span className="min-w-0 truncate">{fileName}</span>
              <button type="button" onClick={clearImage} className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-primary" aria-label="Quitar imagen" title="Quitar imagen">
                <X size={18} aria-hidden="true" />
              </button>
            </div>
          ) : null}
        </div>
      </section>

      <section className="rounded-lg border border-line bg-surface p-4">
        <div className="flex items-center justify-between">
          <label htmlFor="demoSpecies" className="text-sm font-bold text-primary">Especie de prueba</label>
          <span className="rounded bg-soft px-2 py-1 text-[11px] font-bold text-accent">DEMO</span>
        </div>
        <select
          id="demoSpecies"
          value={demoSpeciesId}
          onChange={(event) => { setDemoSpeciesId(event.target.value); setResult(undefined); }}
          className="mt-3 min-h-12 w-full rounded-lg border border-line bg-card px-3 text-sm font-medium text-primary"
        >
          <option value="">Elegí una especie o probá sin selección</option>
          {species.map((item) => <option key={item.id} value={item.id}>{item.commonName}</option>)}
        </select>
        <p className="mt-2 text-xs leading-5 text-secondary">El resultado es demostrativo; no hay reconocimiento por IA conectado. Podés elegir una especie para probar el recorrido.</p>
      </section>

      <button
        type="button"
        disabled={!preview || analyzing || preparingPhoto}
        onClick={identify}
        className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-lg bg-accent px-4 font-bold text-on-accent transition enabled:active:scale-[.98] disabled:cursor-not-allowed disabled:opacity-45"
      >
        {analyzing || preparingPhoto ? <Loader2 size={19} className="animate-spin" aria-hidden="true" /> : <Sparkles size={19} aria-hidden="true" />}
        {preparingPhoto ? "Preparando imagen..." : "Identificar especie"}
      </button>

      {result ? (
        <section className="animate-pop">
          <h2 className="mb-3 text-lg font-bold text-primary">Resultado</h2>
          {result.species ? (
            <div className="overflow-hidden rounded-lg border border-line bg-surface shadow-panel">
              <AnimalImage src={result.species.image} alt={result.species.commonName} className="aspect-[16/9] w-full object-cover" />
              <div className="space-y-4 p-4">
                <p className="rounded-lg bg-soft p-3 text-xs leading-5 text-secondary">{result.message}</p>
                <div>
                  <p className="text-xs font-bold uppercase text-accent-secondary">{result.species.category}</p>
                  <h3 className="mt-1 text-xl font-bold text-primary">{result.species.commonName}</h3>
                  <p className="text-sm italic text-secondary">{result.species.scientificName}</p>
                </div>
                <p className="text-sm leading-6 text-primary">{result.species.description}</p>
                <button type="button" onClick={() => setShowDetail(true)} className="min-h-11 w-full rounded-lg border border-line text-sm font-semibold text-primary">Consultar ficha completa</button>
                <div className="divide-y divide-line">
                  <MiniFact label="Hábitat" text={result.species.habitat} />
                  <MiniFact label="Alimentación" text={result.species.diet} />
                  {result.species.conservation ? <MiniFact label="Conservación" text={result.species.conservation} /> : null}
                  <MiniFact label="Curiosidad" text={result.species.curiosity} />
                </div>
                {result.species.variants ? <div>
                  <label htmlFor="variant" className="text-sm font-bold text-primary">Variante o raza (opcional)</label>
                  <select id="variant" value={variantId} onChange={(event) => setVariantId(event.target.value)} className="mt-2 min-h-12 w-full rounded-lg border border-line bg-card px-3 text-sm text-primary">
                    <option value="">Sin especificar</option>
                    {result.species.variants.map((variant) => <option key={variant.id} value={variant.id}>{variant.name}</option>)}
                  </select>
                  <p className="mt-2 text-xs leading-5 text-secondary">Selección manual. Wildex no reconoce ni confirma razas en esta demo.</p>
                </div> : null}
                <div>
                  <label htmlFor="discovery-notes" className="text-sm font-bold text-primary">Notas (opcional)</label>
                  <textarea id="discovery-notes" value={notes} onChange={(event) => setNotes(event.target.value)} maxLength={240} rows={2} placeholder="¿Dónde lo observaste?" className="mt-2 w-full resize-none rounded-lg border border-line bg-card p-3 text-sm text-primary" />
                </div>
                <button type="button" onClick={() => onAddDiscovery({ species: result.species!, variantId: variantId || undefined, photo: savedPhoto, notes, identificationMethod: result.status === "demo-match" ? "demo-filename" : "demo-manual" })} className="min-h-12 w-full rounded-lg bg-accent px-4 font-bold text-on-accent">
                  Guardar observación
                </button>
                <button type="button" onClick={clearImage} className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-lg border border-line text-sm font-semibold text-primary">
                  <RotateCcw size={17} aria-hidden="true" /> Intentar nuevamente
                </button>
              </div>
            </div>
          ) : (
            <div className="rounded-lg border border-line bg-surface p-6 text-center">
              <ShieldAlert size={30} className="mx-auto text-danger" aria-hidden="true" />
              <h3 className="mt-3 text-lg font-bold text-primary">No se pudo confirmar la especie</h3>
              <p className="mt-2 text-sm leading-6 text-secondary">{result.message}</p>
            </div>
          )}
        </section>
      ) : null}
      {showDetail && result?.species ? <SpeciesDetail species={result.species} discoveries={[]} onClose={() => setShowDetail(false)} /> : null}
    </div>
  );
}

function MiniFact({ label, text }: { label: string; text: string }) {
  return (
    <div className="py-3">
      <p className="text-xs font-bold uppercase text-accent-secondary">{label}</p>
      <p className="mt-1 text-sm leading-6 text-primary">{text}</p>
    </div>
  );
}
