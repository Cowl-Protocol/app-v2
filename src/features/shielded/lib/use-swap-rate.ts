"use client";

/**
 * What one whole pay token buys of the receive token, asked of the venue.
 *
 * **The pair, not two dollar prices divided.** Dividing prices works only where
 * dollars are real, which is nowhere on a test chain, and it answers a different
 * question than the one a swap asks: what matters is whether a pool exists
 * between these two and what it is holding.
 *
 * **Indicative and labelled as such upstream.** This is spot for one unit. What
 * a trade settles at depends on its size and on whether it routes through the
 * wrapper, and neither is decided until the trade itself is built.
 */
import { useEffect, useState } from "react";
import { quoteUnitRate, type Quotable } from "@/lib/price";
import { useNetwork } from "@/lib/network";

export function useSwapRate(from: Quotable | null, to: Quotable | null): number | null {
  const network = useNetwork();
  const [done, setDone] = useState<{ key: string; rate: number | null } | null>(null);

  const key = from && to ? `${network.key}:${from.token}:${to.token}` : null;

  useEffect(() => {
    if (!from || !to || key === null) return;
    let live = true;

    quoteUnitRate(network, from, to)
      .then((rate) => {
        if (live) setDone({ key, rate });
      })
      .catch(() => {
        if (live) setDone({ key, rate: null });
      });

    return () => {
      live = false;
    };
  }, [network, from, to, key]);

  return done?.key === key ? done.rate : null;
}
