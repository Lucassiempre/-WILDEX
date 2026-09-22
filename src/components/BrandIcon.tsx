type BrandIconProps = {
  className?: string;
  decorative?: boolean;
};

export function BrandIcon({ className = "", decorative = false }: BrandIconProps) {
  return (
    <img
      src={`${import.meta.env.BASE_URL}images/wildex-icon.png`}
      alt={decorative ? "" : "Ícono de Wildex"}
      aria-hidden={decorative || undefined}
      className={`aspect-square object-contain ${className}`}
    />
  );
}
