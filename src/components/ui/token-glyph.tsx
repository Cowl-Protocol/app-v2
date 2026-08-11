"use client";

import { useState, useSyncExternalStore } from "react";
import {
  iconIsDead,
  iconsServerVersion,
  iconsVersion,
  markIconDead,
  subscribeIcons,
} from "@/lib/icon-store";
import { cn } from "@/lib/utils";

/**
 * A token's mark: the ticker set in type, with its icon laid over the top.
 *
 * Ported from `TokenGlyph` in the dapp, including the part that looks backwards.
 * **The icon renders by default and is only removed once it fails**, rather than
 * being revealed on load. Waiting for `onLoad` loses every icon whose load
 * finished before the handler was attached, which is most of them on a warm
 * cache, and leaves a row of tickers on the fastest visits.
 *
 * The type underneath is not a fallback that appears when something breaks. It
 * is always there, and the icon covers it, so a missing icon degrades to a
 * labelled plate rather than to a hole.
 *
 * **Where the icons come from, which is the part worth keeping straight.**
 * Curated tokens carry a path into this bundle, `/tokens/…`, so drawing them
 * asks nobody anything. A token discovered from the chain has no artwork here
 * and can only carry a URL the explorer gave us, and loading one is a request to
 * a stranger's server whose path names a token this browser holds. That is a
 * real disclosure and it is the reason `icon-store` exists rather than a naive
 * `onError`: a host that has already failed is never asked again this session.
 * Anything we curate should ship in the bundle.
 *
 * This sits in `components/ui` and not in a feature because it holds no domain
 * behaviour: two strings in, a picture out. `PLATE` is a colour table keyed by
 * ticker, which is the same kind of object as a palette.
 */

/** Plate colours for the tokens we ship artwork for, so a slow load is not grey. */
const PLATE: Record<string, string> = {
  ETH: "#5b6bff",
  WETH: "#3b4a9e",
  USDG: "#d7fb08",
  COWL: "#0a0b0e",
};

const INK: Record<string, string> = {
  USDG: "#0a0b0e",
  COWL: "#d7fb08",
};

export function TokenGlyph({
  symbol,
  src,
  className,
}: {
  symbol: string;
  src?: string;
  className?: string;
}) {
  // Re-renders this glyph when any other one retires the host it was about to use.
  useSyncExternalStore(subscribeIcons, iconsVersion, iconsServerVersion);

  /*
    The failure remembers *which* url failed rather than that one did. The dapp
    keeps a boolean and clears it in an effect when `src` changes, which Next 16
    now rejects outright, and this is better than the version it rejected: there
    is nothing to reset, because a new url is simply not the one that failed. A
    boolean plus a reset also has a frame where the flag is still true for a url
    nobody has tried yet, and the glyph hides an icon that would have loaded.
  */
  const [failedSrc, setFailedSrc] = useState<string | null>(null);

  const show = !!src && failedSrc !== src && !iconIsDead(src);

  // Four characters still read as a ticker. Longer than that and the glyph is
  // showing a word at six pixels, so it shows a stem instead.
  const initials = symbol.length <= 4 ? symbol : symbol.slice(0, 3);

  return (
    /*
      A circle, like the dapp's, and that is a reversal recorded on 2026-08-08.
      The first version was square on the argument that every mark on this
      screen is square, and on screen it lost: token artwork is drawn for a
      round crop, and four differently coloured squares in a row read as
      mismatched plates rather than as a set. A token mark is the token's
      brand, not this app's chrome, and both clients drawing the same mark the
      same way beats local geometry.

      `inline-flex` rather than a bare span: width and height do not apply to an
      inline element, so the wrapper collapses to nothing and both layers land on
      top of each other and spill outside the circle.
    */
    <span
      className={cn(
        "relative inline-flex size-8 shrink-0 overflow-hidden rounded-full bg-white/[0.05]",
        className,
      )}
      style={PLATE[symbol] ? { background: PLATE[symbol] } : undefined}
    >
      <span
        className={cn(
          "absolute inset-0 flex items-center justify-center font-mono tracking-tight",
          initials.length >= 4 ? "text-[8px]" : "text-[10px]",
        )}
        style={{ color: INK[symbol] ?? undefined }}
      >
        <span className={INK[symbol] ? undefined : "text-bone/60"}>{initials}</span>
      </span>

      {show && (
        /*
          A plain img and not next/image. There is no server here to optimise
          through, `images.unoptimized` is already set, and a discovered token's
          icon is an arbitrary remote URL that would have to be allowlisted by
          host in the config, which is not knowable ahead of time.
        */
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src}
          alt=""
          width={32}
          height={32}
          onError={() => {
            markIconDead(src);
            setFailedSrc(src);
          }}
          className="absolute inset-0 size-8 rounded-full object-cover"
        />
      )}

      {/*
        The dapp's ring, drawn last so it lands on the rim evenly. Under the
        icon it only showed where the crop let it through, which read as a
        broken edge.
      */}
      {symbol === "COWL" && (
        <span
          aria-hidden
          className="pointer-events-none absolute inset-0 rounded-full"
          style={{ boxShadow: "0 0 0 1px #d7fb08 inset" }}
        />
      )}
    </span>
  );
}
