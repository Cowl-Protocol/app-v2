import { cn } from "@/lib/utils";

/**
 * The circuit trace backdrop. Decoration, and deliberately quiet.
 *
 * Four chips in the corners, two chamfered rails running past the card, and a
 * lit via where each rail leaves its chip. Every corner is a 45 degree bevel and
 * never a curve, which is what makes it read as a board rather than as flourish.
 *
 * `slice` on the aspect ratio means the artwork crops rather than squashes, so
 * the chips stay pinned near the corners at any viewport and the rails keep
 * hugging the card instead of drifting across it.
 */

/** One corner module: rounded body, dot grid, and pins running off the edge. */
function Chip({ x, y, flip = false }: { x: number; y: number; flip?: boolean }) {
  const dots = [];
  for (let c = 0; c < 2; c++) {
    for (let row = 0; row < 2; row++) {
      for (let col = 0; col < 5; col++) {
        dots.push(
          <circle
            key={`${c}-${row}-${col}`}
            cx={26 + c * 66 + col * 9}
            cy={22 + row * 20}
            r="1.4"
          />,
        );
      }
    }
  }

  return (
    <g transform={`translate(${x} ${y}) ${flip ? "scale(-1 1)" : ""}`}>
      {/* pins, running out past the frame edge */}
      <g stroke="currentColor" strokeOpacity="0.16">
        <path d="M0 14 H-70" />
        <path d="M0 32 H-70" />
        <path d="M0 50 H-70" />
      </g>
      <rect
        width="133"
        height="65"
        rx="7"
        fill="currentColor"
        fillOpacity="0.045"
        stroke="currentColor"
        strokeOpacity="0.09"
      />
      <g fill="currentColor" fillOpacity="0.2">
        {dots}
      </g>
    </g>
  );
}

/** A lit square where a rail meets its chip. */
function Via({ x, y }: { x: number; y: number }) {
  return (
    <g transform={`translate(${x} ${y})`}>
      <rect x="-9" y="-9" width="18" height="18" fill="currentColor" fillOpacity="0.07" />
      <rect x="-4" y="-4" width="8" height="8" fill="currentColor" fillOpacity="0.85" />
    </g>
  );
}

export function CircuitBackdrop({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 2000 1500"
      preserveAspectRatio="xMidYMid slice"
      aria-hidden
      className={cn("pointer-events-none absolute inset-0 h-full w-full", className)}
    >
      <g fill="none" strokeWidth="1.5" vectorEffect="non-scaling-stroke">
        {/* left rail: top chip, down past the card, bottom chip */}
        <path
          d="M232 233 H560 L630 303 V1197 L560 1267 H232"
          stroke="currentColor"
          strokeOpacity="0.13"
        />
        {/* right rail, mirrored */}
        <path
          d="M1768 233 H1440 L1370 303 V1197 L1440 1267 H1768"
          stroke="currentColor"
          strokeOpacity="0.13"
        />
      </g>

      <g className="text-white">
        <Chip x={65} y={200} />
        <Chip x={1935} y={200} flip />
        <Chip x={65} y={1235} />
        <Chip x={1935} y={1235} flip />

        <Via x={222} y={233} />
        <Via x={1778} y={233} />
        <Via x={222} y={1267} />
        <Via x={1778} y={1267} />
      </g>
    </svg>
  );
}
