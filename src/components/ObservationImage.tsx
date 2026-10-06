import { useEffect, useRef, useState } from "react";
import { useAuth } from "../auth/AuthProvider";
import { resolveObservationPhoto } from "../services/photoStorageService";
import { resolveDiscoveryPhoto } from "../services/photoSyncService";
import type { Discovery } from "../types";
import { AnimalImage } from "./AnimalImage";

export function ObservationImage({
  discovery,
  fallback,
  alt,
  className = "",
}: {
  discovery: Discovery;
  fallback: string;
  alt: string;
  className?: string;
}) {
  const { user } = useAuth();
  const [src, setSrc] = useState(discovery.photo || fallback);
  const latestDiscovery = useRef(discovery);
  latestDiscovery.current = discovery;

  useEffect(() => {
    let active = true;
    setSrc(discovery.photo || fallback);
    if (discovery.photo) return () => { active = false; };
    if (!discovery.photoRef && !(user?.id && discovery.remotePhoto)) return () => { active = false; };

    if (user?.id) {
      void resolveDiscoveryPhoto(discovery, user.id)
        .then((resolved) => {
          if (active && resolved?.src && !latestDiscovery.current.photo) {
            setSrc(resolved.src);
          }
        })
        .catch(() => undefined);
    } else if (discovery.photoRef) {
      void resolveObservationPhoto(discovery.photoRef)
        .then((resolved) => {
          if (active && resolved && !latestDiscovery.current.photo) {
            setSrc(resolved);
          }
        })
        .catch(() => undefined);
    }
    return () => { active = false; };
  }, [discovery, fallback, user?.id]);

  return <AnimalImage src={src} alt={alt} className={className} />;
}
