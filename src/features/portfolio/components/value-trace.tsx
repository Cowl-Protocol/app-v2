"use client";

import { useId, useRef, useState } from "react";
import { formatUsd } from "@/lib/format";
import type { TracePoint } from "../types";

/**
 * Seven days of portfolio value, as one line.
 *
 * **One series, so there is no legend and no palette.** The accent carries the
 * line and nothing else on the panel competes for it. Colouring by asset here
 * would have meant four hues on a screen whose whole identity is one green on
 * black, to answer a question the table underneath already answers better.
 *
 * The two values that matter are written out rather than left to the tooltip:
 * the endpoint is the balance printed directly above this, and the change across
 * the window sits beside it in text. Hover reveals the days in between, which
 * are shape rather than fact, so nothing here is reachable only by pointing at
 * it. The svg also carries a spoken summary for anyone who never sees the line.
 *
 * The geometry is a unit box scaled by the browser, with `non-scaling-stroke` so
 * the line stays two pixels at any width instead of being stretched into a
 * wedge by the same transform that fits it to the card.
 */

const H = 100;
const W = 100;
/** Headroom so the peak and the trough do not graze the frame. */
const PAD = 8;

export function ValueTrace({ points }: { points: TracePoint[] }) {
  const box = useRef<HTMLDivElement>(null);
  const fillId = useId();
  const [hover, setHover] = useState<number | null>(null);

  const values = points.map((p) => p.usd);
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  // A flat series would divide by zero and collapse to the top edge.
  const span = hi - lo || 1;

  const x = (i: number) => (i / (points.length - 1)) * W;
  const y = (v: number) => PAD + (1 - (v - lo) / span) * (H - PAD * 2);

  const line = points.map((p, i) => `${i === 0 ? "M" : "L"}${x(i)} ${y(p.usd)}`).join(" ");
  const area = `${line} L${W} ${H} L0 ${H} Z`;

  const first = points[0];
  const last = points[points.length - 1];
  const summary =
    first && last
      ? `Portfolio value over seven days, ${formatUsd(first.usd)} to ${formatUsd(last.usd)}.`
      : "Portfolio value over seven days.";

  /**
   * Nearest point to the pointer, rather than a hit box per point. Seven targets
   * across a card this wide would each be a sliver, and a reader who lands
   * between two of them would get nothing at all.
   */
  function track(clientX: number) {
    const rect = box.current?.getBoundingClientRect();
    if (!rect || rect.width === 0) return;
    const ratio = (clientX - rect.left) / rect.width;
    const i = Math.round(ratio * (points.length - 1));
    setHover(Math.min(points.length - 1, Math.max(0, i)));
  }

  const active = hover === null ? null : points[hover];

  return (
    <div
      ref={box}
      className="relative h-full min-h-[74px] w-full touch-none"
      onPointerMove={(e) => track(e.clientX)}
      onPointerLeave={() => setHover(null)}
    >
      {/*
        Absolutely positioned, so the svg fills its box and never sizes it.
        An inline svg with a viewBox and no resolvable height falls back to its
        own aspect ratio, and this one's box is square: the moment the parent
        stopped having a fixed height, the chart claimed a height equal to the
        panel's width and pushed a 900 pixel row into a screen that wanted 440.
        Out of flow it has nothing to be intrinsic about.
      */}
      <svg
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        role="img"
        aria-label={summary}
        className="absolute inset-0 h-full w-full"
      >
        {/*
          The gradient id comes from `useId`, not a literal. An svg id is
          document scoped, so a second trace on the same page would define
          `trace-fill` twice and both would resolve to whichever the browser saw
          first. Nothing throws, one chart just quietly wears the other's fill.
        */}
        <defs>
          <linearGradient id={fillId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--color-mark)" stopOpacity="0.16" />
            <stop offset="100%" stopColor="var(--color-mark)" stopOpacity="0" />
          </linearGradient>
        </defs>

        <path d={area} fill={`url(#${fillId})`} />
        <path
          d={line}
          fill="none"
          stroke="var(--color-mark)"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
        />
      </svg>

      {/*
        The crosshair and the marker are html, not svg.
        `preserveAspectRatio="none"` is what lets the line fill any width, and
        the same transform turns a circle into an ellipse and a one pixel rule
        into whatever the card's aspect ratio makes of it. `non-scaling-stroke`
        rescues strokes and does nothing for geometry. Outside the svg both stay
        the shape they were drawn as.
      */}
      {active && hover !== null && (
        <>
          <span
            aria-hidden
            className="pointer-events-none absolute inset-y-0 w-px bg-bone/20"
            style={{ left: `${(hover / (points.length - 1)) * 100}%` }}
          />
          <span
            aria-hidden
            className="pointer-events-none absolute size-[9px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-mark ring-2 ring-card"
            style={{
              left: `${(hover / (points.length - 1)) * 100}%`,
              top: `${(y(active.usd) / H) * 100}%`,
            }}
          />
        </>
      )}

      {active && hover !== null && (
        <div
          className="pointer-events-none absolute top-0 z-10 -translate-x-1/2 bg-ink2 px-2 py-1.5 font-mono text-[10.5px] whitespace-nowrap text-bone shadow-[0_8px_24px_-8px_rgba(0,0,0,0.9)]"
          style={{
            // Clamped so the label never hangs off either end of the card.
            left: `clamp(46px, ${(hover / (points.length - 1)) * 100}%, calc(100% - 46px))`,
          }}
        >
          <span className="tabular-nums">{formatUsd(active.usd)}</span>
          <span className="ml-2 text-bone/45">{active.t}</span>
        </div>
      )}
    </div>
  );
}
