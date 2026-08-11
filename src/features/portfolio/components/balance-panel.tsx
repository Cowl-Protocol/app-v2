"use client";

import { Panel } from "@/components/ui/panel";
import { cn } from "@/lib/utils";
import { formatUsd } from "@/lib/format";
import type { TracePoint } from "../types";
import { QuickActions, type Verb } from "./quick-actions";
import { ValueTrace } from "./value-trace";

/**
 * The one number this screen exists to show, and the four things you can do
 * with it.
 *
 * The figure is set in the sans, not the mono. Mono is the house face for
 * numbers and it is used for every number on this page except this one: equal
 * width digits are what makes a column of amounts line up, and at fifty pixels
 * the same property leaves gaps inside the number itself, so a balance ending in
 * 1s reads as though it has been spaced out. Proportional figures here, tabular
 * everywhere the numbers stack.
 *
 * **Hide is a real control, not a novelty.** This is a balance somebody may open
 * on a train, and the fastest privacy failure in any wallet is the person
 * sitting next to its owner. It blanks rather than blurs, because a blur of a
 * short number is still legible from the shape of it, and it reaches the asset
 * rows too: hiding the total and leaving four amounts underneath that add up to
 * it would be theatre.
 */

export function BalancePanel({
  points,
  hidden,
  onToggleHidden,
  onAction,
}: {
  points: TracePoint[];
  hidden: boolean;
  onToggleHidden: () => void;
  onAction?: (verb: Verb) => void;
}) {
  const first = points[0]?.usd ?? 0;
  const last = points[points.length - 1]?.usd ?? 0;
  const pct = first > 0 ? ((last - first) / first) * 100 : 0;
  const up = pct >= 0;

  return (
    <Panel
      label="Total balance"
      tone="mark"
      aside={
        <button
          type="button"
          onClick={onToggleHidden}
          aria-pressed={hidden}
          className="flex items-center gap-2 font-mono text-[10.5px] tracking-[0.16em] text-bone/45 uppercase transition-colors hover:text-bone"
        >
          {hidden ? <EyeOpen /> : <EyeShut />}
          {hidden ? "Show" : "Hide"}
        </button>
      }
      className="h-full min-w-0"
    >
      <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
        <p
          className={cn(
            "text-[42px] leading-none font-semibold tracking-[-0.025em] text-bone md:text-[52px]",
            hidden && "select-none",
          )}
        >
          {hidden ? "••••••" : formatUsd(last)}
        </p>

        <p className="flex items-baseline gap-2 font-mono text-[11px]">
          <span className={up ? "text-mark" : "text-bone/70"}>
            {up ? "▲" : "▼"} {Math.abs(pct).toFixed(2)}%
          </span>
          <span className="text-bone/35">7 days</span>
        </p>
      </div>

      {/*
        Everything on this screen is shielded, so the panel says it once, here,
        rather than stamping a padlock onto every row underneath it.

        It does not name the pool. The contract is where this runs, not what the
        product is, and a consumer who has just signed in with Google has no use
        for a venue they cannot visit and no way to check anything we might claim
        about it. That belongs in the docs, for somebody who came looking.
      */}
      <p className="mt-2 text-[12px] text-bone/40">
        Held privately. Only this browser can read it.
      </p>

      {/*
        The trace takes the slack. This panel shares a grid row with Receive,
        whose height is set by a QR code, so one of the two is always being
        stretched. Absorbing it here means a taller chart rather than a gap
        between two things that were meant to sit together.
      */}
      <div className="mt-5 max-h-[190px] min-h-[86px] flex-1">
        <ValueTrace points={points} />
      </div>

      {/*
        Pinned to the bottom edge, level with the Receive panel's own last
        control. Whatever slack the chart's ceiling did not take lands above
        these rather than under them, where it would have read as the panel
        having run out of content.

        The spacing is on a wrapper and not on the row itself. That row draws its
        dividers as a background showing through one pixel gaps, so padding on it
        paints the divider colour across the whole strip and lands a grey band
        under the chart.
      */}
      <div className="mt-auto pt-5">
        <QuickActions onAction={onAction} />
      </div>
    </Panel>
  );
}

/** The mark's own silhouette, closed. Same two blades, meeting in the middle. */
function EyeShut() {
  return (
    <svg viewBox="0 0 24 24" fill="none" strokeWidth="1.5" aria-hidden className="size-4">
      <path
        d="M3 12s3.5-5.5 9-5.5S21 12 21 12s-3.5 5.5-9 5.5S3 12 3 12Z"
        stroke="currentColor"
      />
      <path d="M4 4l16 16" stroke="currentColor" strokeLinecap="round" />
    </svg>
  );
}

function EyeOpen() {
  return (
    <svg viewBox="0 0 24 24" fill="none" strokeWidth="1.5" aria-hidden className="size-4">
      <path
        d="M3 12s3.5-5.5 9-5.5S21 12 21 12s-3.5 5.5-9 5.5S3 12 3 12Z"
        stroke="currentColor"
      />
      <circle cx="12" cy="12" r="2.25" stroke="currentColor" />
    </svg>
  );
}
