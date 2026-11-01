type BrandMarkProps = {
  className?: string;
};

export function BrandMark({ className = "h-10 w-10" }: BrandMarkProps) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      fill="none"
      viewBox="0 0 64 64"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M10 8h26c14 0 23 8 23 21 0 11-7 19-17 19-8 0-13-5-13-11 0-6 3-10 9-13 4-2 6-5 4-8-3-4-10-4-17 0L10 30V8Z"
        fill="#123F4A"
      />
      <path
        d="M10 30c8-8 17-13 25-13 7 0 12 4 12 10 0 4-2 6-5 9-3 2-4 4-4 6 0 4 3 6 7 6 6 0 12-4 18-10v18c0 4-2 6-6 6H10V30Z"
        fill="#83B9BC"
      />
      <path
        d="M13 31c8-8 16-13 24-13 6 0 10 3 10 8 0 4-2 7-6 10"
        stroke="#FAF9F6"
        strokeLinecap="round"
        strokeWidth="5"
      />
    </svg>
  );
}

type BrandLockupProps = {
  inverse?: boolean;
  compact?: boolean;
};

export function BrandLockup({ inverse = false, compact = false }: BrandLockupProps) {
  return (
    <span className="inline-flex items-center gap-2 sm:gap-3">
      <BrandMark className={compact ? "h-9 w-9" : "h-8 w-8 sm:h-11 sm:w-11"} />
      <span className={`flex flex-col ${inverse ? "text-cloud" : "text-ocean"}`}>
        <span
          className={`font-display font-bold leading-none ${compact ? "text-lg" : "text-sm sm:text-xl"}`}
        >
          butterbox
        </span>
        <span
          className={`mt-1 text-[8px] uppercase tracking-[0.24em] sm:text-[9px] sm:tracking-[0.3em] ${inverse ? "text-cloud/70" : "text-ocean/70"}`}
        >
          Systems
        </span>
      </span>
    </span>
  );
}