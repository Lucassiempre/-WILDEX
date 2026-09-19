import { Camera, ImagePlus, Loader2, RotateCcw, ScanLine, ShieldAlert, Sparkles, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { species } from "../data/species";
import { identifySpecies } from "../services/recognitionService";
import type { AnalysisResult, Species } from "../types";

type DiscoverPageProps = {
  onAddDiscovery: (species: Species) => void;
  onRetry?: () => void;
};

export function DiscoverPage({ onAddDiscovery }: DiscoverPageProps) {
  const [preview, setPreview] = useState<string>();
  const [fileName, setFileName] = useState<string>();
  const [demoSpeciesId, setDemoSpeciesId] = useState("carpincho");
  const [cameraActive, setCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState<string>();
  const [analyzing, setAnalyzing] = useState(false);
  const [result, setResult] = useState<AnalysisResult>();
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    return () => stopCamera();
  }, []);

  const startCamera = async () => {
    setCameraError(undefined);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
      streamRef.current = stream;
      setCameraActive(true);
      if (videoRef.current) videoRef.current.srcObject = stream;
    } catch {
      setCameraError("No se pudo activar la cámara. Puedes subir una imagen para continuar.");
    }
  };

  const stopCamera = () => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    setCameraActive(false);
  };

  const capturePhoto = () => {
    const video = videoRef.current;
    if (!video) return;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth || 1280;
    canvas.height = video.videoHeight || 720;
    canvas.getContext("2d")?.drawImage(video, 0, 0, canvas.width, canvas.height);
    setPreview(canvas.toDataURL("image/jpeg", 0.9));
    setFileName("captura-camara-demo.jpg");
    stopCamera();
    setResult(undefined);
  };

  const handleFile = (file?: File) => {
    if (!file) return;
    setPreview(URL.createObjectURL(file));
    setFileName(file.name);
    setResult(undefined);
  };

  const clearImage = () => {
    setPreview(undefined);
    setFileName(undefined);
    setResult(undefined);
  };

  const identify = async () => {
    if (!preview) return;
    setAnalyzing(true);
    setResult(undefined);
    const analysis = await identifySpecies({ fileName, demoSpeciesId });
    setResult(analysis);
    setAnalyzing(false);
  };

  return (
    <div className="grid gap-5 pb-32">
      <section className="rounded-[2rem] border border-forest/10 bg-white p-5 shadow-sm">
        <div className="mb-5">
          <p className="text-sm font-bold uppercase tracking-[0.18em] text-canopy">Cámara e identificación</p>
          <h1 className="text-3xl font-black text-forest">Fotografiar → identificar → guardar</h1>
        </div>

        <div className="relative overflow-hidden rounded-[2rem] border border-forest/10 bg-forest">
          {preview ? (
            <img src={preview} alt="Imagen seleccionada para analizar" className="aspect-[4/3] w-full object-cover" />
          ) : (
            <div className="grid aspect-[4/3] place-items-center bg-[radial-gradient(circle_at_top,_rgba(216,169,66,.28),_rgba(18,55,42,1)_65%)] text-center text-white">
              {cameraActive ? (
                <video ref={videoRef} autoPlay playsInline muted className="h-full w-full object-cover" />
              ) : (
                <div className="max-w-xs space-y-4 p-6">
                  <ScanLine className="mx-auto text-gold" size={44} aria-hidden="true" />
                  <p className="text-lg font-bold">Activa la cámara o sube una imagen para iniciar el análisis.</p>
                </div>
              )}
            </div>
          )}
          {analyzing ? (
            <div className="absolute inset-0 overflow-hidden bg-forest/70 backdrop-blur-[2px]">
              <div className="absolute left-0 right-0 h-24 animate-scan bg-gradient-to-b from-transparent via-gold/55 to-transparent" />
              <div className="grid h-full place-items-center text-white">
                <div className="rounded-3xl bg-forest/75 p-5 text-center shadow-lift">
                  <Loader2 className="mx-auto mb-3 animate-spin text-gold" aria-hidden="true" />
                  <p className="font-bold">Analizando imagen demo</p>
                </div>
              </div>
            </div>
          ) : null}
        </div>

        {cameraError ? (
          <p className="mt-3 rounded-2xl bg-ember/10 p-3 text-sm font-semibold text-ember">{cameraError}</p>
        ) : null}

        <div className="mt-5 grid gap-3">
          {!cameraActive ? (
            <button
              type="button"
              onClick={startCamera}
              className="inline-flex items-center justify-center gap-2 rounded-2xl bg-forest px-4 py-3 font-bold text-white"
            >
              <Camera size={19} aria-hidden="true" />
              Activar cámara
            </button>
          ) : (
            <button
              type="button"
              onClick={capturePhoto}
              className="inline-flex items-center justify-center gap-2 rounded-2xl bg-gold px-4 py-3 font-black text-forest"
            >
              <Camera size={19} aria-hidden="true" />
              Tomar fotografía
            </button>
          )}

          <label className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-2xl border border-forest/15 bg-paper px-4 py-3 font-bold text-forest transition hover:bg-moss/35">
            <ImagePlus size={19} aria-hidden="true" />
            Subir imagen
            <input type="file" accept="image/*" className="sr-only" onChange={(event) => handleFile(event.target.files?.[0])} />
          </label>
        </div>

        <div className="mt-5 rounded-3xl bg-paper p-4">
          <label htmlFor="demoSpecies" className="text-sm font-bold uppercase tracking-[0.14em] text-canopy">
            Especie para modo demo
          </label>
          <select
            id="demoSpecies"
            value={demoSpeciesId}
            onChange={(event) => setDemoSpeciesId(event.target.value)}
            className="mt-2 w-full rounded-2xl border border-forest/10 bg-white px-4 py-3 font-semibold text-forest outline-none focus:ring-2 focus:ring-gold"
          >
            {species.map((item) => (
              <option key={item.id} value={item.id}>
                {item.commonName}
              </option>
            ))}
          </select>
          <p className="mt-2 text-sm leading-6 text-forest/65">
            Este selector existe solo para probar el MVP sin conectar una API de IA.
          </p>
        </div>

        <div className="mt-5 flex flex-wrap gap-3">
          <button
            type="button"
            disabled={!preview || analyzing}
            onClick={identify}
            className="inline-flex flex-1 items-center justify-center gap-2 rounded-2xl bg-gold px-5 py-4 font-black text-forest shadow-sm transition enabled:hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Sparkles size={20} aria-hidden="true" />
            Identificar especie
          </button>
          <button
            type="button"
            disabled={!preview || analyzing}
            onClick={clearImage}
            className="inline-flex items-center justify-center gap-2 rounded-2xl border border-forest/15 px-5 py-4 font-bold text-forest disabled:cursor-not-allowed disabled:opacity-50"
          >
            <X size={20} aria-hidden="true" />
            Cancelar
          </button>
        </div>
      </section>

      <section className="rounded-[2rem] border border-forest/10 bg-white p-5 shadow-sm">
        <div className="mb-5">
          <p className="text-sm font-bold uppercase tracking-[0.18em] text-canopy">Resultado del análisis</p>
          <h2 className="text-3xl font-black text-forest">Ficha detectada</h2>
        </div>

        {!result && !analyzing ? (
          <div className="grid min-h-80 place-items-center rounded-[2rem] border border-dashed border-forest/20 bg-paper p-6 text-center">
            <div className="max-w-sm">
              <ShieldAlert className="mx-auto mb-4 text-canopy" size={44} aria-hidden="true" />
              <h3 className="text-xl font-black text-forest">Sin análisis todavía</h3>
              <p className="mt-2 text-sm leading-6 text-forest/65">
                Cuando confirmes una imagen, WILDEX mostrará si pudo encontrar una ficha demo o si la especie queda sin confirmar.
              </p>
            </div>
          </div>
        ) : null}

        {result?.species ? (
          <div className="animate-pop overflow-hidden rounded-[2rem] border border-forest/10 bg-paper">
            <img src={result.species.image} alt={result.species.commonName} className="aspect-[16/10] w-full object-cover" />
            <div className="space-y-4 p-5">
              <div className="rounded-2xl bg-gold/20 p-3 text-sm font-semibold leading-6 text-forest">
                {result.message}
              </div>
              <div>
                <p className="text-sm font-bold uppercase tracking-[0.16em] text-canopy">{result.species.category}</p>
                <h3 className="text-3xl font-black text-forest">{result.species.commonName}</h3>
                <p className="italic text-forest/55">{result.species.scientificName}</p>
              </div>
              <p className="leading-7 text-forest/75">{result.species.description}</p>
              <div className="grid gap-3">
                <MiniFact label="Hábitat" text={result.species.habitat} />
                <MiniFact label="Alimentación" text={result.species.diet} />
                <MiniFact label="Conservación" text={result.species.conservation} />
                <MiniFact label="Curiosidad" text={result.species.curiosity} />
              </div>
              <div className="flex flex-wrap gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => onAddDiscovery(result.species!)}
                  className="inline-flex flex-1 items-center justify-center gap-2 rounded-2xl bg-forest px-5 py-4 font-black text-white"
                >
                  Agregar a mi colección
                </button>
                <button
                  type="button"
                  onClick={clearImage}
                  className="inline-flex items-center justify-center gap-2 rounded-2xl border border-forest/15 px-5 py-4 font-bold text-forest"
                >
                  <RotateCcw size={19} aria-hidden="true" />
                  Intentar nuevamente
                </button>
              </div>
            </div>
          </div>
        ) : null}

        {result?.status === "unconfirmed" ? (
          <div className="grid min-h-80 place-items-center rounded-[2rem] bg-paper p-6 text-center">
            <div className="max-w-md">
              <ShieldAlert className="mx-auto mb-4 text-ember" size={46} aria-hidden="true" />
              <h3 className="text-2xl font-black text-forest">No se pudo confirmar la especie</h3>
              <p className="mt-3 leading-7 text-forest/70">{result.message}</p>
            </div>
          </div>
        ) : null}
      </section>
    </div>
  );
}

function MiniFact({ label, text }: { label: string; text: string }) {
  return (
    <div className="rounded-2xl bg-white p-4">
      <p className="text-xs font-bold uppercase tracking-[0.16em] text-canopy">{label}</p>
      <p className="mt-1 text-sm leading-6 text-forest/70">{text}</p>
    </div>
  );
}
