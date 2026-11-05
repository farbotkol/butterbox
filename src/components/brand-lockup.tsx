import {
  BRAND_COLORS,
  ICON_PATHS,
  ICON_VIEWBOX,
  LOCKUP_ICON_TRANSFORM,
  LOCKUP_VIEWBOX,
  LOCKUP_WORDMARK_TRANSFORM,
  WORDMARK_PATH,
} from "@/components/brand/logo-geometry";

// Single source for the Butterbox Coastal Wave logo in the application.
// Geometry is traced from branding/originals/butterbox-approved-logo.png.

function IconLayers() {
  return (
    <>
      <path fill={BRAND_COLORS.teal} d={ICON_PATHS.silhouette} />
      <path fill={BRAND_COLORS.cream} d={ICON_PATHS.creamAndGold} />
      <path fill={BRAND_COLORS.gold} d={ICON_PATHS.gold} />
    </>
  );
}

type BrandMarkProps = {
  className?: string;
};

export function BrandMark({ className = "h-10 w-10" }: BrandMarkProps) {
  return (
    <svg aria-hidden="true" className={className} viewBox={ICON_VIEWBOX} xmlns="http://www.w3.org/2000/svg">
      <IconLayers />
    </svg>
  );
}

type BrandLockupProps = {
  inverse?: boolean;
  compact?: boolean;
  className?: string;
};

const [, , lockupWidth, lockupHeight] = LOCKUP_VIEWBOX.split(" ").map(Number);

export function BrandLockup({ inverse = false, compact = false, className }: BrandLockupProps) {
  const size = className ?? (compact ? "h-9" : "h-9 sm:h-11");
  return (
    <svg
      role="img"
      aria-label="Butterbox"
      className={`block w-auto shrink-0 ${size}`}
      style={{ aspectRatio: `${lockupWidth} / ${lockupHeight}` }}
      viewBox={LOCKUP_VIEWBOX}
      xmlns="http://www.w3.org/2000/svg"
    >
      <g transform={LOCKUP_ICON_TRANSFORM}>
        <IconLayers />
      </g>
      <g transform={LOCKUP_WORDMARK_TRANSFORM}>
        <path fill={inverse ? BRAND_COLORS.cream : BRAND_COLORS.charcoal} d={WORDMARK_PATH} />
      </g>
    </svg>
  );
}
