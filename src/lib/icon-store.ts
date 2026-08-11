"use client";

/**
 * Which icon hosts are not answering, remembered.
 *
 * Ported from `app/lib/iconStore.ts`. A logo that fails still costs something to
 * try: the browser paints its broken-image placeholder for the moment before the
 * error arrives, so a wallet full of tokenized assets flickers through a row of
 * torn pictures on every visit. And the failures are not per icon. They are per
 * host and they arrive in batches, because an issuer serving every one of its
 * logos from a CDN that a region cannot reach fails all of them or none.
 *
 * So the first failure retires the whole host, and every glyph already on screen
 * hears about it and drops its image at once rather than each discovering it
 * alone. A host is given another chance after a while, since being unreachable
 * is usually temporary and pinning it forever would outlast the outage.
 *
 * **The one thing that did not come across is the persistence.** The dapp writes
 * this list to `localStorage`, which is blocked here, and blocked for a reason
 * that applies even to something this small: the list is a record of which token
 * issuers this browser has contacted, written to disk, surviving the session. It
 * would be the only thing in the app that outlives the tab, and the first
 * exception to a rule is what the second one cites. In memory the cost is one
 * flicker per host per session instead of one per six hours, which is a fair
 * price for the rule staying absolute.
 */

const RETRY_AFTER = 6 * 60 * 60 * 1000;

const retired = new Map<string, number>();
let version = 0;
const listeners = new Set<() => void>();

function hostOf(url: string): string | null {
  try {
    return new URL(url, window.location.origin).host;
  } catch {
    return null;
  }
}

/**
 * True when this icon's host has recently refused to serve.
 *
 * A path with no host, which is every icon that ships in this bundle, is never
 * dead: there is no third party to be unreachable.
 */
export function iconIsDead(url: string | undefined): boolean {
  if (!url || typeof window === "undefined") return false;
  const host = hostOf(url);
  if (!host) return false;
  const at = retired.get(host);
  if (at === undefined) return false;
  if (Date.now() - at < RETRY_AFTER) return true;
  retired.delete(host);
  return false;
}

/** Retire this icon's host. Every glyph on screen stops trying it. */
export function markIconDead(url: string): void {
  const host = hostOf(url);
  if (!host || retired.has(host)) return;
  retired.set(host, Date.now());
  version += 1;
  for (const fn of listeners) fn();
}

export function subscribeIcons(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

export function iconsVersion(): number {
  return version;
}

/**
 * The server renders before any of this can be known, so its snapshot is fixed.
 * Returning the live counter here would let the two disagree and React would
 * throw a hydration mismatch over a picture.
 */
export function iconsServerVersion(): number {
  return 0;
}
