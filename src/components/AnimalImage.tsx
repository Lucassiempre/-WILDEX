import { ImageOff } from "lucide-react";
import { useEffect, useState } from "react";

export function AnimalImage({ src, alt, className = "" }: { src: string; alt: string; className?: string }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [src]);
  if (failed) return <div className={`grid place-items-center bg-soft text-secondary ${className}`} role="img" aria-label={`Imagen no disponible: ${alt}`}><ImageOff size={26} aria-hidden="true" /></div>;
  return <img src={src} alt={alt} onError={() => setFailed(true)} loading="lazy" className={className} />;
}
