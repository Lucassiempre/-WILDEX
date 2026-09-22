type BrandLogoProps = {
  className?: string;
  decorative?: boolean;
};

export function BrandLogo({ className = "", decorative = false }: BrandLogoProps) {
  return (
    <img
      src={`${import.meta.env.BASE_URL}images/wildex-logo.png`}
      alt={decorative ? "" : "WILDEX, descubre, aprende, protege"}
      aria-hidden={decorative || undefined}
      className={`aspect-square object-cover ${className}`}
    />
  );
}
