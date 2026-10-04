/**
 * RepeatOneIcon: Spotify-style repeat-one — two opposing arrows on a loop
 * with a "1" drawn as a stroke path in the center gap. Tight 2px corner
 * radii: the standard 4px arcs alias into broken diagonals at 14-20px.
 * A path, not SVG <text>: text metrics vary per WebView.
 */
export function RepeatOneIcon({ className = "" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      {/* top loop: left stub → tight corner → line to the right arrowhead */}
      <path d="M3 10V8a2 2 0 0 1 2-2h16" />
      <path d="m18 3 3 3-3 3" />
      {/* bottom loop: right stub → tight corner → line to the left arrowhead */}
      <path d="M21 14v2a2 2 0 0 1-2 2H3" />
      <path d="m6 15-3 3 3 3" />
      {/* the "1": stem + flag, sized to the arrows' center gap (y 7..17) */}
      <path d="M13.4 15.8V8.2L10.6 10.3" />
    </svg>
  );
}
