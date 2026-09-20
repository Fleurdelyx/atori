/**
 * LogoMark — the ATRI app icon as an inline SVG: a vinyl disc cut by the
 * signature slash, cyan-edged with a spindle ring and a sparkle accent.
 * Crisp at any size; colors are fixed (independent of the active skin).
 */
export function LogoMark({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden>
      <defs>
        <linearGradient id="lm-bg" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#2e2652" />
          <stop offset="1" stopColor="#110f20" />
        </linearGradient>
        <radialGradient id="lm-disc" cx="0.35" cy="0.3" r="1">
          <stop offset="0" stopColor="#ff5f9e" />
          <stop offset="1" stopColor="#ac2462" />
        </radialGradient>
        <mask id="lm-cut">
          <rect width="64" height="64" fill="#ffffff" />
          <rect x="26.5" y="-14" width="11" height="92" fill="#000000" transform="rotate(27 32 32)" />
        </mask>
      </defs>
      <rect width="64" height="64" rx="14" fill="url(#lm-bg)" />
      <g mask="url(#lm-cut)">
        <circle cx="32" cy="32" r="24" fill="url(#lm-disc)" />
        {[5.5, 8, 10.5, 13, 15.5, 18, 20.5, 23].map((r) => (
          <circle key={r} cx="32" cy="32" r={r} fill="none" stroke="#8c1652" strokeWidth="0.55" opacity="0.5" />
        ))}
        <line
          x1={32 - 9.25}
          y1={32 - 23}
          x2={32 - 9.25}
          y2={32 + 23}
          stroke="#52d8e8"
          strokeWidth="1.6"
          strokeLinecap="round"
        />
        <path
          d="M46 6 L47.4 10.6 L52 12 L47.4 13.4 L46 18 L44.6 13.4 L40 12 L44.6 10.6 Z"
          fill="#ffd76e"
        />
      </g>
      <circle cx="32" cy="32" r="5.9" fill="#110f20" />
      <circle cx="32" cy="32" r="4.75" fill="none" stroke="#52d8e8" strokeWidth="1.5" />
    </svg>
  );
}
