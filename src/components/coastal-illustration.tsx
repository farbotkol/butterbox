import { COASTAL_ARTWORK } from "@/components/brand/coastal-artwork";

type CoastalIllustrationProps = {
  className?: string;
  showBackground?: boolean;
};

// Decorative coastal artwork in the Coastal Wave palette. Inline SVG keeps
// it crisp and avoids an extra image request on low-bandwidth connections.
export function CoastalIllustration({ className, showBackground = false }: CoastalIllustrationProps) {
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      className={className}
      preserveAspectRatio="xMidYMax slice"
      viewBox={COASTAL_ARTWORK.viewBox}
      xmlns="http://www.w3.org/2000/svg"
    >
      {showBackground && <rect width="1200" height="560" fill={COASTAL_ARTWORK.background} />}
      {COASTAL_ARTWORK.circles.map((circle) => (
        <circle key={`${circle.cx}-${circle.r}`} cx={circle.cx} cy={circle.cy} r={circle.r} fill={circle.fill}
          opacity={"opacity" in circle ? circle.opacity : undefined} />
      ))}
      {COASTAL_ARTWORK.paths.map((path) => (
        <path key={path.d.slice(0, 24)} d={path.d} fill={path.fill}
          stroke={"stroke" in path ? path.stroke : undefined}
          strokeLinecap={"stroke" in path ? "round" : undefined}
          strokeWidth={"stroke" in path ? 5 : undefined}
          opacity={"opacity" in path ? path.opacity : undefined} />
      ))}
    </svg>
  );
}
