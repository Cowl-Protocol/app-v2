"use client";

import { useEffect, useState } from "react";

/**
 * The current time, in unix seconds, re-read on an interval.
 *
 * **One clock for a screen full of relative times.** "2h ago", "Yesterday" and
 * "Updated just now" are the same fact phrased three ways, and a component that
 * reads the clock itself renders rows that disagree with each other by however
 * long the render took. Everything that dates something takes this as an
 * argument instead.
 *
 * It ticks because the phrases go stale while somebody is looking at them: a tab
 * left open through lunch would otherwise still say a payment landed just now.
 * Thirty seconds is under the resolution of every phrase on screen, so nothing
 * ever renders a stale one, and it is not a frame loop.
 *
 * Generic on purpose, which is what earns it a place in `hooks/`: it knows
 * nothing about money, notes or this app.
 */
export function useNow(everyMs = 30_000): number {
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000));

  useEffect(() => {
    const id = window.setInterval(() => setNow(Math.floor(Date.now() / 1000)), everyMs);
    return () => window.clearInterval(id);
  }, [everyMs]);

  return now;
}
