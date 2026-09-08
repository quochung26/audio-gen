/**
 * The player's icons, inline.
 *
 * Inline SVG rather than an icon package or a font: these are eight shapes, and both
 * alternatives cost a network request before the bar the listener is already looking at
 * can be drawn. They also replaced text glyphs — "❚❚", "▶" and "⏱" render at a different
 * size and weight on every platform, and on Android the clock came out as a colour emoji.
 *
 * `currentColor` throughout, so a button decides its own colour.
 */
function Svg({ children, size = 20 }: { children: React.ReactNode; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      focusable="false"
    >
      {children}
    </svg>
  );
}

export function PlayIcon({ size }: { size?: number }) {
  // Filled, unlike the rest: it is the one button that has to read at a glance.
  return (
    <svg width={size ?? 20} height={size ?? 20} viewBox="0 0 24 24" fill="currentColor" aria-hidden focusable="false">
      <path d="M8 5.2v13.6a.8.8 0 0 0 1.24.67l10.2-6.8a.8.8 0 0 0 0-1.34L9.24 4.53A.8.8 0 0 0 8 5.2Z" />
    </svg>
  );
}

export function PauseIcon({ size }: { size?: number }) {
  return (
    <svg width={size ?? 20} height={size ?? 20} viewBox="0 0 24 24" fill="currentColor" aria-hidden focusable="false">
      <rect x="6.5" y="5" width="4" height="14" rx="1.2" />
      <rect x="13.5" y="5" width="4" height="14" rx="1.2" />
    </svg>
  );
}

/** Skip back 15 seconds — the arrow curls anticlockwise, the number rides inside it. */
export function Back15Icon({ size }: { size?: number }) {
  return (
    <Svg size={size}>
      <path d="M11.5 4.5 8 7.5l3.5 3" />
      <path d="M8 7.5h4a7 7 0 1 1-7 7" />
      <text x="12" y="16.5" textAnchor="middle" fontSize="7.5" fill="currentColor" stroke="none">
        15
      </text>
    </Svg>
  );
}

export function Forward15Icon({ size }: { size?: number }) {
  return (
    <Svg size={size}>
      <path d="M12.5 4.5 16 7.5l-3.5 3" />
      <path d="M16 7.5h-4a7 7 0 1 0 7 7" />
      <text x="12" y="16.5" textAnchor="middle" fontSize="7.5" fill="currentColor" stroke="none">
        15
      </text>
    </Svg>
  );
}

export function TimerIcon({ size }: { size?: number }) {
  return (
    <Svg size={size}>
      <circle cx="12" cy="13" r="7.5" />
      <path d="M12 9.5V13l2.5 1.5" />
      <path d="M9.5 2.5h5" />
    </Svg>
  );
}

/** Stands in for missing cover art — a story is a book before it is a file. */
export function BookIcon({ size }: { size?: number }) {
  return (
    <Svg size={size}>
      <path d="M4 5.5A1.5 1.5 0 0 1 5.5 4H10a3 3 0 0 1 2 5.2V20a3 3 0 0 0-2-.8H5.5A1.5 1.5 0 0 1 4 17.7Z" />
      <path d="M20 5.5A1.5 1.5 0 0 0 18.5 4H14a3 3 0 0 0-2 5.2V20a3 3 0 0 1 2-.8h4.5a1.5 1.5 0 0 0 1.5-1.5Z" />
    </Svg>
  );
}
