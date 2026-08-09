type BrandMarkProps = {
  size?: number;
  className?: string;
  /** `mark` — in-app logo; `tile` — cream tile (matches manifest icon). */
  variant?: "mark" | "tile";
  /** Badge halo when variant is `mark`. */
  haloFill?: string;
};

const LOGO_TILE_FILL = "#F5F2EF";
const LOGO_STAR_PATH =
  "M16 5 C18.8 9.5 18.8 13.4 27 16 C18.8 18.6 18.8 22.5 16 27 C13.2 22.5 13.2 18.6 5 16 C13.2 13.4 13.2 9.5 16 5 Z";
const LOGO_BADGE = "25.75 23 28.5 25.75 25.75 28.5 23 25.75";
const LOGO_BADGE_HALO = "25.75 22.25 29.25 25.75 25.75 29.25 22.25 25.75";

export default function BrandMark({
  size = 28,
  className,
  variant = "mark",
  haloFill = "var(--background)",
}: BrandMarkProps) {
  const tile = variant === "tile";

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 32 32"
      width={size}
      height={size}
      className={className}
      role="img"
      aria-label="OpenTranslator"
    >
      {tile ? <rect width="32" height="32" rx="8" fill={LOGO_TILE_FILL} /> : null}
      <path d={LOGO_STAR_PATH} fill="currentColor" />
      <polygon points={LOGO_BADGE_HALO} fill={tile ? LOGO_TILE_FILL : haloFill} />
      <polygon points={LOGO_BADGE} fill="currentColor" />
    </svg>
  );
}
