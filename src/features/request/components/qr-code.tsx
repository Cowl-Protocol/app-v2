"use client";

import { useMemo } from "react";
import encodeQR from "qr";

/**
 * A payment address as something a phone can read.
 *
 * Ported from `app/components/QrCode.tsx` and using the same encoder, so the two
 * clients produce the same code for the same address rather than two codes that
 * merely both scan. `qr` was chosen there for having no dependencies of its own,
 * which matters more here than usual: the bundle this ends up in is where a
 * wallet signature becomes a spending key, so every package that reaches it is a
 * package that could reach that.
 *
 * SVG rather than canvas, so it stays sharp at any size and needs no ref, no
 * device pixel ratio arithmetic, and no second paint. The whole code is one
 * `<path>`, because a rect per module is sixteen hundred DOM nodes for something
 * that never changes.
 */

/**
 * The light plate and the margin are not styling. Scanners look for a quiet zone
 * to find the code's edges and they expect dark modules on light, and plenty of
 * phones never lock onto an inverted code or one flush to its container. So this
 * stays light while everything around it is black.
 *
 * The encoder draws the quiet zone itself, so the matrix already includes it.
 * Adding a second one here only pads the code past what the standard asks for.
 */
const QUIET = 4;

export function QrCode({
  text,
  className,
}: {
  text: string;
  className?: string;
}) {
  const { path, span } = useMemo(() => {
    // bech32 is case insensitive and its spec asks for upper case here: an
    // all caps payload encodes in QR's alphanumeric mode rather than byte mode,
    // which takes this address from a 49 module code down to a 41 module one.
    // Both decoders accept either case, so nothing downstream notices.
    const modules = encodeQR(text.toUpperCase(), "raw", { border: QUIET }) as boolean[][];
    const n = modules.length;
    let d = "";
    for (let y = 0; y < n; y++) {
      const row = modules[y]!;
      // Merge each run of dark modules into one horizontal stroke. Fewer, larger
      // shapes also mean no hairline seams showing between neighbours.
      let x = 0;
      while (x < n) {
        if (!row[x]) {
          x++;
          continue;
        }
        let run = 1;
        while (x + run < n && row[x + run]) run++;
        d += `M${x} ${y}h${run}v1h-${run}z`;
        x += run;
      }
    }
    return { path: d, span: n };
  }, [text]);

  return (
    <svg
      viewBox={`0 0 ${span} ${span}`}
      shapeRendering="crispEdges"
      role="img"
      aria-label="Your shielded payment address as a QR code"
      className={className}
    >
      <rect width={span} height={span} fill="#f4f4ef" />
      <path d={path} fill="#0a0b0e" />
    </svg>
  );
}
